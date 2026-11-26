-- Tarot readings may cost coins from the shared wallet, paid by the person who draws:
-- 1 card 200, 3 cards 500, yes/no 300. The room still sees every reading for free.
-- Each room's owner switches charging on or off for that room in the room settings (on by default).
-- Same rules as 202611260003 otherwise; the snapshot also reports the viewer's spendable coins.
create table private.tarot_room_settings(room_id uuid primary key references public.rooms on delete cascade,
  paid boolean not null default true, updated_by uuid references auth.users on delete set null,
  updated_at timestamptz not null default now());
revoke all on private.tarot_room_settings from public, anon, authenticated;

create function private.tarot_paid(p_room uuid) returns boolean language sql stable set search_path='' as $$
  select coalesce((select paid from private.tarot_room_settings where room_id=p_room),true)
$$;

create function public.tarot_configure(p_actor uuid,p_room uuid,p_paid boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_actor is null or p_room is null or p_paid is null then raise exception 'INVALID_INPUT'; end if;
  perform 1 from public.rooms where id=p_room for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if not exists(select 1 from public.room_members where room_id=p_room and user_id=p_actor and role='owner')
    or exists(select 1 from public.bans where room_id=p_room and user_id=p_actor) then raise exception 'PERMISSION_DENIED'; end if;
  insert into private.tarot_room_settings(room_id,paid,updated_by) values(p_room,p_paid,p_actor)
    on conflict(room_id) do update set paid=excluded.paid,updated_by=excluded.updated_by,updated_at=now();
  insert into public.audit_logs(room_id,actor,action,details) values(p_room,p_actor,'tarot.settings',jsonb_build_object('paid',p_paid));
  update public.rooms set version=version+1,updated_at=now() where id=p_room;
  return jsonb_build_object('paid',p_paid);
end $$;
revoke all on function public.tarot_configure(uuid,uuid,boolean),private.tarot_paid(uuid) from public,anon,authenticated;
grant execute on function public.tarot_configure(uuid,uuid,boolean) to service_role;

create or replace function public.tarot_snapshot(p_actor uuid,p_room uuid) returns jsonb
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
    'my_next_at',case when last_at+interval '20 seconds'>clock_timestamp() then last_at+interval '20 seconds' end,
    -- Spendable coins; someone without a wallet yet will receive the welcome grant on first use.
    'paid',private.tarot_paid(p_room),
    'can_configure',exists(select 1 from public.room_members where room_id=p_room and user_id=p_actor and role='owner'),
    'my_coins',coalesce((select w.available from public.coin_wallets w where w.user_id=p_actor),
      (select (e.settings->>'initial')::bigint from private.bau_economy e))) into result;
  return result;
end $$;

create or replace function public.tarot_draw(p_actor uuid,p_room uuid,p_request uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.rooms; receipt private.operation_receipts; spread text:=p_command->>'spread'; topic text:=p_command->>'topic';
  question text; n int; cards jsonb:='[]'; picked int[]:='{}'; bytes bytea; sample bigint; card int;
  result jsonb; reading_id uuid:=gen_random_uuid(); at_time timestamptz; who text; cost bigint; wallet public.coin_wallets;
begin
  if p_actor is null or p_request is null or p_room is null then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,0));
  -- Economy lock first, as every coin writer takes it before any room row.
  perform private.bau_lock();
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
  -- The person who draws pays from the shared coin wallet (Bầu Cua, Đua Vịt); a first-time player gets the welcome grant.
  cost:=case when not private.tarot_paid(p_room) then 0
    when spread='ONE' then 200 when spread='THREE' then 500 else 300 end;
  if cost>0 then
    perform private.bau_wallet(p_actor);
    select * into wallet from public.coin_wallets where user_id=p_actor for update;
    if wallet.available<cost then raise exception 'TAROT_INSUFFICIENT_COINS'; end if;
  end if;
  n:=case spread when 'ONE' then 1 else 3 end;
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
    'reveal_at',at_time+make_interval(secs=>(1500+900*n)/1000.0),'cost',cost);
  insert into private.tarot_readings(id,room_id,actor,created_at,result) values(reading_id,p_room,p_actor,at_time,result);
  if cost>0 then
    perform private.bau_money(p_actor,-cost,0,'TAROT_READING','tarot:'||reading_id::text);
    -- Only a change hint: the wallet itself needs an authorized read.
    perform realtime.send(jsonb_build_object('user',p_actor),'wallet.updated','room:'||p_room::text,true);
  end if;
  insert into private.operation_receipts values(p_actor,p_request,'tarot:'||p_room::text,p_command,result,at_time);
  delete from private.tarot_readings where room_id=p_room and (created_at<at_time-interval '30 days' or id in (
    select id from private.tarot_readings where room_id=p_room order by created_at desc,id desc offset 100));
  update public.rooms set version=version+1,updated_at=at_time where id=p_room;
  return result;
end $$;
