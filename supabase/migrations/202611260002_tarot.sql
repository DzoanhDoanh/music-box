-- Tarot readings: cards and orientation are drawn once in the database, never by the browser.
-- Card ids 0–77 follow src/shared/tarot/deck.ts. Everyone in the room sees each reading.
create table private.tarot_readings (
  id uuid primary key, room_id uuid not null references public.rooms on delete cascade,
  actor uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(), result jsonb not null
);
create index on private.tarot_readings(room_id, created_at desc);
create index on private.tarot_readings(room_id, actor, created_at desc);
revoke all on private.tarot_readings from public, anon, authenticated;

create function public.tarot_snapshot(p_actor uuid,p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; last_at timestamptz;
begin
  if not exists(select 1 from public.room_members where room_id=p_room and user_id=p_actor)
    or exists(select 1 from public.bans where room_id=p_room and user_id=p_actor) then raise exception 'PERMISSION_DENIED'; end if;
  select max(created_at) into last_at from private.tarot_readings where room_id=p_room and actor=p_actor;
  select jsonb_build_object('server_time',clock_timestamp(),
    'latest',(select t.result from private.tarot_readings t where t.room_id=p_room order by t.created_at desc,t.id desc limit 1),
    'recent',(select coalesce(jsonb_agg(x.result order by x.created_at desc,x.id desc),'[]'::jsonb) from
      (select t.* from private.tarot_readings t where t.room_id=p_room order by t.created_at desc,t.id desc limit 12) x),
    'my_next_at',case when last_at+interval '20 seconds'>clock_timestamp() then last_at+interval '20 seconds' end) into result;
  return result;
end $$;

create function public.tarot_draw(p_actor uuid,p_room uuid,p_request uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.rooms; receipt private.operation_receipts; spread text:=p_command->>'spread'; topic text:=p_command->>'topic';
  question text; n int; cards jsonb:='[]'; picked int[]:='{}'; bytes bytea; sample bigint; card int;
  result jsonb; reading_id uuid:=gen_random_uuid(); at_time timestamptz; who text;
begin
  if p_actor is null or p_request is null or p_room is null then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,0));
  select * into r from public.rooms where id=p_room for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if not exists(select 1 from public.room_members where room_id=p_room and user_id=p_actor)
    or exists(select 1 from public.bans where room_id=p_room and user_id=p_actor) then raise exception 'PERMISSION_DENIED'; end if;
  select * into receipt from private.operation_receipts where actor=p_actor and request_id=p_request;
  if found then
    if receipt.scope<>'tarot:'||p_room::text or receipt.payload is distinct from p_command then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return receipt.result;
  end if;
  if not p_actor=any(private.online_members(p_room)) then raise exception 'PRESENCE_REQUIRED'; end if;
  if p_command->>'action' is distinct from 'draw' or spread is null or spread not in ('ONE','THREE','YES_NO')
    or topic is null or topic not in ('GENERAL','LOVE','WORK','MONEY')
    or jsonb_typeof(p_command->'question') is distinct from 'string'
    or (p_command - array['action','spread','topic','question']) <> '{}'::jsonb then raise exception 'INVALID_INPUT'; end if;
  question:=p_command->>'question';
  if question<>btrim(question) or char_length(question)>200 or question ~ '[[:cntrl:]]'
    or (spread='YES_NO' and question='') then raise exception 'INVALID_INPUT'; end if;
  at_time:=clock_timestamp();
  if exists(select 1 from private.tarot_readings where room_id=p_room and actor=p_actor and created_at>at_time-interval '20 seconds')
    then raise exception 'TAROT_BUSY'; end if;
  n:=case spread when 'THREE' then 3 else 1 end;
  -- Uniform rejection sampling over 32-bit cryptographic randomness; distinct cards, then one coin per card.
  while coalesce(cardinality(picked),0)<n loop
    bytes:=extensions.gen_random_bytes(4);
    sample:=get_byte(bytes,0)::bigint*16777216+get_byte(bytes,1)::bigint*65536+get_byte(bytes,2)::bigint*256+get_byte(bytes,3);
    continue when sample>=4294967296-mod(4294967296,78);
    card:=mod(sample,78)::int;
    continue when card=any(picked);
    picked:=picked||card;
    cards:=cards||jsonb_build_array(jsonb_build_object('card',card,
      'reversed',get_byte(extensions.gen_random_bytes(1),0)>=128));
  end loop;
  select name into who from public.profiles where id=p_actor;
  result:=jsonb_build_object('id',reading_id,'actor',p_actor,'actor_name',coalesce(who,'Thành viên'),
    'spread',spread,'topic',topic,'question',question,'cards',cards,'created_at',at_time,
    'reveal_at',at_time+make_interval(secs=>(1500+900*n)/1000.0));
  insert into private.tarot_readings(id,room_id,actor,created_at,result) values(reading_id,p_room,p_actor,at_time,result);
  insert into private.operation_receipts values(p_actor,p_request,'tarot:'||p_room::text,p_command,result,at_time);
  delete from private.tarot_readings where room_id=p_room and (created_at<at_time-interval '30 days' or id in (
    select id from private.tarot_readings where room_id=p_room order by created_at desc,id desc offset 100));
  update public.rooms set version=version+1,updated_at=at_time where id=p_room;
  return result;
end $$;
revoke all on function public.tarot_snapshot(uuid,uuid),public.tarot_draw(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.tarot_snapshot(uuid,uuid),public.tarot_draw(uuid,uuid,uuid,jsonb) to service_role;
