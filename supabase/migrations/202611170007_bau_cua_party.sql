-- Additive only. Private seeds and transactional accounting; no existing data rewritten.
create function private.bau_defaults() returns jsonb language sql immutable set search_path='' as $$
 select '{"enabled":true,"capacity":12,"spectators":true,"autoNext":false,"minBet":100,"maxBet":5000,"playerLimit":10000,"tableLimit":100000,"customStake":true,"undoBet":true,"rotateDealer":true,"dealerRounds":5,"dealerMinimum":1000,"disconnectPolicy":"ROTATE","bettingSeconds":20,"lockingSeconds":3,"shakingSeconds":4,"revealingSeconds":5,"resultSeconds":3,"penaltyEnabled":true,"penaltyTrigger":"ZERO","penaltyCount":1,"penaltyPlayers":true,"penaltyDealer":true,"penaltyAnnounce":true,"moderatorManage":false,"moderatorRestore":false,"publishHistory":true,"showCommitment":true,"showVerification":true}'::jsonb
$$;
create function private.bau_valid_settings(s jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text; begin
 if jsonb_typeof(s)<>'object' or (select array_agg(key order by key) from jsonb_object_keys(s) key) is distinct from
 (select array_agg(key order by key) from jsonb_object_keys(private.bau_defaults()) key) then return false; end if;
 foreach k in array array['enabled','spectators','autoNext','customStake','undoBet','rotateDealer','penaltyEnabled','penaltyPlayers','penaltyDealer','penaltyAnnounce','moderatorManage','moderatorRestore','publishHistory','showCommitment','showVerification'] loop
 if jsonb_typeof(s->k) is distinct from 'boolean' then return false; end if; end loop;
 foreach k in array array['minBet','maxBet','playerLimit','tableLimit','dealerMinimum'] loop
 if not private.game_integer(s->k,1,1000000,false) then return false; end if; end loop;
 return private.game_integer(s->'capacity',2,32,false) and private.game_integer(s->'dealerRounds',1,20,false)
 and private.game_integer(s->'bettingSeconds',10,120,false) and private.game_integer(s->'lockingSeconds',2,10,false)
 and private.game_integer(s->'shakingSeconds',2,15,false) and private.game_integer(s->'revealingSeconds',3,15,false)
 and private.game_integer(s->'resultSeconds',3,30,false) and private.game_integer(s->'penaltyCount',1,3,false)
 and s->>'disconnectPolicy' in ('ROTATE','PAUSE') and s->>'penaltyTrigger' in ('ZERO','BELOW_MINIMUM')
 and (s->>'minBet')::bigint <= (s->>'maxBet')::bigint and (s->>'maxBet')::bigint <= (s->>'playerLimit')::bigint
 and (s->>'playerLimit')::bigint <= (s->>'tableLimit')::bigint
 and ((s->>'customStake')::boolean or exists(select 1 from unnest(array[100,500,1000]) n where n between (s->>'minBet')::bigint and (s->>'maxBet')::bigint));
 exception when others then return false; end $$;
create table private.bau_economy(id boolean primary key default true check(id), settings jsonb not null,
 updated_at timestamptz not null default now());
insert into private.bau_economy values(true,'{"initial":10000,"dailyEnabled":true,"dailyAmount":2000,"reliefEnabled":true,"reliefAmount":1000,"reliefThreshold":200,"reliefHours":6,"timezone":"Asia/Ho_Chi_Minh"}',now());
create table public.coin_wallets(user_id uuid primary key references auth.users on delete cascade,
 available bigint not null default 0 check(available>=0), reserved bigint not null default 0 check(reserved>=0),
 total bigint generated always as (available+reserved) stored check(total<=1000000000000),
 episode bigint not null default 0, bankrupt_below bigint not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.coin_ledger(id bigint generated always as identity primary key,
 user_id uuid references auth.users on delete set null, reference text not null, reason text not null,
 available_delta bigint not null, reserved_delta bigint not null,
 available_after bigint not null check(available_after>=0), reserved_after bigint not null check(reserved_after>=0),
 created_at timestamptz not null default now(), unique(user_id,reference));
create index coin_ledger_user on public.coin_ledger(user_id,id desc);
create table private.coin_grants(user_id uuid primary key references auth.users on delete cascade, amount bigint not null check(amount>0), created_at timestamptz not null default now());
create table public.coin_claims(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 kind text not null check(kind in ('DAILY','RELIEF')), claim_key text not null, amount bigint not null check(amount>0),
 created_at timestamptz not null default now(), unique(user_id,kind,claim_key));
create index coin_claims_recent on public.coin_claims(user_id,kind,created_at desc);
create table public.bau_cua_settings(room_id uuid primary key references public.rooms on delete cascade,
 settings jsonb not null default private.bau_defaults() check(private.bau_valid_settings(settings)), updated_at timestamptz not null default now());
create table public.bau_cua_tables(id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms on delete cascade,
 name text not null check(length(name) between 2 and 60), creator_id uuid references auth.users on delete set null,
 version bigint not null default 0, status text not null default 'WAITING_FOR_DEALER'
 check(status in ('WAITING_FOR_DEALER','BETTING_OPEN','BETTING_LOCKED','SHAKING','REVEALING','SETTLING','RESULT','PAUSED','CANCELLED')),
 dealer_id uuid references auth.users on delete set null, dealer_rounds int not null default 0,
 closed boolean not null default false, pause_after_round boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index bau_cua_tables_room on public.bau_cua_tables(room_id,created_at desc);
create table public.bau_cua_table_members(table_id uuid references public.bau_cua_tables on delete cascade,
 user_id uuid references auth.users on delete cascade, spectator boolean not null default false, banned boolean not null default false,
 online_until timestamptz not null default now(), created_at timestamptz not null default now(), primary key(table_id,user_id));
create table public.bau_cua_dealer_queue(table_id uuid references public.bau_cua_tables on delete cascade,
 user_id uuid references auth.users on delete cascade, position bigint generated always as identity,
 created_at timestamptz not null default now(), primary key(table_id,user_id));
create table public.bau_cua_dealer_sessions(id uuid primary key default gen_random_uuid(), table_id uuid not null references public.bau_cua_tables on delete cascade,
 user_id uuid references auth.users on delete set null, rounds int not null default 0, net bigint not null default 0,
 started_at timestamptz not null default now(), ended_at timestamptz);
create unique index bau_dealer_active on public.bau_cua_dealer_sessions(table_id) where ended_at is null;
create table public.bau_cua_rounds(id uuid primary key, table_id uuid not null references public.bau_cua_tables on delete cascade,
 number int not null, dealer_id uuid not null, status text not null check(status in ('BETTING_OPEN','BETTING_LOCKED','SHAKING','REVEALING','SETTLING','RESULT','CANCELLED')),
 settings jsonb not null check(private.bau_valid_settings(settings)), commitment text not null check(commitment ~ '^[a-f0-9]{64}$'),
 revealed_seed text, dice int[], deadline timestamptz, action_at timestamptz, version bigint not null default 0, collateral bigint not null default 0 check(collateral>=0),
 stake_total bigint not null default 0 check(stake_total>=0), dealer_net bigint, started_at timestamptz not null default now(), settled_at timestamptz,
 unique(table_id,number), check(dice is null or (cardinality(dice)=3 and dice <@ array[0,1,2,3,4,5])),
 check((status in ('REVEALING','SETTLING','RESULT','CANCELLED')) or (dice is null and revealed_seed is null)));
create unique index bau_one_active_round on public.bau_cua_rounds(table_id) where status not in ('RESULT','CANCELLED');
create index bau_round_deadline on public.bau_cua_rounds(deadline) where status not in ('RESULT','CANCELLED');
create table private.bau_seeds(round_id uuid primary key references public.bau_cua_rounds on delete cascade,
 seed text not null check(seed ~ '^[a-f0-9]{64}$'), created_at timestamptz not null default now());
create table public.bau_cua_bets(round_id uuid references public.bau_cua_rounds on delete cascade,
 user_id uuid not null, symbol text not null check(symbol in ('BAU','CUA','TOM','CA','GA','NAI')),
 amount bigint not null check(amount>0), payout bigint check(payout>=0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(round_id,user_id,symbol));
create table public.bau_cua_round_events(id bigint generated always as identity primary key,
 table_id uuid not null references public.bau_cua_tables on delete cascade, round_id uuid references public.bau_cua_rounds on delete cascade,
 kind text not null, actor uuid references auth.users on delete set null, details jsonb not null default '{}', created_at timestamptz not null default now());
create index bau_events_table on public.bau_cua_round_events(table_id,id desc);
create table public.bau_cua_penalty_executions(id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms on delete cascade,
 table_id uuid not null references public.bau_cua_tables on delete cascade, round_id uuid not null references public.bau_cua_rounds on delete cascade,
 user_id uuid not null, episode bigint not null, threshold bigint not null, announce boolean not null,
 status text not null check(status in ('APPLIED','SKIPPED_NO_ELIGIBLE_SONG')), created_at timestamptz not null default now(), unique(user_id,episode));
create table public.bau_cua_penalty_songs(penalty_id uuid references public.bau_cua_penalty_executions on delete cascade,
 entry_id uuid references public.queue_entries on delete cascade, title text not null, restored boolean not null default false,
 restored_at timestamptz, created_at timestamptz not null default now(), primary key(penalty_id,entry_id));
create table private.bau_receipts(actor uuid references auth.users on delete cascade, request_id uuid not null,
 room_id uuid not null, table_id uuid, command jsonb not null, result jsonb not null, created_at timestamptz not null default now(), primary key(actor,request_id));
create table private.bau_outbox(id uuid primary key default gen_random_uuid(), room_id uuid references public.rooms on delete cascade,
 table_id uuid references public.bau_cua_tables on delete cascade, round_id uuid, version bigint not null,
 kind text not null, topic text not null, payload jsonb not null default '{}', created_at timestamptz not null default now(), delivered_at timestamptz);
create index bau_outbox_pending on private.bau_outbox(created_at) where delivered_at is null;

create function private.bau_lock() returns void language sql set search_path='' as $$ select pg_advisory_xact_lock(724001007) $$;
create function private.bau_money(u uuid, da bigint, dr bigint, why text, ref text) returns void language plpgsql set search_path='' as $$
declare w public.coin_wallets; begin
 select * into w from public.coin_wallets where user_id=u for update;
 if not found or w.available+da<0 or w.reserved+dr<0 then raise exception 'BAU_INSUFFICIENT_COINS'; end if;
 update public.coin_wallets set available=available+da,reserved=reserved+dr,updated_at=now(),
 bankrupt_below=case when available+da+reserved+dr>=bankrupt_below then 0 else bankrupt_below end where user_id=u returning * into w;
 insert into public.coin_ledger(user_id,reference,reason,available_delta,reserved_delta,available_after,reserved_after)
 values(u,ref,why,da,dr,w.available,w.reserved);
end $$;
-- Round lifecycle helpers run only under the room/economy locks held by entrypoints.
create function private.bau_penalty(r public.bau_cua_rounds, u uuid, before_total bigint, dealer boolean) returns void language plpgsql set search_path='' as $$
declare w public.coin_wallets; threshold bigint; room uuid; p uuid; q record; n int:=0; announce boolean;
begin
 select * into w from public.coin_wallets where user_id=u for update;
 threshold:=case when r.settings->>'penaltyTrigger'='ZERO' then 1 else (r.settings->>'minBet')::bigint end;
 if before_total<threshold or w.total>=threshold or w.bankrupt_below>0 then return; end if;
 update public.coin_wallets set episode=episode+1,bankrupt_below=threshold where user_id=u returning * into w;
 if not (r.settings->>'penaltyEnabled')::boolean or not (r.settings->>case when dealer then 'penaltyDealer' else 'penaltyPlayers' end)::boolean then return; end if;
 select room_id into room from public.bau_cua_tables where id=r.table_id;
 announce:=(r.settings->>'penaltyAnnounce')::boolean;
 insert into public.bau_cua_penalty_executions(room_id,table_id,round_id,user_id,episode,threshold,announce,status)
 values(room,r.table_id,r.id,u,w.episode,threshold,announce,'SKIPPED_NO_ELIGIBLE_SONG') returning id into p;
 for q in select e.id,s.title from public.queue_entries e join public.songs s on s.youtube_video_id=e.youtube_video_id
 where e.room_id=room and e.requested_by=u and e.status='QUEUED'
 order by e.requested_at desc,e.id desc limit (r.settings->>'penaltyCount')::int for update of e loop
 update public.queue_entries set status='REMOVED',failure_reason='BAU_CUA_PENALTY:'||p::text,updated_at=now() where id=q.id and status='QUEUED';
 insert into public.bau_cua_penalty_songs(penalty_id,entry_id,title) values(p,q.id,q.title); n:=n+1;
 end loop;
 if n>0 then
 update public.bau_cua_penalty_executions set status='APPLIED' where id=p;
 update public.rooms set version=version+1,updated_at=now() where id=room;
 insert into private.bau_outbox(room_id,table_id,round_id,version,kind,topic)
 select room,r.table_id,r.id,version,'queue.updated','room:'||room::text from public.rooms where id=room;
 end if;
 insert into public.audit_logs(room_id,actor,action,details) values(room,u,'bau.penalty',jsonb_build_object('penalty',p,'count',n,'round',r.id));
 -- Only a change hint is broadcast; names, songs and amounts require an authorized read.
 insert into private.bau_outbox(room_id,table_id,round_id,version,kind,topic)
 select room,r.table_id,r.id,version,'penalty.updated','room:'||room::text from public.rooms where id=room;
end $$;
create function private.bau_settle(rid uuid) returns void language plpgsql set search_path='' as $$
declare r public.bau_cua_rounds; u record; b record; n int; gross bigint:=0; paid bigint; before_balances jsonb:='{}';
begin
 select * into r from public.bau_cua_rounds where id=rid for update;
 if r.status='RESULT' then return; end if;
 if r.status<>'REVEALING' or r.deadline>now() or r.dice is null then raise exception 'BAU_PHASE'; end if;
 perform 1 from public.coin_wallets where user_id=r.dealer_id or user_id in (select user_id from public.bau_cua_bets where round_id=rid) order by user_id for update;
 select jsonb_object_agg(user_id,total) into before_balances from public.coin_wallets where user_id=r.dealer_id or user_id in(select user_id from public.bau_cua_bets where round_id=rid);
 update public.bau_cua_rounds set status='SETTLING' where id=rid;
 for b in select * from public.bau_cua_bets where round_id=rid order by user_id,symbol loop
 select count(*) into n from unnest(r.dice) d where d=array_position(array['BAU','CUA','TOM','CA','GA','NAI'],b.symbol)-1;
 paid:=case when n=0 then 0 else b.amount*(n+1) end; gross:=gross+paid;
 perform private.bau_money(b.user_id,paid,-b.amount,case when paid>0 then 'BET_SETTLED_WIN' else 'BET_SETTLED_LOSS' end,'settle:'||rid::text||':'||b.symbol);
 update public.bau_cua_bets set payout=paid where round_id=rid and user_id=b.user_id and symbol=b.symbol;
 end loop;
 perform private.bau_money(r.dealer_id,r.collateral+r.stake_total-gross,-r.collateral,'DEALER_SETTLEMENT','dealer:'||rid::text);
 update public.bau_cua_rounds set status='RESULT',action_at=null,dealer_net=r.stake_total-gross,settled_at=now(),deadline=r.deadline+make_interval(secs=>(r.settings->>'resultSeconds')::int) where id=rid;
 update public.bau_cua_tables set status='RESULT',dealer_rounds=dealer_rounds+1 where id=r.table_id;
 update public.bau_cua_dealer_sessions set rounds=rounds+1,net=net+r.stake_total-gross where table_id=r.table_id and ended_at is null;
 for u in select key::uuid id,value::text::bigint total from jsonb_each(before_balances) order by key loop
 perform private.bau_penalty(r,u.id,u.total,u.id=r.dealer_id);
 end loop;
 perform private.bau_emit(r.table_id,'round.settled');
end $$;
create function private.bau_cancel(t uuid, reason text) returns void language plpgsql set search_path='' as $$
declare r public.bau_cua_rounds; b record; seed text;
begin
 select * into r from public.bau_cua_rounds where table_id=t order by number desc limit 1 for update;
 if not found or r.status in ('RESULT','CANCELLED') then return; end if;
 if r.status in ('REVEALING','SETTLING') then raise exception 'BAU_PHASE'; end if;
 for b in select user_id,sum(amount)::bigint amount from public.bau_cua_bets where round_id=r.id group by user_id order by user_id loop
 perform private.bau_money(b.user_id,b.amount,-b.amount,'BET_REFUND','refund:'||r.id::text);
 end loop;
 perform private.bau_money(r.dealer_id,r.collateral,-r.collateral,'BET_REFUND','refund-dealer:'||r.id::text);
 select s.seed into seed from private.bau_seeds s where round_id=r.id;
 update public.bau_cua_rounds set status='CANCELLED',deadline=null,action_at=null,revealed_seed=seed,dice=private.bau_dice(r.id,seed) where id=r.id;
 update public.bau_cua_tables set status='CANCELLED' where id=t;
 perform private.bau_emit(t,'round.cancelled',null,jsonb_build_object('reason',reason));
end $$;
create function private.bau_assign(t uuid,u uuid) returns void language plpgsql set search_path='' as $$
begin
 update public.bau_cua_dealer_sessions set ended_at=now() where table_id=t and ended_at is null;
 update public.bau_cua_tables set dealer_id=u,dealer_rounds=0 where id=t;
 if u is not null then
 insert into public.bau_cua_dealer_sessions(table_id,user_id) values(t,u);
 delete from public.bau_cua_dealer_queue where table_id=t and user_id=u;
 end if;
 perform private.bau_emit(t,case when u is null then 'dealer.released' else 'dealer.assigned' end,u);
end $$;
create function private.bau_rotate(t uuid,s jsonb) returns void language plpgsql set search_path='' as $$
declare m public.bau_cua_tables; candidate uuid; eligible boolean;
begin
 select * into m from public.bau_cua_tables where id=t;
 select exists(select 1 from public.bau_cua_table_members p join public.coin_wallets w on w.user_id=p.user_id
 join public.room_members rm on rm.room_id=m.room_id and rm.user_id=p.user_id
 where p.table_id=t and p.user_id=m.dealer_id and not p.spectator and not p.banned and p.online_until>now()
 and w.available>=(s->>'dealerMinimum')::bigint and not exists(select 1 from public.bans b where b.room_id=m.room_id and b.user_id=p.user_id)) into eligible;
 if m.dealer_id is not null and eligible and (not (s->>'rotateDealer')::boolean or m.dealer_rounds<(s->>'dealerRounds')::int) then return; end if;
 if m.dealer_id is not null and not eligible and s->>'disconnectPolicy'='PAUSE' then
 perform private.bau_assign(t,null); update public.bau_cua_tables set status='PAUSED' where id=t; return; end if;
 if m.dealer_id is not null then perform private.bau_assign(t,null); end if;
 select q.user_id into candidate from public.bau_cua_dealer_queue q
 join public.bau_cua_table_members p on p.table_id=t and p.user_id=q.user_id
 join public.coin_wallets w on w.user_id=q.user_id join public.room_members rm on rm.room_id=m.room_id and rm.user_id=q.user_id
 where q.table_id=t and not p.spectator and not p.banned and p.online_until>now() and w.available>=(s->>'dealerMinimum')::bigint
 and not exists(select 1 from public.bans b where b.room_id=m.room_id and b.user_id=q.user_id) order by q.position limit 1;
 if candidate is not null then perform private.bau_assign(t,candidate); end if;
end $$;
create function private.bau_start(t uuid,seed text) returns void language plpgsql set search_path='' as $$
declare m public.bau_cua_tables; s jsonb; rid uuid:=gen_random_uuid(); seq int;
begin
 select * into m from public.bau_cua_tables where id=t;
 select settings into s from public.bau_cua_settings where room_id=m.room_id;
 if m.closed or not (s->>'enabled')::boolean or m.status not in ('WAITING_FOR_DEALER','RESULT','CANCELLED') then raise exception 'BAU_PHASE'; end if;
 if exists(select 1 from public.bau_cua_rounds where table_id=t and status='RESULT' and deadline>now()) then raise exception 'BAU_PHASE'; end if;
 perform private.bau_rotate(t,s); select * into m from public.bau_cua_tables where id=t;
 if m.dealer_id is null or m.status='PAUSED' then raise exception 'BAU_DEALER_REQUIRED'; end if;
 if not exists(select 1 from public.bau_cua_table_members p join public.room_members rm on rm.room_id=m.room_id and rm.user_id=p.user_id
 where p.table_id=t and p.user_id<>m.dealer_id and not p.banned and not p.spectator and p.online_until>now()
 and not exists(select 1 from public.bans b where b.room_id=m.room_id and b.user_id=p.user_id)) then raise exception 'BAU_PLAYERS_REQUIRED'; end if;
 select coalesce(max(number),0)+1 into seq from public.bau_cua_rounds where table_id=t;
 insert into public.bau_cua_rounds(id,table_id,number,dealer_id,status,settings,commitment,deadline)
 values(rid,t,seq,m.dealer_id,'BETTING_OPEN',s,encode(extensions.digest(seed,'sha256'),'hex'),now()+make_interval(secs=>(s->>'bettingSeconds')::int));
 insert into private.bau_seeds(round_id,seed) values(rid,seed);
 update public.bau_cua_tables set status='BETTING_OPEN' where id=t;
 perform private.bau_emit(t,'round.started',m.dealer_id);
end $$;
create function private.bau_advance(t uuid,seed text) returns void language plpgsql set search_path='' as $$
declare r public.bau_cua_rounds; m public.bau_cua_tables; secret text; next_phase text; seconds int; i int; s jsonb;
begin
 select * into m from public.bau_cua_tables where id=t for update;
 if not found or m.closed or m.status='PAUSED' then return; end if;
 for i in 1..6 loop
 select * into r from public.bau_cua_rounds where table_id=t order by number desc limit 1 for update;
 if not found or r.deadline is null then
 select settings into s from public.bau_cua_settings where room_id=m.room_id;
 perform private.bau_rotate(t,s); return;
 end if;
 if r.deadline>now() then return; end if;
 if r.status='RESULT' then
 update public.bau_cua_rounds set deadline=null where id=r.id;
 update public.bau_cua_tables set status=case when pause_after_round then 'PAUSED' else 'WAITING_FOR_DEALER' end,pause_after_round=false where id=t returning * into m;
 if m.status='PAUSED' then perform private.bau_emit(t,'game.paused'); return; end if;
 select settings into s from public.bau_cua_settings where room_id=m.room_id;
 perform private.bau_rotate(t,s); perform private.bau_emit(t,'round.finished');
 if (s->>'autoNext')::boolean and (s->>'enabled')::boolean then
 begin perform private.bau_start(t,seed); exception when raise_exception then if sqlerrm not in ('BAU_DEALER_REQUIRED','BAU_PLAYERS_REQUIRED','BAU_PHASE') then raise; end if; end;
 end if; return;
 elsif r.status='REVEALING' then perform private.bau_settle(r.id);
 else
 next_phase:=case r.status when 'BETTING_OPEN' then 'BETTING_LOCKED' when 'BETTING_LOCKED' then 'SHAKING' when 'SHAKING' then 'REVEALING' end;
 if next_phase is null then return; end if;
 seconds:=(r.settings->>case next_phase when 'BETTING_LOCKED' then 'lockingSeconds' when 'SHAKING' then 'shakingSeconds' else 'revealingSeconds' end)::int;
 if next_phase='REVEALING' then
 select s.seed into secret from private.bau_seeds s where s.round_id=r.id;
 end if;
 -- Configured duration is the minimum. Dealer has a 2s action window before automatic recovery.
 update public.bau_cua_rounds set status=next_phase,
 action_at=case when next_phase in ('BETTING_LOCKED','SHAKING') then r.deadline+make_interval(secs=>seconds) else null end,
 deadline=r.deadline+make_interval(secs=>seconds+case when next_phase in ('BETTING_LOCKED','SHAKING') then 2 else 0 end),
 revealed_seed=case when next_phase='REVEALING' then secret else revealed_seed end,
 dice=case when next_phase='REVEALING' then private.bau_dice(r.id,secret) else dice end where id=r.id;
 update public.bau_cua_tables set status=next_phase where id=t;
 perform private.bau_emit(t,'round.phase_changed');
 end if;
 end loop;
end $$;
create function private.bau_wallet(u uuid) returns void language plpgsql set search_path='' as $$
declare amount bigint; begin
 if not exists(select 1 from public.coin_wallets where user_id=u) then
 insert into public.coin_wallets(user_id) values(u);
 select (settings->>'initial')::bigint into amount from private.bau_economy;
 insert into private.coin_grants(user_id,amount) values(u,amount);
 perform private.bau_money(u,amount,0,'INITIAL_GRANT','initial');
 end if;
end $$;
create function private.bau_dice(r uuid, seed text) returns int[] language plpgsql immutable set search_path='' as $$
declare result int[]:='{}'; counter int:=0; bytes bytea; i int; b int; begin
 loop
 bytes:=extensions.digest('ROOMTUNE:BAU_CUA:v1:'||r::text||':'||seed||':'||counter::text,'sha256');
 for i in 0..31 loop b:=get_byte(bytes,i); if b<252 then result:=array_append(result,b%6); if cardinality(result)=3 then return result; end if; end if; end loop;
 counter:=counter+1;
 end loop;
end $$;
create function private.bau_gross(stakes bigint[], dice int[]) returns bigint language plpgsql immutable set search_path='' as $$
declare total bigint:=0; i int; n int; begin
 for i in 1..6 loop select count(*) into n from unnest(dice) d where d=i-1; if n>0 then total:=total+stakes[i]*(n+1); end if; end loop;
 return total;
end $$;
create function private.bau_liability(stakes bigint[]) returns bigint language plpgsql immutable set search_path='' as $$
declare a int; b int; c int; highest bigint:=0; escrow bigint; begin
 select coalesce(sum(n),0) into escrow from unnest(stakes) n;
 for a in 0..5 loop for b in 0..5 loop for c in 0..5 loop highest:=greatest(highest,private.bau_gross(stakes,array[a,b,c])-escrow); end loop; end loop; end loop;
 return highest;
end $$;
create function private.bau_stakes(r uuid) returns bigint[] language sql stable set search_path='' as $$
 select array(select coalesce((select sum(amount) from public.bau_cua_bets where round_id=r and symbol=s),0)::bigint
 from unnest(array['BAU','CUA','TOM','CA','GA','NAI']) s)
$$;
create function private.bau_emit(t uuid, kind text, actor uuid default null, details jsonb default '{}') returns void language plpgsql set search_path='' as $$
declare m public.bau_cua_tables; rid uuid; begin
 update public.bau_cua_tables set version=version+1,updated_at=now() where id=t returning * into m;
 select id into rid from public.bau_cua_rounds where table_id=t order by number desc limit 1;
 update public.bau_cua_rounds set version=m.version where id=rid;
 insert into public.bau_cua_round_events(table_id,round_id,kind,actor,details) values(t,rid,kind,actor,details);
 insert into private.bau_outbox(room_id,table_id,round_id,version,kind,topic)
 values(m.room_id,t,rid,m.version,kind,'bau:'||t::text);
end $$;

-- Every migration is safe if a later one fails: default-deny immediately, before API/policies.
do $$ declare obj record; begin
 for obj in select schemaname,tablename from pg_tables where schemaname in ('public','private')
 and (tablename like 'bau_%' or tablename in ('coin_wallets','coin_ledger','coin_grants','coin_claims')) loop
 execute format('alter table %I.%I enable row level security',obj.schemaname,obj.tablename);
 execute format('revoke all on %I.%I from public,anon,authenticated',obj.schemaname,obj.tablename);
 execute format('grant all on %I.%I to service_role',obj.schemaname,obj.tablename);
 end loop;
 for obj in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname like 'bau_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',obj.signature);
 end loop;
end $$;
create function private.bau_flush(r uuid) returns void language plpgsql set search_path='' as $$
declare e private.bau_outbox; begin
 for e in select * from private.bau_outbox where room_id=r and delivered_at is null order by created_at limit 100 for update skip locked loop
 begin
 perform realtime.send(e.payload||jsonb_build_object('id',e.id,'table',e.table_id,'round',e.round_id,'version',e.version,'serverTime',e.created_at,'kind',e.kind),
 case when e.topic like 'room:%' then 'room.updated' else 'table.updated' end,e.topic,true);
 update private.bau_outbox set delivered_at=now() where id=e.id;
 exception when others then null; -- Persist undelivered; next authorized read retries.
 end; end loop;
end $$;
revoke all on function private.bau_flush(uuid) from public,anon,authenticated;
