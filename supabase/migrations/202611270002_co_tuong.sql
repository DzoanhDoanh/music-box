-- Cờ Tướng (xiangqi) tables. Rules and the computer player run in the Worker
-- (src/shared/co-tuong/engine.ts); PostgreSQL stores versioned state and enforces membership,
-- idempotency and optimistic concurrency, like Tỷ Phú.

create function private.co_tuong_valid_state(s jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
 return jsonb_typeof(s)='object'
 and s->>'schema'='1'
 and (s->>'id')::uuid is not null and (s->>'room')::uuid is not null and (s->>'host')::uuid is not null
 and s->>'status' in ('WAITING','PLAYING','FINISHED','CANCELLED')
 and (s->>'version')::bigint>=0
 and length(s->>'name') between 1 and 60
 and s->>'board' ~ '^[KAEHRCPkaehrcp.]{90}$'
 and s->>'turn' in ('r','b')
 and jsonb_typeof(s->'seats')='object'
 and jsonb_typeof(s->'moves')='array' and jsonb_array_length(s->'moves')<=600;
exception when others then return false;
end $$;

create table public.co_tuong_matches(
 id uuid primary key,
 room_id uuid not null references public.rooms on delete cascade,
 state jsonb not null check(private.co_tuong_valid_state(state)),
 version bigint not null check(version>=0),
 status text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(id=(state->>'id')::uuid and room_id=(state->>'room')::uuid and version=(state->>'version')::bigint and status=state->>'status')
);
create index co_tuong_matches_room on public.co_tuong_matches(room_id,created_at desc);
create table private.co_tuong_receipts(
 actor uuid not null references auth.users on delete cascade, request_id uuid not null,
 room_id uuid not null references public.rooms on delete cascade,
 match_id uuid not null references public.co_tuong_matches on delete cascade,
 command jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(actor,request_id)
);
alter table private.co_tuong_receipts enable row level security;
revoke all on private.co_tuong_receipts from public,anon,authenticated;
grant all on private.co_tuong_receipts to service_role;

alter table private.deletion_receipts drop constraint deletion_receipts_kind_check;
alter table private.deletion_receipts add constraint deletion_receipts_kind_check check(kind in ('room','game','ty_phu','co_tuong'));

create function private.co_tuong_view(g uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('state',m.state,'serverNow',floor(extract(epoch from statement_timestamp())*1000))
 from public.co_tuong_matches m where m.id=g
$$;
create function private.co_tuong_receipt(p_actor uuid,p_request uuid,p_room uuid,p_game uuid,p_command jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare receipt private.co_tuong_receipts; begin
 select * into receipt from private.co_tuong_receipts where actor=p_actor and request_id=p_request;
 if not found then return null; end if;
 if receipt.room_id<>p_room or (p_game is not null and receipt.match_id<>p_game) or receipt.command is distinct from p_command then
  raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 return receipt.result;
end $$;
-- Room changes reach everyone through the room channel: the list, and which table moved.
create function private.co_tuong_notify(p_room uuid,p_game uuid,p_version bigint) returns void
language sql security definer set search_path='' as $$
 select realtime.send(jsonb_build_object('game',p_game,'version',p_version),'co_tuong.updated','room:'||p_room::text,true)
$$;

create function public.co_tuong_context(p_actor uuid,p_room uuid,p_game uuid,p_request uuid default null,p_command jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.co_tuong_matches; receipt jsonb; begin
 perform private.game_access(p_room,p_actor);
 select * into m from public.co_tuong_matches where id=p_game and room_id=p_room;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p_request is not null then
  receipt:=private.co_tuong_receipt(p_actor,p_request,p_room,p_game,p_command);
  if receipt is not null then return jsonb_build_object('receipt',receipt); end if;
 end if;
 return jsonb_build_object('state',m.state,'serverNow',floor(extract(epoch from statement_timestamp())*1000),
  'members',private.ty_phu_members(p_room));
end $$;

create function public.co_tuong_list(p_actor uuid,p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.game_access(p_room,p_actor);
 return jsonb_build_object('serverNow',floor(extract(epoch from statement_timestamp())*1000),'matches',
  coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.state->>'name','status',m.status,'host',m.state->>'host',
   'seats',m.state->'seats','result',m.state->'result','moves',jsonb_array_length(m.state->'moves'),'createdAt',m.created_at)
   order by m.created_at desc)
  from (select * from public.co_tuong_matches where room_id=p_room and status<>'CANCELLED' order by created_at desc limit 20) m),'[]'::jsonb));
end $$;

create function public.co_tuong_create(p_actor uuid,p_room uuid,p_request uuid,p_command jsonb,p_state jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt jsonb; result jsonb; g uuid; s jsonb; side text; begin
 perform pg_advisory_xact_lock(hashtextextended('co_tuong:'||p_actor::text||':'||p_request::text,0));
 perform 1 from public.rooms where id=p_room for update;
 perform private.game_access(p_room,p_actor);
 if exists(select 1 from private.deleted_game_creates where actor=p_actor and request_id=p_request)
 then raise exception 'NOT_FOUND'; end if;
 receipt:=private.co_tuong_receipt(p_actor,p_request,p_room,null,p_command);
 if receipt is not null then return receipt; end if;
 side:=case when p_state->'seats'->'r'->>'id'=p_actor::text then 'r' when p_state->'seats'->'b'->>'id'=p_actor::text then 'b' end;
 if not private.co_tuong_valid_state(p_state) or p_state->>'host'<>p_actor::text or p_state->>'room'<>p_room::text
 or side is null or p_state->>'status' not in ('WAITING','PLAYING') or p_state->>'version'<>'0' then raise exception 'INVALID_INPUT'; end if;
 if (select count(*) from public.co_tuong_matches where room_id=p_room and status in ('WAITING','PLAYING'))>=10 then
  raise exception 'COTUONG_TABLE_LIMIT'; end if;
 if not public.consume_rate_limit('co_tuong:create:'||p_actor::text,20,3600) then raise exception 'RATE_LIMITED'; end if;
 g:=(p_state->>'id')::uuid;
 -- The display name comes from the profile, never from the request.
 s:=jsonb_set(p_state,array['seats',side,'name'],to_jsonb(left((select name from public.profiles where id=p_actor),40)));
 insert into public.co_tuong_matches(id,room_id,state,version,status) values(g,p_room,s,0,s->>'status');
 result:=private.co_tuong_view(g);
 insert into private.co_tuong_receipts(actor,request_id,room_id,match_id,command,result) values(p_actor,p_request,p_room,g,p_command,result);
 perform private.co_tuong_notify(p_room,g,0);
 return result;
end $$;

create function public.co_tuong_commit(p_actor uuid,p_room uuid,p_game uuid,p_request uuid,p_command jsonb,p_version bigint,p_state jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.co_tuong_matches; receipt jsonb; result jsonb; begin
 perform pg_advisory_xact_lock(hashtextextended('co_tuong:'||p_actor::text||':'||p_request::text,0));
 perform 1 from public.rooms where id=p_room for update;
 perform private.game_access(p_room,p_actor);
 select * into m from public.co_tuong_matches where id=p_game and room_id=p_room for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 receipt:=private.co_tuong_receipt(p_actor,p_request,p_room,p_game,p_command);
 if receipt is not null then return receipt; end if;
 if m.version<>p_version then raise exception 'COTUONG_STALE'; end if;
 if not private.co_tuong_valid_state(p_state) or p_state->>'id'<>p_game::text or p_state->>'room'<>p_room::text
 or (p_state->>'version')::bigint<>p_version+1 then raise exception 'INVALID_INPUT'; end if;
 -- Seated people must still belong to the room; the engine retires anyone who left first.
 if exists(select 1 from jsonb_each(p_state->'seats') e where jsonb_typeof(e.value)='object'
  and coalesce(e.value->>'bot','false')<>'true' and p_state->>'status' in ('WAITING','PLAYING')
  and (not exists(select 1 from public.room_members where room_id=p_room and user_id=(e.value->>'id')::uuid)
   or exists(select 1 from public.bans where room_id=p_room and user_id=(e.value->>'id')::uuid))) then raise exception 'COTUONG_STALE'; end if;
 update public.co_tuong_matches set state=p_state,version=p_version+1,status=p_state->>'status',updated_at=now() where id=p_game;
 result:=private.co_tuong_view(p_game);
 insert into private.co_tuong_receipts(actor,request_id,room_id,match_id,command,result) values(p_actor,p_request,p_room,p_game,p_command,result);
 perform private.co_tuong_notify(p_room,p_game,p_version+1);
 return result;
end $$;

create function public.co_tuong_delete(p_actor uuid,p_room uuid,p_game uuid,p_request uuid,p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.co_tuong_matches; receipt private.deletion_receipts; role_name text; begin
 perform pg_advisory_xact_lock(hashtextextended('delete:'||p_actor::text||':'||p_request::text,0));
 perform 1 from public.rooms where id=p_room for update;
 role_name:=private.game_access(p_room,p_actor);
 select * into receipt from private.deletion_receipts where actor=p_actor and request_id=p_request;
 if found then
   if receipt.kind<>'co_tuong' or receipt.room_id<>p_room or receipt.target_id<>p_game or receipt.name is distinct from p_name
   then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return jsonb_build_object('deleted',true);
 end if;
 select * into m from public.co_tuong_matches where id=p_game and room_id=p_room for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if role_name<>'owner' and m.state->>'host'<>p_actor::text then raise exception 'PERMISSION_DENIED'; end if;
 if m.state->>'name' is distinct from p_name then raise exception 'DELETE_NAME_MISMATCH'; end if;
 insert into private.deleted_game_creates select actor,request_id,room_id from private.co_tuong_receipts
 where match_id=p_game and command->>'action'='create' on conflict do nothing;
 insert into private.deletion_receipts values(p_actor,p_request,'co_tuong',p_room,p_game,p_name);
 delete from public.co_tuong_matches where id=p_game;
 insert into public.audit_logs(room_id,actor,action,details)
 values(p_room,p_actor,'co_tuong.delete',jsonb_build_object('game',p_game,'name',m.state->>'name'));
 perform private.co_tuong_notify(p_room,p_game,m.version+1);
 return jsonb_build_object('deleted',true);
end $$;

alter table public.co_tuong_matches enable row level security;
revoke all on public.co_tuong_matches from public,anon,authenticated;
grant select on public.co_tuong_matches to authenticated;
grant all on public.co_tuong_matches to service_role;
create policy co_tuong_room_read on public.co_tuong_matches for select to authenticated using(private.is_member(room_id));

revoke all on function private.co_tuong_valid_state(jsonb),private.co_tuong_view(uuid),
 private.co_tuong_receipt(uuid,uuid,uuid,uuid,jsonb),private.co_tuong_notify(uuid,uuid,bigint) from public,anon,authenticated;
revoke all on function public.co_tuong_context(uuid,uuid,uuid,uuid,jsonb),public.co_tuong_list(uuid,uuid),
 public.co_tuong_create(uuid,uuid,uuid,jsonb,jsonb),public.co_tuong_commit(uuid,uuid,uuid,uuid,jsonb,bigint,jsonb),
 public.co_tuong_delete(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.co_tuong_context(uuid,uuid,uuid,uuid,jsonb),public.co_tuong_list(uuid,uuid),
 public.co_tuong_create(uuid,uuid,uuid,jsonb,jsonb),public.co_tuong_commit(uuid,uuid,uuid,uuid,jsonb,bigint,jsonb),
 public.co_tuong_delete(uuid,uuid,uuid,uuid,text) to service_role;
