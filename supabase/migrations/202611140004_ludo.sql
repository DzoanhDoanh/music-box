-- Ludo is independent from playback/room versions. Only the trusted Worker can commit engine output.
create function private.game_integer(v jsonb,lo numeric,hi numeric,nullable boolean default false)
returns boolean language plpgsql immutable set search_path='' as $$
begin
 if nullable and v='null'::jsonb then return true; end if;
 if jsonb_typeof(v) is distinct from 'number' then return false; end if;
 return v::text ~ '^-?[0-9]+$' and v::text::numeric between lo and hi;
end $$;
create function private.valid_game_state(s jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare p jsonb; n jsonb; r jsonb; l jsonb; k text; begin
 if jsonb_typeof(s) is distinct from 'object' or s-array['schema','id','room','host','name','version','round','status','rules','players','turn','phase','dice','sixes','deadline','remaining','last']<>'{}'::jsonb then return false; end if;
 foreach k in array array['id','room','host','name','status','phase'] loop
   if jsonb_typeof(s->k) is distinct from 'string' then return false; end if;
 end loop;
 if s->'schema' is distinct from '1'::jsonb or not private.game_integer(s->'version',0,9007199254740991)
 or not private.game_integer(s->'round',1,9007199254740991) or not private.game_integer(s->'sixes',0,3)
 or not private.game_integer(s->'dice',1,6,true) or not private.game_integer(s->'deadline',0,9007199254740991,true)
 or not private.game_integer(s->'remaining',0,90000,true) then return false; end if;
 if s->'turn'<>'null'::jsonb then
   if jsonb_typeof(s->'turn') is distinct from 'string' then return false; end if;
   perform (s->>'turn')::uuid;
 end if;
 if not (s ?& array['schema','id','room','host','name','version','round','status','rules','players','turn','phase','dice','sixes','deadline','remaining','last'])
 or jsonb_typeof(s->'rules') is distinct from 'object' or jsonb_typeof(s->'players') is distinct from 'array' then return false; end if;
 if jsonb_typeof(s)<>'object' or s->>'schema'<>'1' or (s->>'version')::bigint<0 or (s->>'round')::int<1
 or s->>'status' not in ('WAITING','READY','PLAYING','PAUSED','FINISHED','CANCELLED')
 or s->>'phase' not in ('ROLL','MOVE','DONE') or jsonb_typeof(s->'players')<>'array'
 or jsonb_array_length(s->'players')>4 or char_length(s->>'name') not between 1 and 60 then return false; end if;
 perform (s->>'id')::uuid, (s->>'room')::uuid, (s->>'host')::uuid;
 if s->>'id' is null or s->>'room' is null or s->>'host' is null or s->>'version' is null or s->>'round' is null or s->>'status' is null or s->>'phase' is null then return false; end if;
 if s->>'dice' is not null and (s->>'dice')::int not between 1 and 6 then return false; end if;
 if (s->>'sixes')::int not between 0 and 3 or (s->>'deadline')::numeric<0 then return false; end if;
 if s->>'phase'='MOVE' and s->>'dice' is null then return false; end if;
 r:=s->'rules';
 if r-array['entry','safe','captureBonus','finishBonus','threeSixes','turnSeconds','maxMisses']<>'{}'::jsonb
 or jsonb_typeof(r->'entry') is distinct from 'string' or jsonb_typeof(r->'safe') is distinct from 'string'
 or not private.game_integer(r->'turnSeconds',30,90) or not private.game_integer(r->'maxMisses',2,5) then return false; end if;
 if not (r ?& array['entry','safe','captureBonus','finishBonus','threeSixes','turnSeconds','maxMisses']) then return false; end if;
 if r->>'entry' not in ('SIX','ONE_OR_SIX') or r->>'safe' not in ('STARS','STARTS','NONE')
 or (r->>'turnSeconds')::int not in (30,45,60,90) or (r->>'maxMisses')::int not between 2 and 5
 or jsonb_typeof(r->'captureBonus') is distinct from 'boolean' or jsonb_typeof(r->'finishBonus') is distinct from 'boolean'
 or jsonb_typeof(r->'threeSixes') is distinct from 'boolean' then return false; end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(s->'players') x) <> jsonb_array_length(s->'players')
 or (select count(distinct x->>'color') from jsonb_array_elements(s->'players') x) <> jsonb_array_length(s->'players') then return false; end if;
 for p in select * from jsonb_array_elements(s->'players') loop
   if jsonb_typeof(p) is distinct from 'object' or p-array['id','name','color','ready','pieces','status','rank','misses']<>'{}'::jsonb
   or not private.game_integer(p->'color',0,3) or not private.game_integer(p->'misses',0,5)
   or not private.game_integer(p->'rank',1,4,true) then return false; end if;
   foreach k in array array['id','name','status'] loop
     if jsonb_typeof(p->k) is distinct from 'string' then return false; end if;
   end loop;
   if (p->>'status'='ACTIVE') is distinct from (p->>'rank' is null) then return false; end if;
   if not(p ?& array['id','name','color','ready','pieces','status','rank','misses']) or jsonb_typeof(p->'pieces') is distinct from 'array' then return false; end if;
   perform (p->>'id')::uuid;
   if p->>'id' is null or (p->>'color')::int not between 0 and 3 or char_length(p->>'name') not between 1 and 40
   or jsonb_typeof(p->'ready') is distinct from 'boolean' or p->>'status' not in ('ACTIVE','FINISHED','FORFEITED')
   or jsonb_array_length(p->'pieces')<>4 or (p->>'misses')::int not between 0 and 5
   or (p->>'rank')::int not between 1 and 4 then return false; end if;
   for n in select * from jsonb_array_elements(p->'pieces') loop
     if jsonb_typeof(n)<>'number' or n::text !~ '^-?[0-9]+$' or n::text::int not between -1 and 57 then return false; end if;
   end loop;
 end loop;
 if s->>'status' in ('PLAYING','PAUSED') and not exists(select 1 from jsonb_array_elements(s->'players') x where x->>'id'=s->>'turn' and x->>'status'='ACTIVE') then return false; end if;
 if (s->>'phase'='MOVE') is distinct from (s->>'dice' is not null) then return false; end if;
 if s->>'status'='PLAYING' and (s->>'deadline' is null or s->>'remaining' is not null) then return false; end if;
 if s->>'status'<>'PLAYING' and s->>'deadline' is not null then return false; end if;
 if s->>'status'='PAUSED' and s->>'remaining' is null then return false; end if;
 if s->>'status' not in ('PLAYING','PAUSED') and s->>'turn' is not null then return false; end if;
 if s->>'status' in ('PLAYING','PAUSED') and (s->>'phase'='DONE' or
 (select count(*) from jsonb_array_elements(s->'players') x where x->>'status'='ACTIVE')<2) then return false; end if;
 if (select count(distinct x->>'rank') from jsonb_array_elements(s->'players') x) <> (select count(*) from jsonb_array_elements(s->'players') x where x->>'rank' is not null) then return false; end if;
 if s->>'status'='FINISHED' and (s->>'phase'<>'DONE' or exists(select 1 from jsonb_array_elements(s->'players') x where x->>'rank' is null)) then return false; end if;
 l:=s->'last';
 if jsonb_typeof(l) is distinct from 'object' or not(l ?& array['type','actor'])
 or l-array['type','actor','piece','from','to','dice','captures']<>'{}'::jsonb
 or jsonb_typeof(l->'type') is distinct from 'string' or char_length(l->>'type')>40
 or jsonb_typeof(l->'actor') is distinct from 'string' or char_length(l->>'actor')>40 then return false; end if;
 if l ? 'piece' and not private.game_integer(l->'piece',0,3) then return false; end if;
 if l ? 'dice' and not private.game_integer(l->'dice',1,6) then return false; end if;
 foreach k in array array['from','to'] loop
   if l ? k and not private.game_integer(l->k,-1,57) then return false; end if;
 end loop;
 if l ? 'captures' then
   if jsonb_typeof(l->'captures') is distinct from 'array' or jsonb_array_length(l->'captures')>12 then return false; end if;
   for n in select * from jsonb_array_elements(l->'captures') loop
     if jsonb_typeof(n) is distinct from 'string' or char_length(n#>>'{}')>40 then return false; end if;
   end loop;
 end if;
 return true;
exception when others then return false;
end $$;

create table public.game_matches(
 id uuid primary key, room_id uuid not null references public.rooms on delete cascade,
 state jsonb not null check(private.valid_game_state(state)),
 version bigint not null check(version>=0), status text not null,
 deadline timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(id=(state->>'id')::uuid and room_id=(state->>'room')::uuid and version=(state->>'version')::bigint and status=state->>'status')
);
create index game_matches_room on public.game_matches(room_id,created_at desc);
create index game_matches_due on public.game_matches(deadline) where status='PLAYING';
create table public.game_settings(match_id uuid primary key references public.game_matches on delete cascade, rules jsonb not null);
create table public.game_players(
 match_id uuid references public.game_matches on delete cascade, user_id uuid not null,
 color int not null check(color between 0 and 3), state jsonb not null,
 primary key(match_id,user_id), unique(match_id,color)
);
create table public.game_moves(
 match_id uuid references public.game_matches on delete cascade, version bigint not null, round int not null,
 actor uuid, action jsonb not null, created_at timestamptz not null default now(), primary key(match_id,version)
);
create table public.game_events(
 match_id uuid references public.game_matches on delete cascade, version bigint not null, event text not null,
 payload jsonb not null, created_at timestamptz not null default now(), primary key(match_id,version)
);
create table public.game_results(
 match_id uuid references public.game_matches on delete cascade, round int not null, rankings jsonb not null,
 created_at timestamptz not null default now(), primary key(match_id,round)
);
create table public.game_spectators(
 match_id uuid references public.game_matches on delete cascade, user_id uuid references auth.users on delete cascade,
 seen_at timestamptz not null default now(), primary key(match_id,user_id)
);
-- Separate receipts are retained for the match lifetime; a seven-day maintenance sweep must not reroll.
create table private.game_receipts(
 actor uuid not null references auth.users on delete cascade, request_id uuid not null, room_id uuid not null references public.rooms on delete cascade,
 match_id uuid not null references public.game_matches on delete cascade, command jsonb not null, result jsonb not null,
 primary key(actor,request_id)
);
alter table private.game_receipts enable row level security;
revoke all on private.game_receipts from public,anon,authenticated;
grant all on private.game_receipts to service_role;

create function private.game_access(r uuid,a uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare role_name text; begin
 select role into role_name from public.room_members where room_id=r and user_id=a;
 if role_name is null or exists(select 1 from public.bans where room_id=r and user_id=a) then raise exception 'PERMISSION_DENIED'; end if;
 return role_name;
end $$;
create function private.game_view(g uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('state',m.state,'serverNow',floor(extract(epoch from statement_timestamp())*1000),
 'spectators',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name) from public.game_spectators w
 join public.profiles p on p.id=w.user_id join public.room_members rm on rm.user_id=p.id and rm.room_id=m.room_id
 where w.match_id=g and w.seen_at>now()-interval '70 seconds'
 and not exists(select 1 from public.bans b where b.room_id=m.room_id and b.user_id=p.id)),'[]'::jsonb),
 'results',coalesce((select jsonb_agg(to_jsonb(r) order by r.round desc) from
 (select round,rankings,created_at from public.game_results where match_id=g order by round desc limit 20) r),'[]'::jsonb))
 from public.game_matches m where id=g
$$;
create function public.game_context(p_actor uuid,p_room uuid,p_game uuid,p_request uuid default null,p_command jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.game_matches; receipt private.game_receipts; begin
 perform private.game_access(p_room,p_actor);
 select * into m from public.game_matches where id=p_game and room_id=p_room;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p_request is not null then
 select * into receipt from private.game_receipts where actor=p_actor and request_id=p_request;
 if found then
   if receipt.room_id<>p_room or receipt.match_id<>p_game or receipt.command is distinct from p_command then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return jsonb_build_object('receipt',receipt.result);
 end if; end if;
 return jsonb_build_object('snapshot',private.game_view(p_game),'members',
 coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'role',rm.role))
 from public.room_members rm join public.profiles p on p.id=rm.user_id where rm.room_id=p_room
 and not exists(select 1 from public.bans b where b.room_id=p_room and b.user_id=rm.user_id)),'[]'::jsonb));
end $$;
create function public.game_list(p_actor uuid,p_room uuid,p_page int default 0) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.game_access(p_room,p_actor);
 if p_page<0 or p_page>10000 then raise exception 'INVALID_INPUT'; end if;
 return coalesce((select jsonb_agg(s.state order by s.created_at desc) from
 (select state,created_at from public.game_matches where room_id=p_room order by created_at desc,id limit 20 offset p_page*20) s),'[]'::jsonb);
end $$;

create function public.game_create(p_actor uuid,p_room uuid,p_request uuid,p_command jsonb,p_state jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt private.game_receipts; result jsonb; g uuid; begin
 perform pg_advisory_xact_lock(hashtextextended('game:'||p_actor::text||':'||p_request::text,0));
 perform 1 from public.rooms where id=p_room for update;
 perform private.game_access(p_room,p_actor);
 select * into receipt from private.game_receipts where actor=p_actor and request_id=p_request;
 if found then
   if receipt.room_id<>p_room or receipt.command is distinct from p_command then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return receipt.result;
 end if;
 if not private.valid_game_state(p_state) or p_state->>'host'<>p_actor::text or p_state->>'room'<>p_room::text
 or jsonb_array_length(p_state->'players')<>1 or p_state->'players'->0->>'id'<>p_actor::text
 or p_state->>'status'<>'WAITING' or p_state->>'version'<>'0' or p_state->>'round'<>'1' then raise exception 'INVALID_INPUT'; end if;
 if (select count(*) from public.game_matches where room_id=p_room and status not in ('FINISHED','CANCELLED'))>=8 then raise exception 'GAME_TABLE_LIMIT'; end if;
 if not public.consume_rate_limit('game:create:'||p_actor::text,6,3600) then raise exception 'RATE_LIMITED'; end if;
 g:=(p_state->>'id')::uuid;
 p_state:=jsonb_set(p_state,'{players,0,name}',to_jsonb((select name from public.profiles where id=p_actor)));
 insert into public.game_matches(id,room_id,state,version,status) values(g,p_room,p_state,0,'WAITING');
 insert into public.game_settings values(g,p_state->'rules');
 insert into public.game_players select g,(p->>'id')::uuid,(p->>'color')::int,p from jsonb_array_elements(p_state->'players') p;
 insert into public.game_events values(g,0,'game.created',p_state->'last',now());
 result:=private.game_view(g);
 insert into private.game_receipts values(p_actor,p_request,p_room,g,p_command,result);
 perform realtime.send(jsonb_build_object('version',0),'game.created','game:'||g::text,true);
 perform realtime.send('{}'::jsonb,'games.updated','room:'||p_room::text,true);
 return result;
end $$;

create function public.game_commit(p_actor uuid,p_room uuid,p_game uuid,p_request uuid,p_command jsonb,p_version bigint,p_state jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.game_matches; receipt private.game_receipts; result jsonb; event_name text; begin
 perform pg_advisory_xact_lock(hashtextextended('game:'||p_actor::text||':'||p_request::text,0));
 perform 1 from public.rooms where id=p_room for update;
 perform private.game_access(p_room,p_actor);
 select * into m from public.game_matches where id=p_game and room_id=p_room for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into receipt from private.game_receipts where actor=p_actor and request_id=p_request;
 if found then
   if receipt.room_id<>p_room or receipt.match_id<>p_game or receipt.command is distinct from p_command then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return receipt.result;
 end if;
 if m.version<>p_version then raise exception 'GAME_STALE'; end if;
 if not private.valid_game_state(p_state) or p_state->>'id'<>p_game::text or p_state->>'room'<>p_room::text
 or (p_state->>'version')::bigint<>p_version+1 then raise exception 'INVALID_INPUT'; end if;
 -- A membership change between engine read and commit invalidates the entire transition.
 if exists(select 1 from jsonb_array_elements(p_state->'players') p where p->>'status'<>'FORFEITED'
 and not exists(select 1 from jsonb_array_elements(m.state->'players') old where old->>'id'=p->>'id' and old->>'status'='FINISHED' and p->>'status'='FINISHED') and
 (not exists(select 1 from public.room_members where room_id=p_room and user_id=(p->>'id')::uuid)
 or exists(select 1 from public.bans where room_id=p_room and user_id=(p->>'id')::uuid))) then raise exception 'GAME_STALE'; end if;
 if p_command->>'action' in ('settings','start','pause','resume','cancel','rematch')
 and m.state->>'host'<>p_actor::text and private.game_access(p_room,p_actor)='member' then raise exception 'PERMISSION_DENIED'; end if;
 if m.status in ('FINISHED','CANCELLED') and p_state->>'status'='WAITING'
 and (select count(*) from public.game_matches where room_id=p_room and status not in ('FINISHED','CANCELLED'))>=8 then raise exception 'GAME_TABLE_LIMIT'; end if;
 update public.game_matches set state=p_state,version=p_version+1,status=p_state->>'status',
 deadline=case when p_state->>'deadline' is null then null else to_timestamp((p_state->>'deadline')::numeric/1000) end,updated_at=now() where id=p_game;
 update public.game_settings set rules=p_state->'rules' where match_id=p_game;
 delete from public.game_players where match_id=p_game;
 insert into public.game_players select p_game,(p->>'id')::uuid,(p->>'color')::int,p from jsonb_array_elements(p_state->'players') p;
 insert into public.game_moves values(p_game,p_version+1,(p_state->>'round')::int,p_actor,p_command,now());
 event_name:=case p_state->'last'->>'type' when 'join' then 'player_joined' when 'leave' then 'player_left' else p_state->'last'->>'type' end;
 insert into public.game_events values(p_game,p_version+1,'game.'||event_name,p_state->'last',now());
 if p_state->>'status'='FINISHED' then
 insert into public.game_results values(p_game,(p_state->>'round')::int,p_state->'players',now()) on conflict do nothing;
 end if;
 result:=private.game_view(p_game);
 insert into private.game_receipts values(p_actor,p_request,p_room,p_game,p_command,result);
 -- No names, dice or positions leave SQL over Broadcast; revoked channels must refetch through Auth.
 perform realtime.send(jsonb_build_object('version',p_version+1),'game.'||event_name,'game:'||p_game::text,true);
 perform realtime.send(jsonb_build_object('version',p_version+1),'game.state_updated','game:'||p_game::text,true);
 if m.state->>'turn' is distinct from p_state->>'turn' then perform realtime.send(jsonb_build_object('version',p_version+1),'game.turn_changed','game:'||p_game::text,true); end if;
 if m.status is distinct from p_state->>'status' or p_command->>'action' in ('join','leave','color','ready','rematch') then
 perform realtime.send('{}'::jsonb,'games.updated','room:'||p_room::text,true); end if;
 return result;
end $$;

create function public.game_watch(p_actor uuid,p_room uuid,p_game uuid,p_watching boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.game_access(p_room,p_actor);
 if not exists(select 1 from public.game_matches where id=p_game and room_id=p_room) then raise exception 'NOT_FOUND'; end if;
 if p_watching then
 insert into public.game_spectators values(p_game,p_actor,now()) on conflict(match_id,user_id) do update set seen_at=now();
 else delete from public.game_spectators where match_id=p_game and user_id=p_actor; end if;
 return private.game_view(p_game);
end $$;
create function public.game_due() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'room',m.room_id,'actor',r.owner_id)),'[]'::jsonb)
 -- Bound each cron invocation, including up to three CAS retries per match.
 from (select * from public.game_matches where status='PLAYING' and deadline<=now() order by deadline limit 6) m
 join public.rooms r on r.id=m.room_id
$$;

create function private.game_member(g uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.game_matches where id=g and private.is_member(room_id))
$$;
create function private.game_topic_allowed(t text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if t !~ '^game:[0-9a-fA-F-]{36}$' then return false; end if;
 return private.game_member(substr(t,6)::uuid);
exception when invalid_text_representation then return false;
end $$;
do $$ declare t text; begin
 foreach t in array array['game_matches','game_players','game_settings','game_moves','game_events','game_results','game_spectators'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 if t='game_matches' then execute 'create policy games_room_read on public.game_matches for select to authenticated using(private.is_member(room_id))';
 else execute format('create policy games_room_read on public.%I for select to authenticated using(private.game_member(match_id))',t); end if;
 end loop;
end $$;
create policy games_private_receive on realtime.messages for select to authenticated
using(extension='broadcast' and private.game_topic_allowed(realtime.topic()));
revoke all on function private.game_integer(jsonb,numeric,numeric,boolean),private.valid_game_state(jsonb),private.game_access(uuid,uuid),private.game_view(uuid),private.game_member(uuid),private.game_topic_allowed(text) from public,anon,authenticated;
grant execute on function private.game_member(uuid),private.game_topic_allowed(text) to authenticated;
revoke all on function public.game_context(uuid,uuid,uuid,uuid,jsonb),public.game_list(uuid,uuid,int),public.game_create(uuid,uuid,uuid,jsonb,jsonb),public.game_commit(uuid,uuid,uuid,uuid,jsonb,bigint,jsonb),public.game_watch(uuid,uuid,uuid,boolean),public.game_due() from public,anon,authenticated;
grant execute on function public.game_context(uuid,uuid,uuid,uuid,jsonb),public.game_list(uuid,uuid,int),public.game_create(uuid,uuid,uuid,jsonb,jsonb),public.game_commit(uuid,uuid,uuid,uuid,jsonb,bigint,jsonb),public.game_watch(uuid,uuid,uuid,boolean),public.game_due() to service_role;
