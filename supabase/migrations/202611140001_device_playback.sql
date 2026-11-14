-- Add device listening without changing the single authoritative host or existing rooms.
alter table public.room_settings add column playback_mode text not null default 'HOST_ONLY'
  check (playback_mode in ('HOST_ONLY','ALL_DEVICES'));
create or replace function public.room_snapshot(p_actor uuid,p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare role_name text; result jsonb; begin
 select role into role_name from public.room_members where room_id=p_room and user_id=p_actor;
 if role_name is null or exists(select 1 from public.bans where room_id=p_room and user_id=p_actor) then raise exception 'PERMISSION_DENIED'; end if;
 select jsonb_build_object('server_time',clock_timestamp(),'room',to_jsonb(r),'settings',to_jsonb(s),'playback',to_jsonb(ps),'me',p_actor,'role',role_name,'version',r.version,
 'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',p.name,'role',m.role,'joined_at',m.joined_at) order by m.joined_at),'[]') from public.room_members m join public.profiles p on p.id=m.user_id where m.room_id=r.id),
 'queue',(select coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object('song',to_jsonb(song),'requester',coalesce(p.name,'Thành viên đã rời phòng'),'vote_count',(select count(*) from public.votes v where v.entry_id=q.id),'voted',exists(select 1 from public.votes v where v.entry_id=q.id and v.user_id=p_actor)) order by q.position),'[]') from public.queue_entries q join public.songs song on song.youtube_video_id=q.youtube_video_id left join public.profiles p on p.id=q.requested_by where q.room_id=r.id and q.status in ('PENDING','QUEUED','PREPARING','PLAYING')))
 into result from public.rooms r join public.room_settings s on s.room_id=r.id join public.playback_sessions ps on ps.room_id=r.id where r.id=p_room;
 return result;
end $$;

create or replace function public.room_command(p_actor uuid,p_room uuid,p_request uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms; s public.room_settings; ps public.playback_sessions; e public.queue_entries; next_e public.queue_entries; role_name text; op text:=p_command->>'action'; eid uuid:=(p_command->>'entry_id')::uuid; target uuid:=(p_command->>'user_id')::uuid; receipt private.operation_receipts; result jsonb; vid public.songs; new_run uuid; i int; entry_uuid uuid; settings_json jsonb; is_host boolean; begin
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,0));
 select * into r from public.rooms where id=p_room for update;
 if not found then raise exception 'ROOM_NOT_FOUND'; end if;
 select role into role_name from public.room_members where room_id=p_room and user_id=p_actor;
 if role_name is null or exists(select 1 from public.bans where room_id=p_room and user_id=p_actor) then raise exception 'PERMISSION_DENIED'; end if;
 select * into receipt from private.operation_receipts where actor=p_actor and request_id=p_request;
 if found then if receipt.scope<>p_room::text or receipt.payload<>(p_command-'pin'||case when p_command ? 'pin' then jsonb_build_object('pin_digest',encode(extensions.digest(p_command->>'pin','sha256'),'hex')) else '{}'::jsonb end) then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return receipt.result; end if;
 select * into s from public.room_settings where room_id=p_room;
 select * into ps from public.playback_sessions where room_id=p_room;
 is_host:=role_name in ('owner','moderator');
 if op in ('clear','approve','reject','reorder','kick','ban','unban','claim','heartbeat','release','next','ended','failed','play','pause','report','seek') and not is_host then raise exception 'PERMISSION_DENIED'; end if;
 if op in ('settings','moderator','demote','rotate_code') and role_name<>'owner' then raise exception 'PERMISSION_DENIED'; end if;
 if op='enqueue' then
 if not s.requests_enabled and not is_host then raise exception 'REQUESTS_DISABLED'; end if;
 select * into vid from public.songs where youtube_video_id=p_command->>'video_id' and verified_at>now()-interval '1 day';
 if not found then raise exception 'VIDEO_UNAVAILABLE'; end if;
 if vid.duration>s.max_duration then raise exception 'SONG_TOO_LONG'; end if;
 if (select count(*) from public.queue_entries where room_id=p_room and status in ('PENDING','QUEUED','PREPARING','PLAYING'))>=s.max_queue then raise exception 'QUEUE_FULL'; end if;
 if (select count(*) from public.queue_entries where room_id=p_room and requested_by=p_actor and status in ('PENDING','QUEUED','PREPARING','PLAYING'))>=s.max_per_member then raise exception 'MEMBER_LIMIT'; end if;
 if not s.allow_duplicates and exists(select 1 from public.queue_entries where room_id=p_room and youtube_video_id=vid.youtube_video_id and status in ('PENDING','QUEUED','PREPARING','PLAYING')) then raise exception 'SONG_ALREADY_QUEUED'; end if;
 update public.rooms set next_position=next_position+1 where id=p_room returning next_position into i;
 insert into public.queue_entries(room_id,youtube_video_id,requested_by,position,status) values(p_room,vid.youtube_video_id,p_actor,i,case when s.require_approval and not is_host then 'PENDING' else 'QUEUED' end);
 elsif op in ('remove','approve','reject','vote') then
 select * into e from public.queue_entries where id=eid and room_id=p_room;
 if not found or e.status not in ('QUEUED','PENDING') then raise exception 'NOT_FOUND'; end if;
 if op='vote' then
 if not s.voting or e.status<>'QUEUED' then raise exception 'VOTING_DISABLED'; end if;
 if (p_command->>'enabled')::boolean then insert into public.votes values(e.id,p_actor,now()) on conflict do nothing; else delete from public.votes where entry_id=e.id and user_id=p_actor; end if;
 else
 if op='remove' and not is_host and not (s.allow_remove_own and e.requested_by=p_actor) then raise exception 'PERMISSION_DENIED'; end if;
 update public.queue_entries set status=case when op='approve' then 'QUEUED' else 'REMOVED' end,updated_at=now() where id=e.id;
 end if;
 elsif op='clear' then update public.queue_entries set status='REMOVED',updated_at=now() where room_id=p_room and status in ('QUEUED','PENDING');
 elsif op='reorder' then
 if s.queue_mode<>'MANUAL' or (p_command->>'version')::bigint<>r.version then raise exception 'STALE_VERSION'; end if;
 if jsonb_array_length(p_command->'ids')<>(select count(*) from public.queue_entries where room_id=p_room and status='QUEUED') or (select count(distinct value) from jsonb_array_elements_text(p_command->'ids'))<>jsonb_array_length(p_command->'ids') then raise exception 'INVALID_INPUT'; end if;
 i:=0;
 for entry_uuid in select value::uuid from jsonb_array_elements_text(p_command->'ids') loop
 i:=i+1; update public.queue_entries set position=r.next_position+i,updated_at=now() where id=entry_uuid and room_id=p_room and status='QUEUED'; if not found then raise exception 'INVALID_INPUT'; end if;
 end loop;
 update public.rooms set next_position=next_position+i where id=p_room;
 elsif op='rotate_code' then update public.rooms set code=upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,8)) where id=p_room;
 elsif op='settings' then
 settings_json:=p_command->'settings';
 if settings_json ? 'playback_mode' and (jsonb_typeof(settings_json->'playback_mode')<>'string' or settings_json->>'playback_mode' not in ('HOST_ONLY','ALL_DEVICES')) then raise exception 'INVALID_INPUT'; end if;
 update public.room_settings set capacity=(settings_json->>'capacity')::int,max_per_member=(settings_json->>'max_per_member')::int,max_queue=(settings_json->>'max_queue')::int,max_duration=(settings_json->>'max_duration')::int,queue_mode=settings_json->>'queue_mode',playback_mode=coalesce(settings_json->>'playback_mode',s.playback_mode),voting=(settings_json->>'voting')::boolean,allow_duplicates=(settings_json->>'allow_duplicates')::boolean,allow_remove_own=(settings_json->>'allow_remove_own')::boolean,require_approval=(settings_json->>'require_approval')::boolean,auto_advance=(settings_json->>'auto_advance')::boolean,requests_enabled=(settings_json->>'requests_enabled')::boolean,locked=(settings_json->>'locked')::boolean,updated_at=now() where room_id=p_room;
 update public.rooms set name=p_command->>'name',description=p_command->>'description' where id=p_room;
 if p_command ? 'pin' then update private.room_pins set pin_hash=case when p_command->>'pin'='' then null else extensions.crypt(p_command->>'pin',extensions.gen_salt('bf',10)) end where room_id=p_room; end if;
 elsif op in ('kick','ban','unban','moderator','demote') then
 if target=r.owner_id or target=p_actor then raise exception 'PERMISSION_DENIED'; end if;
 if role_name='moderator' and exists(select 1 from public.room_members where room_id=p_room and user_id=target and role<>'member') then raise exception 'PERMISSION_DENIED'; end if;
 if op='ban' then insert into public.bans values(p_room,target,now()) on conflict do nothing; end if;
 if op='unban' then delete from public.bans where room_id=p_room and user_id=target;
 elsif op in ('moderator','demote') then update public.room_members set role=case when op='moderator' then 'moderator' else 'member' end where room_id=p_room and user_id=target;
 else delete from public.room_members where room_id=p_room and user_id=target; end if;
 if target=ps.controller_user then update public.playback_sessions set lease_until=now(),fence=fence+1,state='WAITING_FOR_HOST' where room_id=p_room; end if;
 elsif op='claim' then
 if ps.lease_until>now() and (ps.controller_id is distinct from (p_command->>'controller_id')::uuid or ps.controller_user is distinct from p_actor) then raise exception 'HOST_BUSY'; end if;
 update public.playback_sessions set controller_id=(p_command->>'controller_id')::uuid,controller_user=p_actor,fence=fence+1,lease_until=now()+interval '30 seconds',state=case when entry_id is null then 'IDLE' else 'NEEDS_USER_GESTURE' end,updated_at=now() where room_id=p_room;
 elsif op in ('heartbeat','release','next','ended','failed','play','pause','report','seek') then
 if ps.controller_id is distinct from (p_command->>'controller_id')::uuid or ps.controller_user is distinct from p_actor or ps.fence<>(p_command->>'fence')::bigint or ps.lease_until is null or ps.lease_until<=now() then raise exception 'STALE_HOST'; end if;
 if op='heartbeat' then update public.playback_sessions set lease_until=now()+interval '30 seconds',position=case when p_command ? 'run_id' and ps.run_id is not distinct from (p_command->>'run_id')::uuid then coalesce((p_command->>'position')::numeric,position) else position end,updated_at=now() where room_id=p_room;
 elsif op='release' then update public.playback_sessions set lease_until=now(),state='WAITING_FOR_HOST',fence=fence+1,updated_at=now() where room_id=p_room;
 else
 if ps.run_id is distinct from (p_command->>'run_id')::uuid then raise exception 'STALE_RUN'; end if;
 if op in ('next','ended','failed') or (op='play' and ps.entry_id is null) then
 if ps.entry_id is not null then
 update public.queue_entries set status=case op when 'ended' then 'PLAYED' when 'failed' then 'FAILED' else 'SKIPPED' end, failure_reason=case when op='failed' then 'PLAYER_ERROR' else null end,updated_at=now() where id=ps.entry_id;
 insert into public.playback_history(room_id,entry_id,run_id,status) values(p_room,ps.entry_id,ps.run_id,case op when 'ended' then 'PLAYED' when 'failed' then 'FAILED' else 'SKIPPED' end) on conflict do nothing;
 end if;
 if op='next' or op='play' or s.auto_advance then
 select q.* into next_e from public.queue_entries q where q.room_id=p_room and q.status='QUEUED'
 order by case when s.queue_mode='VOTING' then -(select count(*) from public.votes v where v.entry_id=q.id) else 0 end,
 case when s.queue_mode='FAIR' then (select count(*) from public.queue_entries x where x.room_id=p_room and x.status='QUEUED' and x.requested_by is not distinct from q.requested_by and x.position<q.position) else 0 end,
 case when s.queue_mode='FAIR' and q.requested_by=(select requested_by from public.queue_entries where id=ps.entry_id) then 1 else 0 end,q.position,q.id limit 1;
 end if;
 new_run:=case when next_e.id is not null then gen_random_uuid() else null end;
 if next_e.id is not null then update public.queue_entries set status='PREPARING',playback_run_id=new_run,updated_at=now() where id=next_e.id; end if;
 update public.playback_sessions set entry_id=next_e.id,run_id=new_run,state=case when next_e.id is null then 'IDLE' else 'LOADING' end,intent=case when next_e.id is null then 'PAUSED' else 'PLAYING' end,position=0,updated_at=now() where room_id=p_room;
 elsif op='seek' then
 if p_command->>'position' is null or (p_command->>'position')::numeric not between 0 and 86400 then raise exception 'INVALID_INPUT'; end if;
 update public.playback_sessions set position=(p_command->>'position')::numeric,updated_at=now() where room_id=p_room;
 elsif op in ('play','pause') then update public.playback_sessions set position=coalesce((p_command->>'position')::numeric,position),intent=case when op='play' then 'PLAYING' else 'PAUSED' end,updated_at=now() where room_id=p_room;
 elsif op='report' then
 update public.playback_sessions set state=coalesce(p_command->>'state',state),intent=case when p_command->>'state' in ('PLAYING','PAUSED') then p_command->>'state' else intent end,position=coalesce((p_command->>'position')::numeric,position),updated_at=now() where room_id=p_room;
 if p_command->>'state'='PLAYING' then update public.queue_entries set status='PLAYING',updated_at=now() where id=ps.entry_id; end if;
 end if;
 end if;
 else raise exception 'INVALID_INPUT'; end if;
 if op<>'heartbeat' or s.playback_mode='ALL_DEVICES' then update public.rooms set version=version+1,updated_at=now() where id=p_room; end if;
 if op in ('clear','settings','kick','ban','unban','moderator','demote','remove','approve','reject','reorder','claim','rotate_code') then insert into public.audit_logs(room_id,actor,action,details) values(p_room,p_actor,op,p_command-'pin'); end if;
 select jsonb_build_object('version',version,'playback',(select to_jsonb(p) from public.playback_sessions p where room_id=p_room)) into result from public.rooms where id=p_room;
 insert into private.operation_receipts values(p_actor,p_request,p_room::text,(p_command-'pin'||case when p_command ? 'pin' then jsonb_build_object('pin_digest',encode(extensions.digest(p_command->>'pin','sha256'),'hex')) else '{}'::jsonb end),result,now());
 return result;
end $$;
-- Replaced functions retain their ACLs; make the service-only boundary explicit.
revoke all on function public.room_snapshot(uuid,uuid), public.room_command(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.room_snapshot(uuid,uuid), public.room_command(uuid,uuid,uuid,jsonb) to service_role;
