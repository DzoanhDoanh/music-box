-- Consensus is enforced in the same room transaction as queue mutations.
alter table public.room_settings add column reorder_approval boolean not null default false;
alter table public.room_settings add constraint reorder_approval_manual check (not reorder_approval or queue_mode='MANUAL');

create table private.room_presence (
 room_id uuid not null references public.rooms on delete cascade,
 user_id uuid not null references auth.users on delete cascade,
 session_id uuid not null, sequence bigint not null check(sequence>0),
 expires_at timestamptz not null, primary key(room_id,user_id,session_id)
);
create index on private.room_presence(room_id,expires_at);
create table private.reorder_proposals (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.rooms on delete cascade,
 entry_id uuid not null references public.queue_entries on delete cascade,
 requested_by uuid references auth.users on delete set null,
 target_position integer not null check(target_position between 1 and 500),
 queue_order uuid[] not null, electorate uuid[] not null,
 required_votes integer not null check(required_votes>=2),
 status text not null default 'OPEN' check(status in ('OPEN','APPLIED','REJECTED','CANCELLED','EXPIRED','STALE')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '2 minutes'
);
create unique index one_open_reorder_proposal on private.reorder_proposals(room_id) where status='OPEN';
create index on private.reorder_proposals(room_id,created_at desc);
create table private.reorder_votes (
 proposal_id uuid not null references private.reorder_proposals on delete cascade,
 user_id uuid not null references auth.users on delete cascade,
 approved boolean not null, primary key(proposal_id,user_id)
);
revoke all on private.room_presence,private.reorder_proposals,private.reorder_votes from public,anon,authenticated;

create function private.queued_order(p_room uuid) returns uuid[] language sql stable set search_path='' as $$
 select coalesce(array_agg(id order by position,id),'{}'::uuid[]) from public.queue_entries where room_id=p_room and status='QUEUED';
$$;
create function private.online_members(p_room uuid) returns uuid[] language sql stable set search_path='' as $$
 select coalesce(array_agg(m.user_id order by m.user_id),'{}'::uuid[]) from public.room_members m
 where m.room_id=p_room and not exists(select 1 from public.bans b where b.room_id=p_room and b.user_id=m.user_id)
 and exists(select 1 from private.room_presence p where p.room_id=p_room and p.user_id=m.user_id and p.expires_at>now());
$$;
create function public.room_presence(p_actor uuid,p_room uuid,p_session uuid,p_sequence bigint,p_online boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare before_online uuid[]; after_online uuid[]; begin
 perform 1 from public.rooms where id=p_room for update;
 if not found then raise exception 'ROOM_NOT_FOUND'; end if;
 if not exists(select 1 from public.room_members where room_id=p_room and user_id=p_actor) or exists(select 1 from public.bans where room_id=p_room and user_id=p_actor) then raise exception 'PERMISSION_DENIED'; end if;
 if p_session is null or p_sequence is null or p_sequence<1 or p_online is null then raise exception 'INVALID_INPUT'; end if;
 before_online:=private.online_members(p_room);
 insert into private.room_presence values(p_room,p_actor,p_session,p_sequence,case when p_online then now()+interval '60 seconds' else now() end)
 on conflict(room_id,user_id,session_id) do update set sequence=excluded.sequence,expires_at=excluded.expires_at where private.room_presence.sequence<excluded.sequence;
 -- Keep closed-session tombstones for delayed requests; old heartbeats cannot revive a closed tab.
 delete from private.room_presence where room_id=p_room and expires_at<now()-interval '1 day';
 after_online:=private.online_members(p_room);
 if before_online is distinct from after_online then update public.rooms set version=version+1,updated_at=now() where id=p_room; end if;
 return jsonb_build_object('online_count',cardinality(after_online));
end $$;

create function private.reorder_status(p_id uuid) returns text language sql stable set search_path='' as $$
 select case when p.status<>'OPEN' then p.status
 when p.expires_at<=now() then 'EXPIRED'
 when not s.reorder_approval or s.queue_mode<>'MANUAL' then 'CANCELLED'
 when exists(select 1 from unnest(p.electorate) u(id) where not exists(select 1 from public.room_members m where m.room_id=p.room_id and m.user_id=u.id) or exists(select 1 from public.bans b where b.room_id=p.room_id and b.user_id=u.id)) then 'CANCELLED'
 when p.queue_order is distinct from private.queued_order(p.room_id) then 'STALE'
 else 'OPEN' end
 from private.reorder_proposals p join public.room_settings s on s.room_id=p.room_id where p.id=p_id;
$$;
create function private.reorder_snapshot(p_actor uuid,p_room uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('online_count',cardinality(private.online_members(p_room)),
 'proposal',(select jsonb_build_object(
 'id',p.id,'entry_id',p.entry_id,'title',s.title,'requested_by',p.requested_by,'requester',coalesce(profile.name,'Thành viên'),
 'target_position',p.target_position,'from_position',array_position(p.queue_order,p.entry_id),
 'electorate_count',cardinality(p.electorate),'required_votes',p.required_votes,'expires_at',p.expires_at,
 'yes_votes',(select count(*) from private.reorder_votes v where v.proposal_id=p.id and v.approved),
 'no_votes',(select count(*) from private.reorder_votes v where v.proposal_id=p.id and not v.approved),
 'my_vote',(select approved from private.reorder_votes v where v.proposal_id=p.id and v.user_id=p_actor),
 'eligible',p_actor=any(p.electorate),'status',private.reorder_status(p.id))
 from private.reorder_proposals p join public.queue_entries q on q.id=p.entry_id join public.songs s on s.youtube_video_id=q.youtube_video_id
 left join public.profiles profile on profile.id=p.requested_by
 where p.room_id=p_room order by p.created_at desc,p.id desc limit 1));
$$;
revoke all on function private.queued_order(uuid),private.online_members(uuid),private.reorder_status(uuid),private.reorder_snapshot(uuid,uuid) from public,anon,authenticated;
revoke all on function public.room_presence(uuid,uuid,uuid,bigint,boolean) from public,anon,authenticated;
grant execute on function public.room_presence(uuid,uuid,uuid,bigint,boolean) to service_role;

create or replace function public.room_snapshot(p_actor uuid,p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare role_name text; result jsonb; begin
 select role into role_name from public.room_members where room_id=p_room and user_id=p_actor;
 if role_name is null or exists(select 1 from public.bans where room_id=p_room and user_id=p_actor) then raise exception 'PERMISSION_DENIED'; end if;
 select jsonb_build_object('server_time',clock_timestamp(),'room',to_jsonb(r),'settings',to_jsonb(s),'playback',to_jsonb(ps),'me',p_actor,'role',role_name,'version',r.version,
 'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',p.name,'role',m.role,'joined_at',m.joined_at) order by m.joined_at),'[]') from public.room_members m join public.profiles p on p.id=m.user_id where m.room_id=r.id),
 'queue',(select coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object('song',to_jsonb(song),'requester',coalesce(p.name,'Thành viên đã rời phòng'),'vote_count',(select count(*) from public.votes v where v.entry_id=q.id),'voted',exists(select 1 from public.votes v where v.entry_id=q.id and v.user_id=p_actor)) order by q.position),'[]') from public.queue_entries q join public.songs song on song.youtube_video_id=q.youtube_video_id left join public.profiles p on p.id=q.requested_by where q.room_id=r.id and q.status in ('PENDING','QUEUED','PREPARING','PLAYING')))
 into result from public.rooms r join public.room_settings s on s.room_id=r.id join public.playback_sessions ps on ps.room_id=r.id where r.id=p_room;
 return result||jsonb_build_object('reorder',private.reorder_snapshot(p_actor,p_room));
end $$;

create or replace function public.room_command(p_actor uuid,p_room uuid,p_request uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms; s public.room_settings; ps public.playback_sessions; e public.queue_entries; next_e public.queue_entries; role_name text; op text:=p_command->>'action'; eid uuid:=(p_command->>'entry_id')::uuid; target uuid:=(p_command->>'user_id')::uuid; receipt private.operation_receipts; result jsonb; vid public.songs; new_run uuid; i int; entry_uuid uuid; settings_json jsonb; is_host boolean; proposal private.reorder_proposals; ordered_ids uuid[]; voters uuid[]; approval_count int; rejection_count int; target_index int; begin
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

 update private.reorder_proposals set status=private.reorder_status(id) where room_id=p_room and status='OPEN';
 if op in ('reorder.propose','reorder.vote','reorder.cancel') then
 if not s.reorder_approval or s.queue_mode<>'MANUAL' then raise exception 'REORDER_VOTING_DISABLED'; end if;
 if op='reorder.propose' then
 if exists(select 1 from private.reorder_proposals where room_id=p_room and status='OPEN') then raise exception 'PROPOSAL_EXISTS'; end if;
 voters:=private.online_members(p_room);
 if not p_actor=any(voters) then raise exception 'PRESENCE_REQUIRED'; end if;
 if cardinality(voters)<2 then raise exception 'NOT_ENOUGH_ONLINE'; end if;
 ordered_ids:=private.queued_order(p_room); target_index:=(p_command->>'position')::int;
 -- Avoid proposals based on a stale client order without coupling to playback heartbeats.
 if p_command->'queue_ids' is distinct from to_jsonb(ordered_ids) then raise exception 'QUEUE_CHANGED'; end if;
 if eid is null or not eid=any(ordered_ids) or target_index is null or target_index<1 or target_index>cardinality(ordered_ids) or array_position(ordered_ids,eid)=target_index then raise exception 'INVALID_INPUT'; end if;
 insert into private.reorder_proposals(room_id,entry_id,requested_by,target_position,queue_order,electorate,required_votes)
 values(p_room,eid,p_actor,target_index,ordered_ids,voters,greatest(2,cardinality(voters)/2+1)) returning * into proposal;
 insert into private.reorder_votes values(proposal.id,p_actor,true);
 elsif op in ('reorder.vote','reorder.cancel') then
 select * into proposal from private.reorder_proposals where id=(p_command->>'proposal_id')::uuid and room_id=p_room for update;
 if not found or proposal.status<>'OPEN' then raise exception 'PROPOSAL_CLOSED'; end if;
 if op='reorder.cancel' then
 if proposal.requested_by is distinct from p_actor and not is_host then raise exception 'PERMISSION_DENIED'; end if;
 update private.reorder_proposals set status='CANCELLED' where id=proposal.id;
 else
 if not p_actor=any(proposal.electorate) then raise exception 'NOT_ELIGIBLE'; end if;
 if not p_actor=any(private.online_members(p_room)) then raise exception 'PRESENCE_REQUIRED'; end if;
 if jsonb_typeof(p_command->'approved') is distinct from 'boolean' then raise exception 'INVALID_INPUT'; end if;
 insert into private.reorder_votes values(proposal.id,p_actor,(p_command->>'approved')::boolean)
 on conflict(proposal_id,user_id) do update set approved=excluded.approved;
 select count(*) filter(where approved),count(*) filter(where not approved) into approval_count,rejection_count from private.reorder_votes where proposal_id=proposal.id;
 if approval_count>=proposal.required_votes then
 ordered_ids:=array_remove(proposal.queue_order,proposal.entry_id);
 ordered_ids:=coalesce(ordered_ids[1:proposal.target_position-1],'{}'::uuid[])||array[proposal.entry_id]||coalesce(ordered_ids[proposal.target_position:cardinality(ordered_ids)],'{}'::uuid[]);
 i:=0;
 foreach entry_uuid in array ordered_ids loop
 i:=i+1; update public.queue_entries set position=r.next_position+i,updated_at=now() where id=entry_uuid and room_id=p_room and status='QUEUED';
 end loop;
 update public.rooms set next_position=next_position+i where id=p_room;
 update private.reorder_proposals set status='APPLIED' where id=proposal.id;
 elsif rejection_count>cardinality(proposal.electorate)-proposal.required_votes then
 update private.reorder_proposals set status='REJECTED' where id=proposal.id;
 end if;
 end if;
 end if;
 elsif op='enqueue' then
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
 if s.reorder_approval then raise exception 'REORDER_REQUIRES_APPROVAL'; end if;
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
 if settings_json ? 'reorder_approval' and jsonb_typeof(settings_json->'reorder_approval')<>'boolean' then raise exception 'INVALID_INPUT'; end if;
 if coalesce((settings_json->>'reorder_approval')::boolean,s.reorder_approval) and settings_json->>'queue_mode'<>'MANUAL' then raise exception 'INVALID_INPUT'; end if;
 if settings_json ? 'playback_mode' and (jsonb_typeof(settings_json->'playback_mode')<>'string' or settings_json->>'playback_mode' not in ('HOST_ONLY','ALL_DEVICES')) then raise exception 'INVALID_INPUT'; end if;
 update public.room_settings set reorder_approval=coalesce((settings_json->>'reorder_approval')::boolean,s.reorder_approval),capacity=(settings_json->>'capacity')::int,max_per_member=(settings_json->>'max_per_member')::int,max_queue=(settings_json->>'max_queue')::int,max_duration=(settings_json->>'max_duration')::int,queue_mode=settings_json->>'queue_mode',playback_mode=coalesce(settings_json->>'playback_mode',s.playback_mode),voting=(settings_json->>'voting')::boolean,allow_duplicates=(settings_json->>'allow_duplicates')::boolean,allow_remove_own=(settings_json->>'allow_remove_own')::boolean,require_approval=(settings_json->>'require_approval')::boolean,auto_advance=(settings_json->>'auto_advance')::boolean,requests_enabled=(settings_json->>'requests_enabled')::boolean,locked=(settings_json->>'locked')::boolean,updated_at=now() where room_id=p_room;
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
 update private.reorder_proposals set status=private.reorder_status(id) where room_id=p_room and status='OPEN';
 if op<>'heartbeat' or s.playback_mode='ALL_DEVICES' then update public.rooms set version=version+1,updated_at=now() where id=p_room; end if;
 if op in ('reorder.propose','reorder.vote','reorder.cancel','clear','settings','kick','ban','unban','moderator','demote','remove','approve','reject','reorder','claim','rotate_code') then insert into public.audit_logs(room_id,actor,action,details) values(p_room,p_actor,op,p_command-'pin'); end if;
 select jsonb_build_object('version',version,'playback',(select to_jsonb(p) from public.playback_sessions p where room_id=p_room)) into result from public.rooms where id=p_room;
 insert into private.operation_receipts values(p_actor,p_request,p_room::text,(p_command-'pin'||case when p_command ? 'pin' then jsonb_build_object('pin_digest',encode(extensions.digest(p_command->>'pin','sha256'),'hex')) else '{}'::jsonb end),result,now());
 return result;
end $$;
-- Replaced functions retain their ACLs; make the service-only boundary explicit.
revoke all on function public.room_snapshot(uuid,uuid), public.room_command(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.room_snapshot(uuid,uuid), public.room_command(uuid,uuid,uuid,jsonb) to service_role;

create or replace function public.maintenance_cleanup() returns void language plpgsql security definer set search_path='' as $$ begin
 delete from public.youtube_search_cache where expires_at<now();
 delete from private.rate_limits where window_at<now()-interval '2 days';
 delete from private.operation_receipts where created_at<now()-interval '7 days';
 delete from private.room_presence where expires_at<now()-interval '1 day';
 delete from private.reorder_proposals where created_at<now()-interval '30 days';
 update public.songs set title='Video cần cập nhật',channel='',thumbnail='/favicon.svg',duration=1 where verified_at<now()-interval '29 days' and title<>'Video cần cập nhật';
end $$;
revoke all on function public.maintenance_cleanup() from public,anon,authenticated;
grant execute on function public.maintenance_cleanup() to service_role;
