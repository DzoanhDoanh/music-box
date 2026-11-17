create function private.bau_round_view(r public.bau_cua_rounds) returns jsonb language sql stable set search_path='' as $$
 select to_jsonb(r)||jsonb_build_object('bets',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('name',coalesce(p.name,'Thành viên đã rời'))) from public.bau_cua_bets b left join public.profiles p on p.id=b.user_id where b.round_id=r.id),'[]'::jsonb))
$$;
create function private.bau_system_admin(u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.system_admins a join auth.users p on p.id=a.user_id where a.user_id=u and not coalesce(p.is_anonymous,true))
$$;
create function private.bau_view(u uuid,room uuid,t uuid) returns jsonb language plpgsql set search_path='' as $$
declare s jsonb; e jsonb; m public.bau_cua_tables; r public.bau_cua_rounds; w public.coin_wallets; role_name text; manager boolean; restore boolean; last_relief timestamptz;
begin
 role_name:=private.game_access(room,u);
 select settings into s from public.bau_cua_settings where room_id=room;
 select settings into e from private.bau_economy;
 select * into w from public.coin_wallets where user_id=u;
 manager:=role_name='owner' or (role_name='moderator' and (s->>'moderatorManage')::boolean);
 restore:=role_name='owner' or (role_name='moderator' and (s->>'moderatorRestore')::boolean);
 select max(created_at) into last_relief from public.coin_claims where user_id=u and kind='RELIEF';
 if t is not null then
 select * into m from public.bau_cua_tables where id=t and room_id=room;
 if not found then raise exception 'NOT_FOUND'; end if;
 if exists(select 1 from public.bau_cua_table_members where table_id=t and user_id=u and banned) then raise exception 'PERMISSION_DENIED'; end if;
 if not (s->>'spectators')::boolean and not manager and not exists(select 1 from public.bau_cua_table_members where table_id=t and user_id=u and not spectator) then raise exception 'PERMISSION_DENIED'; end if;
 select * into r from public.bau_cua_rounds where table_id=t order by number desc limit 1;
 end if;
 return jsonb_build_object('serverNow',floor(extract(epoch from statement_timestamp())*1000),'settings',s,'economy',e,
 'wallet',to_jsonb(w),'ledger',coalesce((select jsonb_agg(x order by x.id desc) from(select * from public.coin_ledger where user_id=u order by id desc limit 50)x),'[]'::jsonb),
 'canDaily',(e->>'dailyEnabled')::boolean and not exists(select 1 from public.coin_claims where user_id=u and kind='DAILY' and claim_key=(now() at time zone (e->>'timezone'))::date::text),
 'canRelief',(e->>'reliefEnabled')::boolean and w.total<(e->>'reliefThreshold')::bigint and (last_relief is null or last_relief<=now()-make_interval(hours=>(e->>'reliefHours')::int)),
 'reliefAt',last_relief+make_interval(hours=>(e->>'reliefHours')::int),
 'tables',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('members',(select count(*) from public.bau_cua_table_members b where b.table_id=x.id and not b.spectator and not b.banned))) from(select * from public.bau_cua_tables where room_id=room and not closed order by created_at desc limit 20)x),'[]'::jsonb),
 'table',case when m.id is null then null else to_jsonb(m) end,
 'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',b.user_id,'name',p.name,'spectator',b.spectator,'banned',b.banned,'online',b.online_until>now()) order by b.created_at) from public.bau_cua_table_members b join public.profiles p on p.id=b.user_id where b.table_id=t and (not b.banned or manager)),'[]'::jsonb),
 'dealerQueue',coalesce((select jsonb_agg(jsonb_build_object('user_id',q.user_id,'name',p.name) order by q.position) from public.bau_cua_dealer_queue q join public.profiles p on p.id=q.user_id where q.table_id=t),'[]'::jsonb),
 'dealerAvailable',(select available from public.coin_wallets where user_id=m.dealer_id),'round',case when r.id is null then null else private.bau_round_view(r) end,
 'history',coalesce((select jsonb_agg(private.bau_round_view(x) order by x.number desc) from (select * from public.bau_cua_rounds where table_id=t and status in ('RESULT','CANCELLED') and ((s->>'publishHistory')::boolean or manager) order by number desc limit 20)x),'[]'::jsonb),
 'penalties',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('name',coalesce((select name from public.profiles where id=x.user_id),'Thành viên đã rời'),'songs',coalesce((select jsonb_agg(jsonb_build_object('id',b.entry_id,'title',b.title,'restored',b.restored)) from public.bau_cua_penalty_songs b where b.penalty_id=x.id),'[]'::jsonb)) order by x.created_at desc) from(select * from public.bau_cua_penalty_executions where room_id=room and (announce or user_id=u or manager or restore) order by created_at desc limit 30)x),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('name',coalesce((select name from public.profiles where id=x.actor),'Hệ thống')) order by x.id desc) from(select * from public.bau_cua_round_events where table_id=t and (round_id is null or round_id=r.id or (s->>'publishHistory')::boolean or manager) order by id desc limit 30)x),'[]'::jsonb),
 'canManage',manager,'canRestore',restore,'systemAdmin',private.bau_system_admin(u),
 'diagnostics',jsonb_build_object('pendingEvents',(select count(*) from private.bau_outbox where room_id=room and delivered_at is null),
 'walletConsistent',w.available=coalesce((select sum(available_delta) from public.coin_ledger where user_id=u),0) and w.reserved=coalesce((select sum(reserved_delta) from public.coin_ledger where user_id=u),0),
 'collateralSafe',case when r.status in ('BETTING_OPEN','BETTING_LOCKED','SHAKING','REVEALING') then r.collateral>=private.bau_liability(private.bau_stakes(r.id)) else true end,
 'lastSettled',(select max(settled_at) from public.bau_cua_rounds where table_id=t)));
end $$;

-- Read-only notices also reach listeners outside the game without initializing a wallet.
create index bau_penalties_room_recent on public.bau_cua_penalty_executions(room_id,created_at desc);
create function public.bau_cua_notices(p_actor uuid,p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.game_access(p_room,p_actor);
 return coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('name',coalesce((select name from public.profiles where id=x.user_id),'Thành viên đã rời'),
 'songs',coalesce((select jsonb_agg(jsonb_build_object('id',b.entry_id,'title',b.title,'restored',b.restored)) from public.bau_cua_penalty_songs b where b.penalty_id=x.id),'[]'::jsonb)) order by x.created_at desc)
 from(select * from public.bau_cua_penalty_executions where room_id=p_room and (announce or user_id=p_actor) order by created_at desc limit 30)x),'[]'::jsonb);
end $$;
revoke all on function public.bau_cua_notices(uuid,uuid) from public,anon,authenticated;

create function public.bau_cua_read(p_actor uuid,p_room uuid,p_table uuid,p_seed text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.rooms where id=p_room for update;
 perform private.game_access(p_room,p_actor); perform private.bau_lock();
 insert into public.bau_cua_settings(room_id) values(p_room) on conflict do nothing;
 perform private.bau_wallet(p_actor);
 if p_table is not null then
 perform private.bau_view(p_actor,p_room,p_table); -- Verify room/table/view rights before advancing.
 update public.bau_cua_table_members set online_until=now()+interval '75 seconds' where table_id=p_table and user_id=p_actor and not banned;
 perform private.bau_advance(p_table,p_seed);
 end if;
 perform private.bau_flush(p_room);
 return private.bau_view(p_actor,p_room,p_table);
end $$;

create function public.bau_cua_command(p_actor uuid,p_room uuid,p_table uuid,p_request uuid,p_command jsonb,p_seed text)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare op text:=p_command->>'action'; role_name text; s jsonb; e jsonb; m public.bau_cua_tables; r public.bau_cua_rounds;
 receipt private.bau_receipts; target uuid; sym text; amount bigint; old_amount bigint; need bigint; delta bigint; total bigint; personal bigint;
 manager boolean; member boolean; result jsonb; claim text; last_claim timestamptz; t uuid:=p_table; pe public.bau_cua_penalty_executions; qe public.queue_entries; song public.songs;
begin
 if p_request is null or p_command is null or p_seed !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_INPUT'; end if;
 perform 1 from public.rooms where id=p_room for update;
 role_name:=private.game_access(p_room,p_actor); perform private.bau_lock();
 if p_table is not null and (not exists(select 1 from public.bau_cua_tables where id=p_table and room_id=p_room) or
 exists(select 1 from public.bau_cua_table_members where table_id=p_table and user_id=p_actor and banned)) then raise exception 'PERMISSION_DENIED'; end if;
 select * into receipt from private.bau_receipts where actor=p_actor and request_id=p_request;
 if found then
 if receipt.room_id<>p_room or receipt.table_id is distinct from p_table or receipt.command<>p_command then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 -- Replays never repeat a mutation or return an obsolete wallet/privileged snapshot.
 return private.bau_view(p_actor,p_room,case when op='leave' then null else coalesce(p_table,(receipt.result#>>'{table,id}')::uuid) end); end if;
 insert into public.bau_cua_settings(room_id) values(p_room) on conflict do nothing;
 select settings into s from public.bau_cua_settings where room_id=p_room;
 select settings into e from private.bau_economy;
 perform private.bau_wallet(p_actor);
 manager:=role_name='owner' or (role_name='moderator' and (s->>'moderatorManage')::boolean);
 if t is not null then
 select * into m from public.bau_cua_tables where id=t and room_id=p_room for update;
 if not found or m.closed then raise exception 'NOT_FOUND'; end if;
 if exists(select 1 from public.bau_cua_table_members where table_id=t and user_id=p_actor and banned) then raise exception 'PERMISSION_DENIED'; end if;
 if op<>'cancel' then perform private.bau_advance(t,p_seed); end if;
 select * into m from public.bau_cua_tables where id=t;
 select * into r from public.bau_cua_rounds where table_id=t order by number desc limit 1 for update;
 select exists(select 1 from public.bau_cua_table_members where table_id=t and user_id=p_actor and not spectator and not banned) into member;
 end if;
 if op='create' then
 if not (s->>'enabled')::boolean then raise exception 'BAU_DISABLED'; end if;
 if (select count(*) from public.bau_cua_tables where room_id=p_room and not closed)>=20 then raise exception 'BAU_TABLE_LIMIT'; end if;
 insert into public.bau_cua_tables(room_id,name,creator_id) values(p_room,p_command->>'name',p_actor) returning id into t;
 insert into public.bau_cua_table_members(table_id,user_id,online_until) values(t,p_actor,now()+interval '75 seconds');
 perform private.bau_emit(t,'table.created',p_actor);
 elsif op in ('daily','relief') then
 if op='daily' then
 claim:=(now() at time zone (e->>'timezone'))::date::text;
 if not (e->>'dailyEnabled')::boolean or exists(select 1 from public.coin_claims where user_id=p_actor and kind='DAILY' and claim_key=claim) then raise exception 'BAU_BONUS_UNAVAILABLE'; end if;
 amount:=(e->>'dailyAmount')::bigint;
 else
 select max(created_at) into last_claim from public.coin_claims where user_id=p_actor and kind='RELIEF';
 if not (e->>'reliefEnabled')::boolean or (select w.total from public.coin_wallets w where user_id=p_actor)>=(e->>'reliefThreshold')::bigint
 or last_claim>now()-make_interval(hours=>(e->>'reliefHours')::int) then raise exception 'BAU_BONUS_UNAVAILABLE'; end if;
 claim:=p_request::text; amount:=(e->>'reliefAmount')::bigint;
 end if;
 insert into public.coin_claims(user_id,kind,claim_key,amount) values(p_actor,upper(op),claim,amount);
 perform private.bau_money(p_actor,amount,0,upper(op)||'_BONUS',op||':'||claim);
 elsif op='settings' then
 if role_name<>'owner' or p_command->'confirmed' is distinct from 'true'::jsonb or not private.bau_valid_settings(p_command->'settings') then raise exception 'PERMISSION_DENIED'; end if;
 update public.bau_cua_settings set settings=p_command->'settings',updated_at=now() where room_id=p_room;
 insert into public.audit_logs(room_id,actor,action,details) values(p_room,p_actor,'bau.settings',jsonb_build_object('effective','next_round','settings',p_command->'settings'));
 elsif op in ('economy','adjust') then
 if not private.bau_system_admin(p_actor) or length(trim(p_command->>'reason'))<5 then raise exception 'PERMISSION_DENIED'; end if;
 if op='adjust' then
 target:=(p_command->>'user')::uuid; perform private.game_access(p_room,target); perform private.bau_wallet(target);
 if not private.game_integer(p_command->'amount',-1000000,1000000,false) or (p_command->>'amount')::bigint=0 then raise exception 'INVALID_INPUT'; end if;
 perform private.bau_money(target,(p_command->>'amount')::bigint,0,'ADMIN_ADJUSTMENT','admin:'||p_request::text);
 else
 e:=p_command->'economy';
 if jsonb_typeof(e)<>'object' or (select array_agg(key order by key) from jsonb_object_keys(e) key) is distinct from
 array['dailyAmount','dailyEnabled','initial','reliefAmount','reliefEnabled','reliefHours','reliefThreshold','timezone']::text[]
 or not private.game_integer(e->'initial',100,1000000,false) or not private.game_integer(e->'dailyAmount',1,1000000,false)
 or not private.game_integer(e->'reliefAmount',1,1000000,false) or not private.game_integer(e->'reliefThreshold',1,1000000,false)
 or not private.game_integer(e->'reliefHours',1,72,false) or e->>'timezone' not in ('UTC','Asia/Ho_Chi_Minh')
 or jsonb_typeof(e->'dailyEnabled') is distinct from 'boolean' or jsonb_typeof(e->'reliefEnabled') is distinct from 'boolean' then raise exception 'INVALID_INPUT'; end if;
 update private.bau_economy set settings=e,updated_at=now();
 end if;
 insert into public.audit_logs(room_id,actor,action,details) values(p_room,p_actor,'bau.'||op,p_command);
 elsif op='restore' then
 if role_name<>'owner' and not (role_name='moderator' and (s->>'moderatorRestore')::boolean) then raise exception 'PERMISSION_DENIED'; end if;
 select * into pe from public.bau_cua_penalty_executions where id=(p_command->>'penalty')::uuid and room_id=p_room;
 select q.* into qe from public.queue_entries q join public.bau_cua_penalty_songs b on b.entry_id=q.id and b.penalty_id=pe.id and not b.restored
 where q.id=(p_command->>'entry')::uuid and q.room_id=p_room and q.requested_by=pe.user_id and q.status='REMOVED' and q.failure_reason='BAU_CUA_PENALTY:'||pe.id::text for update of q;
 if qe.id is null then raise exception 'BAU_RESTORE_UNAVAILABLE'; end if;
 select * into song from public.songs where youtube_video_id=qe.youtube_video_id;
 if not exists(select 1 from public.room_members where room_id=p_room and user_id=qe.requested_by) or exists(select 1 from public.bans where room_id=p_room and user_id=qe.requested_by) then raise exception 'PERMISSION_DENIED'; end if;
 if exists(select 1 from public.room_settings rs where rs.room_id=p_room and
 ((select count(*) from public.queue_entries where room_id=p_room and status in ('PENDING','QUEUED','PREPARING','PLAYING'))>=rs.max_queue
 or (select count(*) from public.queue_entries where room_id=p_room and requested_by=qe.requested_by and status in ('PENDING','QUEUED','PREPARING','PLAYING'))>=rs.max_per_member
 or song.duration>rs.max_duration or (not rs.allow_duplicates and exists(select 1 from public.queue_entries where room_id=p_room and youtube_video_id=qe.youtube_video_id and status in ('PENDING','QUEUED','PREPARING','PLAYING'))))) then raise exception 'QUEUE_FULL'; end if;
 update public.rooms set next_position=next_position+1,version=version+1,updated_at=now() where id=p_room;
 update public.queue_entries set status='QUEUED',position=(select next_position from public.rooms where id=p_room),priority=0,failure_reason=null,updated_at=now() where id=qe.id;
 update public.bau_cua_penalty_songs set restored=true,restored_at=now() where penalty_id=pe.id and entry_id=qe.id;
 insert into public.audit_logs(room_id,actor,action,details) values(p_room,p_actor,'bau.restore',jsonb_build_object('penalty',pe.id,'entry',qe.id));
 insert into private.bau_outbox(room_id,table_id,round_id,version,kind,topic) select p_room,pe.table_id,pe.round_id,version,'queue.updated','room:'||p_room::text from public.rooms where id=p_room;
 else
 if t is null then raise exception 'NOT_FOUND'; end if;
 if op='join' then
 if not (s->>'enabled')::boolean or m.closed then raise exception 'BAU_DISABLED'; end if;
 if (p_command->>'spectator')::boolean and not (s->>'spectators')::boolean then raise exception 'PERMISSION_DENIED'; end if;
 if not (p_command->>'spectator')::boolean and not coalesce(member,false) and
 (select count(*) from public.bau_cua_table_members where table_id=t and not spectator and not banned)>=(s->>'capacity')::int then raise exception 'BAU_TABLE_LIMIT'; end if;
 if m.dealer_id=p_actor and (p_command->>'spectator')::boolean then raise exception 'BAU_PHASE'; end if;
 insert into public.bau_cua_table_members(table_id,user_id,spectator,online_until) values(t,p_actor,(p_command->>'spectator')::boolean,now()+interval '75 seconds')
 on conflict(table_id,user_id) do update set spectator=excluded.spectator,online_until=excluded.online_until;
 perform private.bau_emit(t,'member.joined',p_actor);
 elsif op='watch' then
 update public.bau_cua_table_members set online_until=now()+interval '75 seconds' where table_id=t and user_id=p_actor and not banned;
 elsif op='leave' then
 update public.bau_cua_table_members set spectator=true,online_until=now() where table_id=t and user_id=p_actor;
 delete from public.bau_cua_dealer_queue where table_id=t and user_id=p_actor;
 if m.dealer_id=p_actor and (r.id is null or r.status in ('RESULT','CANCELLED')) then perform private.bau_assign(t,null); end if;
 perform private.bau_emit(t,'member.left',p_actor);
 elsif op in ('bet','undo') then
 if not coalesce(member,false) or m.dealer_id=p_actor then raise exception 'PERMISSION_DENIED'; end if;
 if r.id is distinct from (p_command->>'round')::uuid or r.status<>'BETTING_OPEN' or r.deadline<=clock_timestamp() or m.status='PAUSED' then raise exception 'BAU_BET_CLOSED'; end if;
 sym:=p_command->>'symbol'; if sym not in ('BAU','CUA','TOM','CA','GA','NAI') then raise exception 'INVALID_INPUT'; end if;
 select coalesce(sum(amount),0) into personal from public.bau_cua_bets where round_id=r.id and user_id=p_actor;
 select amount into old_amount from public.bau_cua_bets where round_id=r.id and user_id=p_actor and symbol=sym;
 if op='undo' then
 if not (r.settings->>'undoBet')::boolean or old_amount is null then raise exception 'BAU_BET_CLOSED'; end if;
 amount:=-old_amount; delete from public.bau_cua_bets where round_id=r.id and user_id=p_actor and symbol=sym;
 else
 if not private.game_integer(p_command->'amount',1,1000000,false) then raise exception 'INVALID_INPUT'; end if;
 amount:=(p_command->>'amount')::bigint;
 if amount<(r.settings->>'minBet')::bigint or amount>(r.settings->>'maxBet')::bigint or personal+amount>(r.settings->>'playerLimit')::bigint
 or r.stake_total+amount>(r.settings->>'tableLimit')::bigint or (not (r.settings->>'customStake')::boolean and amount not in (100,500,1000)) then raise exception 'BAU_BET_LIMIT'; end if;
 insert into public.bau_cua_bets(round_id,user_id,symbol,amount) values(r.id,p_actor,sym,amount)
 on conflict(round_id,user_id,symbol) do update set amount=public.bau_cua_bets.amount+excluded.amount,updated_at=now();
 end if;
 need:=private.bau_liability(private.bau_stakes(r.id)); delta:=need-r.collateral;
 if delta>(select available from public.coin_wallets where user_id=r.dealer_id) then raise exception 'BAU_COLLATERAL'; end if;
 perform private.bau_money(p_actor,-amount,amount,case when op='bet' then 'BET_RESERVED' else 'BET_REFUND' end,'bet:'||p_request::text);
 perform private.bau_money(r.dealer_id,-delta,delta,'DEALER_RESERVED','collateral:'||p_request::text);
 update public.bau_cua_rounds set collateral=need,stake_total=stake_total+amount where id=r.id;
 perform private.bau_emit(t,case when op='bet' then 'bet.accepted' else 'bet.cancelled' end,p_actor);
 elsif op='volunteer' then
 if not coalesce(member,false) or (select available from public.coin_wallets where user_id=p_actor)<(s->>'dealerMinimum')::bigint then raise exception 'BAU_INSUFFICIENT_COINS'; end if;
 insert into public.bau_cua_dealer_queue(table_id,user_id) values(t,p_actor) on conflict do nothing;
 if m.dealer_id is null and (r.id is null or r.status in ('RESULT','CANCELLED')) then perform private.bau_rotate(t,s); end if;
 perform private.bau_emit(t,'dealer.queued',p_actor);
 elsif op='withdraw' then
 delete from public.bau_cua_dealer_queue where table_id=t and user_id=p_actor;
 perform private.bau_emit(t,'dealer.withdrawn',p_actor);
 elsif op in ('assign','release') then
 if op='assign' and not manager or op='release' and m.dealer_id is distinct from p_actor and not manager then raise exception 'PERMISSION_DENIED'; end if;
 if r.id is not null and r.status not in ('RESULT','CANCELLED') then raise exception 'BAU_PHASE'; end if;
 target:=case when op='assign' then (p_command->>'user')::uuid else null end;
 if target is not null then
 perform private.game_access(p_room,target);
 if not exists(select 1 from public.bau_cua_table_members b join public.coin_wallets w on w.user_id=b.user_id where b.table_id=t and b.user_id=target and not b.spectator and not b.banned and b.online_until>now() and w.available>=(s->>'dealerMinimum')::bigint) then raise exception 'BAU_DEALER_REQUIRED'; end if;
 end if; perform private.bau_assign(t,target);
 elsif op='start' then
 if m.dealer_id is distinct from p_actor and not manager then raise exception 'PERMISSION_DENIED'; end if;
 perform private.bau_start(t,p_seed);
 elsif op in ('advance','shake','reveal') then
 if op<>'advance' and m.dealer_id is distinct from p_actor then raise exception 'PERMISSION_DENIED'; end if;
 if op in ('shake','reveal') then
 if (op='shake' and r.status<>'BETTING_LOCKED') or (op='reveal' and r.status<>'SHAKING') or r.action_at is null or r.action_at>now() then raise exception 'BAU_PHASE'; end if;
 -- A real transition in the dealer's window, after the full configured minimum duration.
 update public.bau_cua_rounds set deadline=now() where id=r.id;
 perform private.bau_emit(t,case when op='shake' then 'dice.shaking' else 'dice.revealed' end,p_actor);
 perform private.bau_advance(t,p_seed);
 end if;
 elsif op in ('kick','unban') then
 if not manager then raise exception 'PERMISSION_DENIED'; end if;
 target:=(p_command->>'user')::uuid;
 if target=p_actor or target=(select owner_id from public.rooms where id=p_room) then raise exception 'PERMISSION_DENIED'; end if;
 if op='unban' then update public.bau_cua_table_members set banned=false where table_id=t and user_id=target;
 else update public.bau_cua_table_members set banned=(p_command->>'ban')::boolean,spectator=true,online_until=now() where table_id=t and user_id=target;
 delete from public.bau_cua_dealer_queue where table_id=t and user_id=target;
 end if;
 if m.dealer_id=target and (r.id is null or r.status in ('RESULT','CANCELLED')) then perform private.bau_assign(t,null); end if;
 perform private.bau_emit(t,'member.'||op,p_actor,jsonb_build_object('user',target));
 elsif op in ('pause','resume','cancel','close') then
 if not manager then raise exception 'PERMISSION_DENIED'; end if;
 if op='pause' then
 if r.id is not null and r.status not in ('RESULT','CANCELLED') then
 update public.bau_cua_tables set pause_after_round=true where id=t;
 else update public.bau_cua_tables set status='PAUSED',pause_after_round=false where id=t; end if;
 elsif op='resume' then
 if m.status<>'PAUSED' then raise exception 'BAU_PHASE'; end if;
 update public.bau_cua_tables set status='WAITING_FOR_DEALER' where id=t;
 elsif op='cancel' then
 if length(trim(p_command->>'reason'))<5 then raise exception 'INVALID_INPUT'; end if;
 perform private.bau_cancel(t,p_command->>'reason');
 else
 if m.name is distinct from p_command->>'name' then raise exception 'DELETE_NAME_MISMATCH'; end if;
 if r.id is not null and r.status not in ('RESULT','CANCELLED') then raise exception 'BAU_PHASE'; end if;
 update public.bau_cua_tables set closed=true,status='PAUSED' where id=t;
 perform private.bau_assign(t,null);
 end if;
 perform private.bau_emit(t,'table.'||op,p_actor);
 insert into public.audit_logs(room_id,actor,action,details) values(p_room,p_actor,'bau.'||op,p_command||jsonb_build_object('table',t));
 elsif op='reaction' then
 if not exists(select 1 from public.bau_cua_table_members where table_id=t and user_id=p_actor and not banned) or p_command->>'emoji' not in ('❤️','👏','🎉','🦀','😮','🍀') then raise exception 'PERMISSION_DENIED'; end if;
 if not public.consume_rate_limit('bau.reaction:'||p_actor::text,6,10) then raise exception 'RATE_LIMITED'; end if;
 perform private.bau_emit(t,'reaction',p_actor,jsonb_build_object('emoji',p_command->>'emoji'));
 else raise exception 'INVALID_INPUT'; end if;
 end if;
 perform private.bau_flush(p_room);
 result:=private.bau_view(p_actor,p_room,case when op='leave' then null else t end);
 insert into private.bau_receipts(actor,request_id,room_id,table_id,command,result) values(p_actor,p_request,p_room,p_table,p_command,result);
 return result;
end $$;

revoke all on function public.bau_cua_read(uuid,uuid,uuid,text),public.bau_cua_command(uuid,uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.bau_cua_read(uuid,uuid,uuid,text),public.bau_cua_command(uuid,uuid,uuid,uuid,jsonb,text) to service_role;
revoke all on function private.bau_round_view(public.bau_cua_rounds),private.bau_system_admin(uuid),private.bau_view(uuid,uuid,uuid) from public,anon,authenticated;
