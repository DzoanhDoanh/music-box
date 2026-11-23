-- Duck Race is additive and disabled at HTTP/UI boundaries until explicitly enabled.
create table public.duck_race_matches (
 id uuid primary key, room_id uuid not null references public.rooms on delete cascade,
 state jsonb not null check(jsonb_typeof(state)='object'),
 version bigint not null check(version>0), status text not null check(status in ('LOBBY','COUNTDOWN','FINISHED','CANCELLED')),
 series_id uuid not null, round integer not null check(round between 1 and 10),
 previous_id uuid references public.duck_race_matches, created_at timestamptz not null default now(),
 unique(series_id,round)
);
create index duck_room_recent on public.duck_race_matches(room_id,created_at desc);
create index duck_pending on public.duck_race_matches(room_id,id) where status='COUNTDOWN';
create table private.duck_race_secrets (
 race_id uuid primary key references public.duck_race_matches on delete cascade,
 seed text not null check(seed~'^[0-9a-f]{64}$'), plan jsonb
);
create table private.duck_race_receipts (
 actor uuid references auth.users on delete cascade, request_id uuid not null,
 room_id uuid not null references public.rooms on delete cascade, race_id uuid references public.duck_race_matches on delete cascade,
 command jsonb not null, primary key(actor,request_id),created_at timestamptz not null default now()
);
create table public.duck_race_results (
 race_id uuid primary key references public.duck_race_matches on delete cascade, room_id uuid not null references public.rooms on delete cascade,
 series_id uuid not null, round integer not null, entries jsonb not null, results jsonb not null,
 created_at timestamptz not null default now()
);
create table public.duck_race_rewards (
 race_id uuid references public.duck_race_matches on delete cascade,
 user_id uuid references auth.users on delete cascade,amount bigint not null check(amount>0 and amount<=10000),
 primary key(race_id,user_id),created_at timestamptz not null default now()
);
create index duck_results_room on public.duck_race_results(room_id,created_at desc);
create index duck_results_series on public.duck_race_results(room_id,series_id);
create table public.duck_race_presets (
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.rooms on delete cascade,
 owner uuid not null references auth.users on delete cascade,name text not null check(length(name) between 1 and 80),
 entries jsonb not null check(jsonb_array_length(entries) between 2 and 30),created_at timestamptz not null default now()
);
create table public.duck_race_audit_logs (
 id bigint generated always as identity primary key,room_id uuid not null references public.rooms on delete cascade,
 race_id uuid references public.duck_race_matches on delete cascade,actor uuid references auth.users on delete set null,
 action text not null,details jsonb not null default '{}',created_at timestamptz not null default now()
);

create table public.duck_race_settings (
 room_id uuid primary key references public.rooms on delete cascade,
 settings jsonb not null, version bigint not null check(version>0), updated_at timestamptz not null default now(),
 check(jsonb_typeof(settings->'songEnabled')='boolean' and jsonb_typeof(settings->'songOwnerOnly')='boolean'
 and (settings->>'maxSongEntries')::int between 2 and 30 and settings->>'songPriority' in ('OFF','AUTO','APPROVAL'))
);
create function private.duck_settings(r uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce((select settings||jsonb_build_object('version',version) from public.duck_race_settings where room_id=r),
 '{"songEnabled":true,"songOwnerOnly":true,"maxSongEntries":30,"songPriority":"OFF","version":0}'::jsonb)
$$;
create function private.duck_check_song(r uuid,a uuid,s jsonb) returns void language plpgsql set search_path='' as $$
declare policy jsonb; role_name text; begin
 if s->'config'->>'mode'<>'SONG' then return; end if;
 policy:=private.duck_settings(r); role_name:=private.game_access(r,a);
 if not (policy->>'songEnabled')::boolean then raise exception 'DUCK_SONG_DISABLED'; end if;
 if jsonb_array_length(s->'entries')>(policy->>'maxSongEntries')::int then raise exception 'DUCK_SONG_LIMIT'; end if;
 if role_name<>'owner' and ((policy->>'songOwnerOnly')::boolean
 or s->'config'->>'songPriority' is distinct from policy->>'songPriority'
 or coalesce((s->'config'->'rewards'->>'enabled')::boolean,false)) then raise exception 'PERMISSION_DENIED'; end if;
end $$;
create function public.duck_race_settings(p_actor uuid,p_room uuid,p_request uuid,p_command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare receipt private.duck_race_receipts; current_settings jsonb; next_settings jsonb:=p_command->'settings'; begin
 perform pg_advisory_xact_lock(hashtextextended('duck:'||p_actor::text||':'||p_request::text,0));
 perform 1 from public.rooms where id=p_room for update;
 if private.game_access(p_room,p_actor)<>'owner' then raise exception 'PERMISSION_DENIED'; end if;
 select * into receipt from private.duck_race_receipts where actor=p_actor and request_id=p_request;
 if found then
 if receipt.room_id<>p_room or receipt.command is distinct from p_command then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 return; end if;
 current_settings:=private.duck_settings(p_room);
 if (p_command->>'expectedVersion')::bigint is distinct from (current_settings->>'version')::bigint then raise exception 'DUCK_SETTINGS_STALE'; end if;
 if p_command->>'action' is distinct from 'settings' or jsonb_typeof(next_settings) is distinct from 'object'
 or not (next_settings ?& array['songEnabled','songOwnerOnly','maxSongEntries','songPriority'])
 or next_settings-array['songEnabled','songOwnerOnly','maxSongEntries','songPriority']<>'{}'::jsonb
 or jsonb_typeof(next_settings->'songEnabled') is distinct from 'boolean'
 or jsonb_typeof(next_settings->'songOwnerOnly') is distinct from 'boolean'
 or jsonb_typeof(next_settings->'maxSongEntries') is distinct from 'number'
 or jsonb_typeof(next_settings->'songPriority') is distinct from 'string'
 or next_settings->>'maxSongEntries' !~ '^[0-9]+$'
 or (next_settings->>'maxSongEntries')::int not between 2 and 30
 or next_settings->>'songPriority' not in ('OFF','AUTO','APPROVAL') then raise exception 'INVALID_INPUT'; end if;
 insert into public.duck_race_settings(room_id,settings,version) values(p_room,next_settings,1)
 on conflict(room_id) do update set settings=excluded.settings,version=public.duck_race_settings.version+1,updated_at=now();
 insert into private.duck_race_receipts(actor,request_id,room_id,command) values(p_actor,p_request,p_room,p_command);
 insert into public.duck_race_audit_logs(room_id,actor,action,details) values(p_room,p_actor,'settings.updated',next_settings);
 perform realtime.send('{}','games.updated','room:'||p_room::text,true);
end $$;

create function private.duck_emit(g uuid,kind text) returns void language plpgsql set search_path='' as $$
declare m public.duck_race_matches; begin
 select * into m from public.duck_race_matches where id=g;
 perform realtime.send(jsonb_build_object('version',m.version),'duck.updated','duck:'||g::text,true);
 perform realtime.send('{}','games.updated','room:'||m.room_id::text,true);
 insert into public.duck_race_audit_logs(room_id,race_id,action) values(m.room_id,g,kind);
end $$;

create function private.duck_song(g uuid) returns text language plpgsql set search_path='' as $$
declare s jsonb; e jsonb; q uuid; outcome text; priority_value bigint; begin
 select state into s from public.duck_race_matches where id=g for update;
 if s->>'songReward' in ('APPLIED','SKIPPED_UNAVAILABLE','OFF') then return s->>'songReward'; end if;
 select entry into e from jsonb_array_elements(s->'entries') entry where entry->>'id'=s->'results'->0->>'entryId';
 q:=(e->>'songId')::uuid;
 if q is null or not exists(select 1 from public.queue_entries where id=q and room_id=(s->>'roomId')::uuid and status='QUEUED') then outcome:='SKIPPED_UNAVAILABLE';
 else
 select coalesce(max(priority),0)+1 into priority_value from public.queue_entries where room_id=(s->>'roomId')::uuid and status='QUEUED';
 update public.queue_entries set priority=priority_value,updated_at=now() where id=q and status='QUEUED';
 update public.rooms set version=version+1,updated_at=now() where id=(s->>'roomId')::uuid;
 outcome:='APPLIED';
 end if;
 update public.duck_race_matches set state=jsonb_set(state,'{songReward}',to_jsonb(outcome)) where id=g;
 insert into public.duck_race_audit_logs(room_id,race_id,action,details)
 values((s->>'roomId')::uuid,g,'song.reward',jsonb_build_object('entry',q,'outcome',outcome));
 return outcome;
end $$;

create function private.duck_finish(g uuid) returns void language plpgsql set search_path='' as $$
declare m public.duck_race_matches; secret private.duck_race_secrets; s jsonb; r jsonb; e jsonb;
 u uuid; amount bigint; remaining bigint; config jsonb; priority_mode text;
begin
 select * into m from public.duck_race_matches where id=g for update;
 if m.status<>'COUNTDOWN' or statement_timestamp()<to_timestamp(((m.state->>'startAt')::double precision+(m.state->'config'->>'duration')::double precision*1000)/1000) then return; end if;
 select * into secret from private.duck_race_secrets where race_id=g;
 if secret.plan is null then raise exception 'INVALID_INPUT'; end if;
 config:=m.state->'config';
 s:=m.state||jsonb_build_object('status','FINISHED','seed',secret.seed,'results',secret.plan->'results','frames',secret.plan->'frames','version',m.version+1);
 update public.duck_race_matches set state=s,status='FINISHED',version=version+1 where id=g;
 insert into public.duck_race_results(race_id,room_id,series_id,round,entries,results)
 values(g,m.room_id,m.series_id,m.round,s->'entries',s->'results');
 if config->>'mode'='PLAYER' and (config->'rewards'->>'enabled')::boolean then
 perform private.bau_lock();
 remaining:=least(10000,(config->'rewards'->>'budget')::bigint);
 for r in select value from jsonb_array_elements(s->'results') loop
 select value into e from jsonb_array_elements(s->'entries') where value->>'id'=r->>'entryId';
 u:=(e->>'userId')::uuid;
 if u is null or not exists(select 1 from auth.users where id=u) then continue; end if;
 amount:=least(remaining,least(100,(config->'rewards'->>'participation')::bigint)+
 case (r->>'rank')::int when 1 then least(5000,(config->'rewards'->>'winner')::bigint)
 when 2 then least(5000,(config->'rewards'->>'runnerUp')::bigint) else 0 end);
 if amount>0 then
 perform private.bau_wallet(u);
 insert into public.duck_race_rewards values(g,u,amount,now());
 perform private.bau_money(u,amount,0,'DUCK_RACE_REWARD','duck:'||g::text);
 perform realtime.send(jsonb_build_object('user',u),'wallet.updated','room:'||m.room_id::text,true);
 remaining:=remaining-amount;
 end if;
 end loop;
 end if;
 priority_mode:=config->>'songPriority';
 if config->>'mode'='SONG' and priority_mode<>'OFF' then
 if priority_mode='AUTO' then perform private.duck_song(g);
 else update public.duck_race_matches set state=jsonb_set(state,'{songReward}','"PENDING"') where id=g; end if;
 else update public.duck_race_matches set state=jsonb_set(state,'{songReward}','"OFF"') where id=g;
 end if;
 perform private.duck_emit(g,'race.finished');
end $$;

create function private.duck_context(g uuid,receipt boolean default false) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('race',m.state,'seed',s.seed,'plan',s.plan,'receipt',receipt,
 'serverNow',floor(extract(epoch from statement_timestamp())*1000),
 'members',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'role',rm.role))
 from public.room_members rm join public.profiles p on p.id=rm.user_id where rm.room_id=m.room_id
 and not exists(select 1 from public.bans b where b.room_id=m.room_id and b.user_id=p.id)),'[]'::jsonb),
 'songs',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',song.title,'requester',p.name))
 from public.queue_entries q join public.songs song on song.youtube_video_id=q.youtube_video_id join public.profiles p on p.id=q.requested_by
 where q.room_id=m.room_id and q.status='QUEUED'),'[]'::jsonb))
 from public.duck_race_matches m join private.duck_race_secrets s on s.race_id=m.id where m.id=g
$$;

create function public.duck_race_create_context(p_actor uuid,p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.game_access(p_room,p_actor);
 return jsonb_build_object('songs',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',s.title,'requester',p.name))
 from public.queue_entries q join public.songs s on s.youtube_video_id=q.youtube_video_id join public.profiles p on p.id=q.requested_by
 where q.room_id=p_room and q.status='QUEUED'),'[]'::jsonb));
end $$;

create function public.duck_race_context(p_actor uuid,p_room uuid,p_race uuid,p_request uuid default null,p_command jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt private.duck_race_receipts; was_replay boolean:=false;
begin
 perform 1 from public.rooms where id=p_room for update;
 perform private.game_access(p_room,p_actor);
 if not exists(select 1 from public.duck_race_matches where id=p_race and room_id=p_room) then raise exception 'NOT_FOUND'; end if;
 if p_request is not null then
 select * into receipt from private.duck_race_receipts where actor=p_actor and request_id=p_request;
 if found then
 if receipt.room_id<>p_room or receipt.race_id is distinct from p_race or receipt.command is distinct from p_command then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 was_replay:=true;
 end if; end if;
 perform private.duck_finish(p_race);
 return private.duck_context(p_race,was_replay);
end $$;

create function public.duck_race_create(p_actor uuid,p_room uuid,p_request uuid,p_command jsonb,p_state jsonb,p_seed text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt private.duck_race_receipts; g uuid:=(p_state->>'id')::uuid; source public.duck_race_matches; role_name text;
begin
 perform pg_advisory_xact_lock(hashtextextended('duck:'||p_actor::text||':'||p_request::text,0));
 perform 1 from public.rooms where id=p_room for update;
 role_name:=private.game_access(p_room,p_actor);
 select * into receipt from private.duck_race_receipts where actor=p_actor and request_id=p_request;
 if found then
 if receipt.room_id<>p_room or receipt.command is distinct from p_command then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 return private.duck_context(receipt.race_id,true);
 end if;
 if p_command->>'action'='create' then
 if role_name<>'owner' and p_state->'config'->>'mode'<>'SONG' then raise exception 'PERMISSION_DENIED'; end if;
 elsif p_command->>'action'='rematch' then
 select * into source from public.duck_race_matches where id=(p_command->>'source')::uuid and room_id=p_room;
 if not found or source.status<>'FINISHED' or (source.state->>'host'<>p_actor::text and role_name<>'owner') then raise exception 'PERMISSION_DENIED'; end if;
 if (p_command->>'nextRound')::boolean and exists(select 1 from public.duck_race_matches where previous_id=source.id) then raise exception 'DUCK_TOURNAMENT_COMPLETE'; end if;
 else raise exception 'INVALID_INPUT'; end if;
 if p_state->>'roomId'<>p_room::text or p_state->>'status'<>'LOBBY' or (p_state->>'version')::int<>1
 or p_state->>'seed' is not null or p_state->'results'<>'[]'::jsonb or p_state->'frames'<>'[]'::jsonb
 or p_seed!~'^[0-9a-f]{64}$' or p_state->>'commitment'<>encode(extensions.digest('roomtune:duck:1:commit:'||g::text||':'||p_seed,'sha256'),'hex')
 or jsonb_array_length(p_state->'entries')>(p_state->'config'->>'capacity')::int then raise exception 'INVALID_INPUT'; end if;
 perform private.duck_check_song(p_room,p_actor,p_state);
if (select count(*) from public.duck_race_matches where room_id=p_room and status in ('LOBBY','COUNTDOWN'))>=20 then raise exception 'RATE_LIMITED'; end if;
 p_state:=p_state||jsonb_build_object('createdAt',floor(extract(epoch from statement_timestamp())*1000));
 insert into public.duck_race_matches(id,room_id,state,version,status,series_id,round,previous_id)
 values(g,p_room,p_state,1,'LOBBY',(p_state->>'seriesId')::uuid,(p_state->>'round')::int,(p_state->>'previousId')::uuid);
 insert into private.duck_race_secrets values(g,p_seed,null);
 insert into private.duck_race_receipts(actor,request_id,room_id,race_id,command) values(p_actor,p_request,p_room,g,p_command);
 perform private.duck_emit(g,'race.created');
 return private.duck_context(g);
end $$;

create function public.duck_race_commit(p_actor uuid,p_room uuid,p_race uuid,p_request uuid,p_command jsonb,p_version bigint,p_state jsonb,p_plan jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.duck_race_matches; receipt private.duck_race_receipts; role_name text; action text:=p_command->>'action';
begin
 perform pg_advisory_xact_lock(hashtextextended('duck:'||p_actor::text||':'||p_request::text,0));
 perform 1 from public.rooms where id=p_room for update;
 role_name:=private.game_access(p_room,p_actor);
 select * into m from public.duck_race_matches where id=p_race and room_id=p_room for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into receipt from private.duck_race_receipts where actor=p_actor and request_id=p_request;
 if found then
 if receipt.room_id<>p_room or receipt.race_id<>p_race or receipt.command is distinct from p_command then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 return private.duck_context(p_race,true);
 end if;
 if m.version<>p_version then raise exception 'DUCK_STALE'; end if;
 if action in ('start','configure','entries','lobby','cancel','kick','transfer','approve_song') and m.state->>'host'<>p_actor::text and role_name<>'owner' then raise exception 'PERMISSION_DENIED'; end if;
 if action='approve_song' and role_name<>'owner' then raise exception 'PERMISSION_DENIED'; end if;
 if action='configure' and role_name<>'owner' and m.state->'config'->>'mode'='SONG' and p_state->'config'->>'mode'<>'SONG' then raise exception 'PERMISSION_DENIED'; end if;
 if action='finalize' then
 perform private.duck_finish(p_race);
 if (select status from public.duck_race_matches where id=p_race)<>'FINISHED' then raise exception 'DUCK_LOCKED'; end if;
 return private.duck_context(p_race);
 end if;
 if m.status<>'LOBBY' and action not in ('transfer','approve_song') then raise exception 'DUCK_LOCKED'; end if;
 if action in ('start','configure','entries') then perform private.duck_check_song(p_room,p_actor,p_state); end if;
 if p_state->>'id'<>p_race::text or p_state->>'roomId'<>p_room::text or (p_state->>'version')::bigint<>m.version+1
 or p_state->>'commitment'<>m.state->>'commitment' then raise exception 'INVALID_INPUT'; end if;
 if m.status<>'LOBBY' and (p_state-'host'-'version'-'songReward') is distinct from (m.state-'host'-'version'-'songReward') then raise exception 'DUCK_LOCKED'; end if;
 if action='start' then
 if exists(select 1 from jsonb_array_elements(p_state->'entries') e where e->>'userId' is not null and
 (not exists(select 1 from public.room_members where room_id=p_room and user_id=(e->>'userId')::uuid)
 or exists(select 1 from public.bans where room_id=p_room and user_id=(e->>'userId')::uuid))) then raise exception 'DUCK_NOT_READY'; end if;
 if p_plan is null or (select plan from private.duck_race_secrets where race_id=p_race) is not null
 or jsonb_array_length(p_state->'entries')<2 or jsonb_array_length(p_state->'entries')>30
 or p_state->>'status'<>'COUNTDOWN' or p_state->>'lockedHash' is null then raise exception 'INVALID_INPUT'; end if;
 update private.duck_race_secrets set plan=p_plan where race_id=p_race;
 p_state:=jsonb_set(p_state,'{startAt}',to_jsonb(floor(extract(epoch from statement_timestamp())*1000)+3000));
 elsif p_plan is not null then raise exception 'INVALID_INPUT'; end if;
 update public.duck_race_matches set state=p_state,version=m.version+1,status=p_state->>'status' where id=p_race;
 if action='approve_song' then
 if m.status<>'FINISHED' or m.state->>'songReward'<>'PENDING' then raise exception 'DUCK_LOCKED'; end if;
 perform private.duck_song(p_race);
 end if;
 insert into private.duck_race_receipts(actor,request_id,room_id,race_id,command) values(p_actor,p_request,p_room,p_race,p_command);
 perform private.duck_emit(p_race,'race.'||action);
 return private.duck_context(p_race);
end $$;

create function public.duck_race_list(p_actor uuid,p_room uuid,p_series uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare g uuid; is_team boolean; begin
 perform 1 from public.rooms where id=p_room for update;
 perform private.game_access(p_room,p_actor);
 for g in select id from public.duck_race_matches where room_id=p_room and status='COUNTDOWN' order by id loop perform private.duck_finish(g); end loop;
 select coalesce(state->'config'->'tournament'->>'kind'='TEAM',false) into is_team
 from public.duck_race_matches where room_id=p_room and series_id=p_series order by round limit 1;
 return jsonb_build_object('serverNow',floor(extract(epoch from statement_timestamp())*1000),'race',null,'settings',private.duck_settings(p_room),
 'races',coalesce((select jsonb_agg(x.item order by x.created_at desc) from(
 select created_at,jsonb_build_object('id',id,'name',state->>'name','mode',state->'config'->>'mode','status',
 case when status='COUNTDOWN' and statement_timestamp()>=to_timestamp((state->>'startAt')::double precision/1000) then 'RACING' else status end,
 'count',jsonb_array_length(state->'entries'),'createdAt',state->'createdAt') item
 from public.duck_race_matches where room_id=p_room order by created_at desc limit 50)x),'[]'::jsonb),
 'rounds',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'round',m.round,
 'status',case when m.status='COUNTDOWN' and statement_timestamp()>=to_timestamp((m.state->>'startAt')::double precision/1000) then 'RACING' else m.status end,
 'count',jsonb_array_length(m.state->'entries'),'winner',(select e->>'name' from jsonb_array_elements(d.entries)e where e->>'id'=d.results->0->>'entryId')) order by m.round)
 from public.duck_race_matches m left join public.duck_race_results d on d.race_id=m.id
 where m.room_id=p_room and m.series_id=p_series),'[]'::jsonb),
 'standings',coalesce((select jsonb_agg(to_jsonb(x) order by x.points desc,x.wins desc,x."entryId") from (
 select case when is_team then coalesce(nullif(e->>'team',''),'Không đội') else coalesce(e->>'userId',e->>'id') end "entryId",
 max(case when is_team then coalesce(nullif(e->>'team',''),'Không đội') else e->>'name' end) name,max(e->>'team') team,
 sum((r->>'points')::int) points,count(*) filter(where r->>'rank'='1') wins
 from public.duck_race_results d cross join lateral jsonb_array_elements(d.entries)e
 cross join lateral jsonb_array_elements(d.results)r
 where d.room_id=p_room and d.series_id=p_series and e->>'id'=r->>'entryId'
 group by case when is_team then coalesce(nullif(e->>'team',''),'Không đội') else coalesce(e->>'userId',e->>'id') end)x),'[]'::jsonb),
 'leaderboard',coalesce((select jsonb_agg(to_jsonb(x) order by x.wins desc,x.races desc) from(
 select (e->>'userId')::uuid "userId",max(e->>'name') name,count(*) races,count(*) filter(where r->>'rank'='1') wins
 from public.duck_race_results d cross join lateral jsonb_array_elements(d.entries)e cross join lateral jsonb_array_elements(d.results)r
 where d.room_id=p_room and e->>'userId' is not null and e->>'id'=r->>'entryId' group by e->>'userId' order by wins desc limit 50)x),'[]'::jsonb),
 'presets',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'entries',entries) order by created_at desc)
 from public.duck_race_presets where room_id=p_room and owner=p_actor),'[]'::jsonb));
end $$;

create function public.duck_race_preset(p_actor uuid,p_room uuid,p_command jsonb,p_request uuid) returns void language plpgsql security definer set search_path='' as $$
declare receipt private.duck_race_receipts; begin
 perform pg_advisory_xact_lock(hashtextextended('duck:'||p_actor::text||':'||p_request::text,0));
 perform 1 from public.rooms where id=p_room for update;
 if private.game_access(p_room,p_actor)<>'owner' then raise exception 'PERMISSION_DENIED'; end if;
 select * into receipt from private.duck_race_receipts where actor=p_actor and request_id=p_request;
 if found then if receipt.room_id<>p_room or receipt.command is distinct from p_command then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return; end if;
 if p_command->>'action'='save_preset' then
 if (select count(*) from public.duck_race_presets where room_id=p_room and owner=p_actor)>=30 then raise exception 'RATE_LIMITED'; end if;
 insert into public.duck_race_presets(room_id,owner,name,entries) values(p_room,p_actor,p_command->>'name',p_command->'entries');
 elsif p_command->>'action'='delete_preset' then
 delete from public.duck_race_presets where id=(p_command->>'id')::uuid and room_id=p_room and owner=p_actor;
 else raise exception 'INVALID_INPUT'; end if;
 insert into private.duck_race_receipts(actor,request_id,room_id,command) values(p_actor,p_request,p_room,p_command);
end $$;
create function public.duck_race_react(p_actor uuid,p_room uuid,p_race uuid,p_emoji text,p_request uuid) returns void language plpgsql security definer set search_path='' as $$
declare receipt private.duck_race_receipts; command jsonb:=jsonb_build_object('action','reaction','emoji',p_emoji);
begin
 perform pg_advisory_xact_lock(hashtextextended('duck:'||p_actor::text||':'||p_request::text,0));
 perform private.game_access(p_room,p_actor);
 if p_emoji not in ('🦆','🔥','👏','💜','🏁') or not exists(select 1 from public.duck_race_matches where id=p_race and room_id=p_room) then raise exception 'INVALID_INPUT'; end if;
 select * into receipt from private.duck_race_receipts where actor=p_actor and request_id=p_request;
 if found then
 if receipt.room_id<>p_room or receipt.race_id is distinct from p_race or receipt.command is distinct from command then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 return; end if;
 insert into private.duck_race_receipts(actor,request_id,room_id,race_id,command) values(p_actor,p_request,p_room,p_race,command);
 perform realtime.send(jsonb_build_object('id',p_request,'emoji',p_emoji),'duck.reaction','duck:'||p_race::text,true);
end $$;

create function private.duck_topic_allowed(topic text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if topic!~'^duck:[0-9a-f-]{36}$' then return false; end if;
 return exists(select 1 from public.duck_race_matches where id=substr(topic,6)::uuid and private.is_member(room_id));
exception when invalid_text_representation then return false; end $$;
create policy duck_private_receive on realtime.messages for select to authenticated using(extension='broadcast' and private.duck_topic_allowed(realtime.topic()));
do $$ declare t text; f record; begin
 foreach t in array array['duck_race_matches','duck_race_results','duck_race_rewards','duck_race_presets','duck_race_audit_logs','duck_race_settings'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['duck_race_secrets','duck_race_receipts'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated',t);
 execute format('grant all on private.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure sig,n.nspname ns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname like 'duck_%' and n.nspname in ('public','private') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 if f.ns='public' then execute format('grant execute on function %s to service_role',f.sig); end if;
 end loop;
end $$;
grant execute on function private.duck_topic_allowed(text) to authenticated;
-- Clients read only time-gated API snapshots, never raw race/seed/plan tables.
create function public.duck_race_tick() returns void language plpgsql security definer set search_path='' as $$
declare r uuid; g uuid; begin
 for r in select distinct room_id from public.duck_race_matches where status='COUNTDOWN' order by room_id loop
 perform 1 from public.rooms where id=r for update;
 for g in select id from public.duck_race_matches where room_id=r and status='COUNTDOWN' order by id loop perform private.duck_finish(g); end loop;
 end loop;
end $$;
revoke all on function public.duck_race_tick() from public,anon,authenticated;
grant execute on function public.duck_race_tick() to service_role;
create function private.duck_immutable_result() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'DUCK_LOCKED'; end $$;
create trigger duck_result_immutable before update on public.duck_race_results for each row execute function private.duck_immutable_result();
revoke all on function private.duck_immutable_result() from public,anon,authenticated;
