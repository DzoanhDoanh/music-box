-- Wheel results and rewards are chosen once in the room transaction, never by the browser.
alter table public.queue_entries add column priority bigint not null default 0 check(priority >= 0);
create table private.wheel_spins (
  id uuid primary key, room_id uuid not null references public.rooms on delete cascade,
  created_at timestamptz not null default now(), result jsonb not null
);
create index on private.wheel_spins(room_id, created_at desc);
revoke all on private.wheel_spins from public, anon, authenticated;

create or replace function private.queued_order(p_room uuid) returns uuid[] language sql stable set search_path='' as $$
  select coalesce(array_agg(id order by priority desc,position,id),'{}'::uuid[])
  from public.queue_entries where room_id=p_room and status='QUEUED';
$$;

create function public.wheel_snapshot(p_actor uuid,p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not exists(select 1 from public.room_members where room_id=p_room and user_id=p_actor)
    or exists(select 1 from public.bans where room_id=p_room and user_id=p_actor) then raise exception 'PERMISSION_DENIED'; end if;
  select jsonb_build_object('server_time',clock_timestamp(),
    'online',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'label',p.name,'queued',
      (select count(*) from public.queue_entries q where q.room_id=p_room and q.requested_by=p.id and q.status='QUEUED')) order by p.id),'[]'::jsonb)
      from public.profiles p where p.id=any(private.online_members(p_room))),
    'latest',(select w.result from private.wheel_spins w where w.room_id=p_room order by w.created_at desc,w.id desc limit 1),
    'recent',(select coalesce(jsonb_agg(x.result order by x.created_at desc,x.id desc),'[]'::jsonb) from
      (select w.* from private.wheel_spins w where w.room_id=p_room order by w.created_at desc,w.id desc limit 10) x)) into result;
  return result;
end $$;

create function public.wheel_spin(p_actor uuid,p_room uuid,p_request uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.rooms; receipt private.operation_receipts; previous private.wheel_spins;
  mode text:=p_command->>'mode'; reward text:=p_command->>'reward'; choices jsonb;
  n int; idx int; bytes bytea; sample bigint; ceiling bigint; chosen jsonb; result jsonb;
  rewarded jsonb:='[]'; entry record; ticket bigint; take_count int; spin_id uuid:=gen_random_uuid(); at_time timestamptz;
begin
  if p_actor is null or p_request is null or p_room is null then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,0));
  select * into r from public.rooms where id=p_room for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if not exists(select 1 from public.room_members where room_id=p_room and user_id=p_actor)
    or exists(select 1 from public.bans where room_id=p_room and user_id=p_actor) then raise exception 'PERMISSION_DENIED'; end if;
  select * into receipt from private.operation_receipts where actor=p_actor and request_id=p_request;
  if found then
    if receipt.scope<>'wheel:'||p_room::text or receipt.payload is distinct from p_command then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return receipt.result;
  end if;
  if not p_actor=any(private.online_members(p_room)) then raise exception 'PRESENCE_REQUIRED'; end if;
  if p_command->>'action' is distinct from 'spin' or mode is null or mode not in ('MEMBERS','CUSTOM')
    or reward is null or reward not in ('NONE','LATEST_FIRST','TWO_FIRST')
    or jsonb_typeof(p_command->'labels') is distinct from 'array'
    or not p_command ? 'previous_id'
    or (p_command - array['action','mode','reward','labels','previous_id']) <> '{}'::jsonb then raise exception 'INVALID_INPUT'; end if;
  at_time:=clock_timestamp();
  select * into previous from private.wheel_spins where room_id=p_room order by created_at desc,id desc limit 1;
  if previous.id is distinct from (p_command->>'previous_id')::uuid then raise exception 'WHEEL_STALE'; end if;
  if previous.created_at>at_time-interval '10 seconds' then raise exception 'WHEEL_BUSY'; end if;
  if mode='CUSTOM' then
    if reward<>'NONE' or jsonb_array_length(p_command->'labels') not between 2 and 50 then raise exception 'INVALID_INPUT'; end if;
    if exists(select 1 from jsonb_array_elements(p_command->'labels') x where jsonb_typeof(x)<>'string') then raise exception 'INVALID_INPUT'; end if;
    if exists(select 1 from jsonb_array_elements_text(p_command->'labels') x where length(btrim(x)) not between 1 and 60 or x ~ '[[:cntrl:]]')
      or (select count(distinct lower(btrim(x))) from jsonb_array_elements_text(p_command->'labels') x)<>jsonb_array_length(p_command->'labels') then raise exception 'INVALID_INPUT'; end if;
    select jsonb_agg(jsonb_build_object('id',ord::text,'label',btrim(label)) order by ord) into choices
      from jsonb_array_elements_text(p_command->'labels') with ordinality x(label,ord);
  else
    if jsonb_array_length(p_command->'labels')<>0 then raise exception 'INVALID_INPUT'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'label',p.name) order by p.id),'[]') into choices from public.profiles p
      where p.id=any(private.online_members(p_room)) and (reward='NONE' or exists(
        select 1 from public.queue_entries q where q.room_id=p_room and q.requested_by=p.id and q.status='QUEUED'));
  end if;
  n:=jsonb_array_length(choices);
  if n<2 then raise exception 'WHEEL_EMPTY'; end if;
  -- Uniform rejection sampling over a 32-bit cryptographically random value.
  ceiling:=4294967296 - mod(4294967296::bigint,n::bigint);
  loop
    bytes:=extensions.gen_random_bytes(4);
    sample:=get_byte(bytes,0)::bigint*16777216+get_byte(bytes,1)::bigint*65536+get_byte(bytes,2)::bigint*256+get_byte(bytes,3);
    exit when sample<ceiling;
  end loop;
  idx:=mod(sample,n)::int; chosen:=choices->idx;
  if reward<>'NONE' then
    take_count:=case reward when 'TWO_FIRST' then 2 else 1 end;
    select coalesce(max(priority),0)+take_count into ticket from public.queue_entries where room_id=p_room and status='QUEUED';
    for entry in select q.id,s.title from public.queue_entries q join public.songs s on s.youtube_video_id=q.youtube_video_id
      where q.room_id=p_room and q.requested_by=(chosen->>'id')::uuid and q.status='QUEUED'
      order by q.created_at desc,q.id desc limit take_count loop
      update public.queue_entries set priority=ticket,updated_at=at_time where id=entry.id;
      rewarded:=rewarded||jsonb_build_array(jsonb_build_object('id',entry.id,'title',entry.title));
      ticket:=ticket-1;
    end loop;
    -- A wheel award is an explicitly authorized exception to consent. Old proposals cannot overwrite it.
    update private.reorder_proposals set status='STALE' where room_id=p_room and status='OPEN';
  end if;
  result:=jsonb_build_object('id',spin_id,'mode',mode,'reward',reward,'choices',choices,'winner_index',idx,
    'winner',chosen,'actor',p_actor,'created_at',at_time,'reveal_at',at_time+interval '5 seconds',
    'next_spin_at',at_time+interval '10 seconds','rewarded',rewarded);
  insert into private.wheel_spins(id,room_id,created_at,result) values(spin_id,p_room,at_time,result);
  insert into private.operation_receipts values(p_actor,p_request,'wheel:'||p_room::text,p_command,result,at_time);
  delete from private.wheel_spins where room_id=p_room and (created_at<at_time-interval '30 days' or id in (
    select id from private.wheel_spins where room_id=p_room order by created_at desc,id desc offset 100));
  update public.rooms set version=version+1,updated_at=at_time where id=p_room;
  return result;
end $$;
revoke all on function public.wheel_snapshot(uuid,uuid),public.wheel_spin(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.wheel_snapshot(uuid,uuid),public.wheel_spin(uuid,uuid,uuid,jsonb) to service_role;

-- Preserve the established room transaction; only reward priority and explicit reordering change.
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
 i:=i+1; update public.queue_entries set position=r.next_position+i,priority=0,updated_at=now() where id=entry_uuid and room_id=p_room and status='QUEUED';
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
 i:=i+1; update public.queue_entries set position=r.next_position+i,priority=0,updated_at=now() where id=entry_uuid and room_id=p_room and status='QUEUED'; if not found then raise exception 'INVALID_INPUT'; end if;
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
 order by q.priority desc,case when s.queue_mode='VOTING' then -(select count(*) from public.votes v where v.entry_id=q.id) else 0 end,
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
