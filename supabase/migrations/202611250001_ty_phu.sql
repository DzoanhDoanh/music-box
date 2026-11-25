-- Tỷ Phú Phố Nhạc (property board game). Rules run in the Worker (src/shared/ty-phu/engine.ts);
-- PostgreSQL stores versioned state, enforces membership, idempotency and optimistic concurrency.
-- The chance deck order is secret: it lives in private.ty_phu_decks and never in readable rows.

create function private.ty_phu_valid_state(s jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
 return jsonb_typeof(s)='object'
 and s->>'schema'='1'
 and (s->>'id')::uuid is not null and (s->>'room')::uuid is not null and (s->>'host')::uuid is not null
 and s->>'status' in ('WAITING','PLAYING','FINISHED','CANCELLED')
 and (s->>'version')::bigint>=0
 and length(s->>'name') between 1 and 60
 and jsonb_typeof(s->'players')='array' and jsonb_array_length(s->'players') between 1 and 4
 and jsonb_typeof(s->'tiles')='array' and jsonb_array_length(s->'tiles')=32
 and not (s ? 'deck');
exception when others then return false;
end $$;

create table public.ty_phu_matches(
 id uuid primary key,
 room_id uuid not null references public.rooms on delete cascade,
 state jsonb not null check(private.ty_phu_valid_state(state)),
 version bigint not null check(version>=0),
 status text not null,
 deadline timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(id=(state->>'id')::uuid and room_id=(state->>'room')::uuid and version=(state->>'version')::bigint and status=state->>'status')
);
create index ty_phu_matches_room on public.ty_phu_matches(room_id,created_at desc);
create index ty_phu_matches_due on public.ty_phu_matches(deadline) where status='PLAYING';
create table private.ty_phu_decks(
 match_id uuid primary key references public.ty_phu_matches on delete cascade,
 deck jsonb not null check(jsonb_typeof(deck)='array' and jsonb_array_length(deck)<=15)
);
create table public.ty_phu_results(
 match_id uuid primary key references public.ty_phu_matches on delete cascade,
 winner uuid not null, reason text not null, players jsonb not null,
 created_at timestamptz not null default now()
);
create table private.ty_phu_receipts(
 actor uuid not null references auth.users on delete cascade, request_id uuid not null,
 room_id uuid not null references public.rooms on delete cascade,
 match_id uuid not null references public.ty_phu_matches on delete cascade,
 command jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(actor,request_id)
);
alter table private.ty_phu_decks enable row level security;
alter table private.ty_phu_receipts enable row level security;
revoke all on private.ty_phu_decks, private.ty_phu_receipts from public,anon,authenticated;
grant all on private.ty_phu_decks, private.ty_phu_receipts to service_role;

create function private.ty_phu_view(g uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'state', m.state || jsonb_build_object('deckCount', coalesce((select jsonb_array_length(d.deck) from private.ty_phu_decks d where d.match_id=g),0)),
  'serverNow', floor(extract(epoch from statement_timestamp())*1000))
 from public.ty_phu_matches m where m.id=g
$$;
create function private.ty_phu_receipt(p_actor uuid,p_request uuid,p_room uuid,p_game uuid,p_command jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare receipt private.ty_phu_receipts; begin
 select * into receipt from private.ty_phu_receipts where actor=p_actor and request_id=p_request;
 if not found then return null; end if;
 if receipt.room_id<>p_room or (p_game is not null and receipt.match_id<>p_game) or receipt.command is distinct from p_command then
  raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 return receipt.result;
end $$;
create function private.ty_phu_members(p_room uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'role',rm.role)),'[]'::jsonb)
 from public.room_members rm join public.profiles p on p.id=rm.user_id
 where rm.room_id=p_room and not exists(select 1 from public.bans b where b.room_id=p_room and b.user_id=rm.user_id)
$$;

-- Full state (including the deck) is returned only to the service role for the rules engine.
create function public.ty_phu_context(p_actor uuid,p_room uuid,p_game uuid,p_request uuid default null,p_command jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.ty_phu_matches; receipt jsonb; begin
 perform private.game_access(p_room,p_actor);
 select * into m from public.ty_phu_matches where id=p_game and room_id=p_room;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p_request is not null then
  receipt:=private.ty_phu_receipt(p_actor,p_request,p_room,p_game,p_command);
  if receipt is not null then return jsonb_build_object('receipt',receipt); end if;
 end if;
 return jsonb_build_object(
  'state', m.state || jsonb_build_object('deck',coalesce((select d.deck from private.ty_phu_decks d where d.match_id=p_game),'[]'::jsonb)),
  'serverNow', floor(extract(epoch from statement_timestamp())*1000),
  'members', private.ty_phu_members(p_room));
end $$;

create function public.ty_phu_list(p_actor uuid,p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.game_access(p_room,p_actor);
 return jsonb_build_object('serverNow',floor(extract(epoch from statement_timestamp())*1000),'matches',
  coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.state->>'name','status',m.status,'host',m.state->>'host',
   'players',(select jsonb_agg(jsonb_build_object('id',p->>'id','name',p->>'name','color',(p->>'color')::int,'status',p->>'status')) from jsonb_array_elements(m.state->'players') p),
   'winner',m.state->>'winner','createdAt',m.created_at) order by m.created_at desc)
  from (select * from public.ty_phu_matches where room_id=p_room order by created_at desc limit 20) m),'[]'::jsonb));
end $$;

create function public.ty_phu_create(p_actor uuid,p_room uuid,p_request uuid,p_command jsonb,p_state jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt jsonb; result jsonb; g uuid; public_state jsonb; begin
 perform pg_advisory_xact_lock(hashtextextended('ty_phu:'||p_actor::text||':'||p_request::text,0));
 perform 1 from public.rooms where id=p_room for update;
 perform private.game_access(p_room,p_actor);
 receipt:=private.ty_phu_receipt(p_actor,p_request,p_room,null,p_command);
 if receipt is not null then return receipt; end if;
 public_state:=p_state-'deck';
 if not private.ty_phu_valid_state(public_state) or p_state->>'host'<>p_actor::text or p_state->>'room'<>p_room::text
 or jsonb_array_length(p_state->'players')<>1 or p_state->'players'->0->>'id'<>p_actor::text
 or p_state->>'status'<>'WAITING' or p_state->>'version'<>'0' then raise exception 'INVALID_INPUT'; end if;
 if (select count(*) from public.ty_phu_matches where room_id=p_room and status not in ('FINISHED','CANCELLED'))>=6 then
  raise exception 'TYPHU_TABLE_LIMIT'; end if;
 if not public.consume_rate_limit('ty_phu:create:'||p_actor::text,6,3600) then raise exception 'RATE_LIMITED'; end if;
 g:=(p_state->>'id')::uuid;
 -- The display name comes from the profile, never from the request.
 public_state:=jsonb_set(public_state,'{players,0,name}',to_jsonb((select name from public.profiles where id=p_actor)));
 insert into public.ty_phu_matches(id,room_id,state,version,status) values(g,p_room,public_state,0,'WAITING');
 insert into private.ty_phu_decks values(g,coalesce(p_state->'deck','[]'::jsonb));
 result:=private.ty_phu_view(g);
 insert into private.ty_phu_receipts(actor,request_id,room_id,match_id,command,result) values(p_actor,p_request,p_room,g,p_command,result);
 perform realtime.send('{}'::jsonb,'ty_phu.list','room:'||p_room::text,true);
 return result;
end $$;

create function public.ty_phu_commit(p_actor uuid,p_room uuid,p_game uuid,p_request uuid,p_command jsonb,p_version bigint,p_state jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.ty_phu_matches; receipt jsonb; result jsonb; public_state jsonb; begin
 perform pg_advisory_xact_lock(hashtextextended('ty_phu:'||p_actor::text||':'||p_request::text,0));
 perform 1 from public.rooms where id=p_room for update;
 perform private.game_access(p_room,p_actor);
 select * into m from public.ty_phu_matches where id=p_game and room_id=p_room for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 receipt:=private.ty_phu_receipt(p_actor,p_request,p_room,p_game,p_command);
 if receipt is not null then return receipt; end if;
 if m.version<>p_version then raise exception 'TYPHU_STALE'; end if;
 public_state:=p_state-'deck';
 if not private.ty_phu_valid_state(public_state) or p_state->>'id'<>p_game::text or p_state->>'room'<>p_room::text
 or (p_state->>'version')::bigint<>p_version+1 then raise exception 'INVALID_INPUT'; end if;
 -- Seated players must still belong to the room; the engine retires anyone who left first.
 if exists(select 1 from jsonb_array_elements(p_state->'players') p where p->>'status'='ACTIVE' and p_state->>'status' in ('WAITING','PLAYING')
  and (not exists(select 1 from public.room_members where room_id=p_room and user_id=(p->>'id')::uuid)
   or exists(select 1 from public.bans where room_id=p_room and user_id=(p->>'id')::uuid))) then raise exception 'TYPHU_STALE'; end if;
 update public.ty_phu_matches set state=public_state,version=p_version+1,status=p_state->>'status',
  deadline=case when p_state->>'deadline' is null then null else to_timestamp((p_state->>'deadline')::numeric/1000) end,
  updated_at=now() where id=p_game;
 update private.ty_phu_decks set deck=coalesce(p_state->'deck','[]'::jsonb) where match_id=p_game;
 if p_state->>'status'='FINISHED' and p_state->>'winner' is not null then
  insert into public.ty_phu_results values(p_game,(p_state->>'winner')::uuid,p_state->>'winReason',p_state->'players',now()) on conflict do nothing;
 end if;
 result:=private.ty_phu_view(p_game);
 insert into private.ty_phu_receipts(actor,request_id,room_id,match_id,command,result) values(p_actor,p_request,p_room,p_game,p_command,result);
 -- Broadcasts carry only the version; clients refetch through the authorised API.
 perform realtime.send(jsonb_build_object('version',p_version+1),'ty_phu.updated','typhu:'||p_game::text,true);
 if m.status is distinct from p_state->>'status' or p_command->>'action' in ('join','leave','ready') then
  perform realtime.send('{}'::jsonb,'ty_phu.list','room:'||p_room::text,true); end if;
 return result;
end $$;

create function public.ty_phu_due() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'room',m.room_id,'actor',r.owner_id)),'[]'::jsonb)
 from (select * from public.ty_phu_matches where status='PLAYING' and deadline<=now() order by deadline limit 6) m
 join public.rooms r on r.id=m.room_id
$$;

create function private.ty_phu_member(g uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ty_phu_matches where id=g and private.is_member(room_id))
$$;
create function private.ty_phu_topic_allowed(t text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if t !~ '^typhu:[0-9a-fA-F-]{36}$' then return false; end if;
 return private.ty_phu_member(substr(t,7)::uuid);
exception when invalid_text_representation then return false;
end $$;

alter table public.ty_phu_matches enable row level security;
alter table public.ty_phu_results enable row level security;
revoke all on public.ty_phu_matches, public.ty_phu_results from public,anon,authenticated;
grant select on public.ty_phu_matches, public.ty_phu_results to authenticated;
grant all on public.ty_phu_matches, public.ty_phu_results to service_role;
create policy ty_phu_room_read on public.ty_phu_matches for select to authenticated using(private.is_member(room_id));
create policy ty_phu_results_read on public.ty_phu_results for select to authenticated using(private.ty_phu_member(match_id));
create policy ty_phu_private_receive on realtime.messages for select to authenticated
 using(extension='broadcast' and private.ty_phu_topic_allowed(realtime.topic()));

revoke all on function private.ty_phu_valid_state(jsonb),private.ty_phu_view(uuid),private.ty_phu_receipt(uuid,uuid,uuid,uuid,jsonb),
 private.ty_phu_members(uuid),private.ty_phu_member(uuid),private.ty_phu_topic_allowed(text) from public,anon,authenticated;
grant execute on function private.ty_phu_member(uuid),private.ty_phu_topic_allowed(text) to authenticated;
revoke all on function public.ty_phu_context(uuid,uuid,uuid,uuid,jsonb),public.ty_phu_list(uuid,uuid),
 public.ty_phu_create(uuid,uuid,uuid,jsonb,jsonb),public.ty_phu_commit(uuid,uuid,uuid,uuid,jsonb,bigint,jsonb),public.ty_phu_due()
 from public,anon,authenticated;
grant execute on function public.ty_phu_context(uuid,uuid,uuid,uuid,jsonb),public.ty_phu_list(uuid,uuid),
 public.ty_phu_create(uuid,uuid,uuid,jsonb,jsonb),public.ty_phu_commit(uuid,uuid,uuid,uuid,jsonb,bigint,jsonb),public.ty_phu_due()
 to service_role;
