-- Owner management is additive; existing positions, rules and results are untouched.
create table private.game_removed_seats (
 match_id uuid references public.game_matches on delete cascade,
 user_id uuid references auth.users on delete cascade,
 primary key(match_id,user_id)
);
-- Survives deletion to make a lost delete response safely retryable by its original actor.
create table private.deletion_receipts (
 actor uuid references auth.users on delete cascade,
 request_id uuid not null,
 kind text not null check(kind in ('room','game')),
 room_id uuid not null,
 target_id uuid not null,
 name text not null,
 primary key(actor,request_id)
);
-- A delayed retry of CREATE must not recreate a table the owner already deleted.
create table private.deleted_game_creates (
 actor uuid references auth.users on delete cascade,
 request_id uuid not null,
 room_id uuid references public.rooms on delete cascade,
 primary key(actor,request_id)
);
alter table private.game_removed_seats enable row level security;
alter table private.deletion_receipts enable row level security;
alter table private.deleted_game_creates enable row level security;
revoke all on private.game_removed_seats,private.deletion_receipts,private.deleted_game_creates from public,anon,authenticated;
grant all on private.game_removed_seats,private.deletion_receipts,private.deleted_game_creates to service_role;

alter function private.game_view(uuid) rename to game_view_before_management;
create function private.game_view(g uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select private.game_view_before_management(g) || jsonb_build_object('removedPlayers',
 coalesce((select jsonb_agg(user_id order by user_id) from private.game_removed_seats where match_id=g),'[]'::jsonb))
$$;
revoke all on function private.game_view(uuid) from public,anon,authenticated;

alter function public.game_commit(uuid,uuid,uuid,uuid,jsonb,bigint,jsonb) set schema private;
alter function private.game_commit(uuid,uuid,uuid,uuid,jsonb,bigint,jsonb) rename to game_commit_before_management;
revoke all on function private.game_commit_before_management(uuid,uuid,uuid,uuid,jsonb,bigint,jsonb) from public,anon,authenticated,service_role;
create function public.game_commit(p_actor uuid,p_room uuid,p_game uuid,p_request uuid,p_command jsonb,p_version bigint,p_state jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.game_matches; role_name text; target uuid; begin
 perform pg_advisory_xact_lock(hashtextextended('game:'||p_actor::text||':'||p_request::text,0));
 perform 1 from public.rooms where id=p_room for update;
 role_name:=private.game_access(p_room,p_actor);
 select * into m from public.game_matches where id=p_game and room_id=p_room for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p_command->>'action'='kick' then
   target:=(p_command->>'user_id')::uuid;
   if (m.state->>'host'<>p_actor::text and role_name<>'owner') or target is null or target=p_actor
   or exists(select 1 from public.rooms where id=p_room and owner_id=target) then raise exception 'PERMISSION_DENIED'; end if;
 end if;
 -- Delegate replay comparison before changing any marker. Old JOIN replays cannot undo a kick.
 if exists(select 1 from private.game_receipts where actor=p_actor and request_id=p_request) then
   return private.game_commit_before_management(p_actor,p_room,p_game,p_request,p_command,p_version,p_state);
 end if;
 if m.version<>p_version then raise exception 'GAME_STALE'; end if;
 if p_command->>'action'='kick' then
   if m.status not in ('WAITING','READY','PLAYING','PAUSED') or not exists(
     select 1 from jsonb_array_elements(m.state->'players') p where p->>'id'=target::text and p->>'status'='ACTIVE'
   ) then raise exception 'GAME_ACTION_INVALID'; end if;
   if exists(select 1 from jsonb_array_elements(p_state->'players') p
      where p->>'id'=target::text and (m.status in ('WAITING','READY') or p->>'status'<>'FORFEITED'))
   then raise exception 'INVALID_INPUT'; end if;
   insert into private.game_removed_seats values(p_game,target) on conflict do nothing;
 elsif p_command->>'action'='join' then
   delete from private.game_removed_seats where match_id=p_game and user_id=p_actor;
 elsif p_command->>'action'='rematch' and exists(
   select 1 from jsonb_array_elements(p_state->'players') p join private.game_removed_seats k
   on k.user_id=(p->>'id')::uuid and k.match_id=p_game
 ) then raise exception 'GAME_STALE';
 end if;
 return private.game_commit_before_management(p_actor,p_room,p_game,p_request,p_command,p_version,p_state);
end $$;

alter function public.game_create(uuid,uuid,uuid,jsonb,jsonb) set schema private;
alter function private.game_create(uuid,uuid,uuid,jsonb,jsonb) rename to game_create_before_management;
revoke all on function private.game_create_before_management(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.game_create(p_actor uuid,p_room uuid,p_request uuid,p_command jsonb,p_state jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('game:'||p_actor::text||':'||p_request::text,0));
 perform 1 from public.rooms where id=p_room for update;
 perform private.game_access(p_room,p_actor);
 if exists(select 1 from private.deleted_game_creates where actor=p_actor and request_id=p_request)
 then raise exception 'NOT_FOUND'; end if;
 return private.game_create_before_management(p_actor,p_room,p_request,p_command,p_state);
end $$;

create function public.game_delete(p_actor uuid,p_room uuid,p_game uuid,p_request uuid,p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.game_matches; receipt private.deletion_receipts; role_name text; begin
 perform pg_advisory_xact_lock(hashtextextended('delete:'||p_actor::text||':'||p_request::text,0));
 perform 1 from public.rooms where id=p_room for update;
 role_name:=private.game_access(p_room,p_actor);
 select * into receipt from private.deletion_receipts where actor=p_actor and request_id=p_request;
 if found then
   if receipt.kind<>'game' or receipt.room_id<>p_room or receipt.target_id<>p_game or receipt.name is distinct from p_name
   then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return jsonb_build_object('deleted',true);
 end if;
 select * into m from public.game_matches where id=p_game and room_id=p_room for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if role_name<>'owner' and m.state->>'host'<>p_actor::text then raise exception 'PERMISSION_DENIED'; end if;
 if m.state->>'name' is distinct from p_name then raise exception 'DELETE_NAME_MISMATCH'; end if;
 insert into private.deleted_game_creates select actor,request_id,room_id from private.game_receipts
 where match_id=p_game and command->>'action'='create' on conflict do nothing;
 insert into private.deletion_receipts values(p_actor,p_request,'game',p_room,p_game,p_name);
 delete from public.game_matches where id=p_game;
 insert into public.audit_logs(room_id,actor,action,details) values(p_room,p_actor,'game.delete',jsonb_build_object('game',p_game));
 perform realtime.send(jsonb_build_object('version',m.version+1),'game.state_updated','game:'||p_game::text,true);
 perform realtime.send('{}'::jsonb,'games.updated','room:'||p_room::text,true);
 return jsonb_build_object('deleted',true);
end $$;

create function public.room_delete(p_actor uuid,p_room uuid,p_request uuid,p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms; receipt private.deletion_receipts; begin
 perform pg_advisory_xact_lock(hashtextextended('delete:'||p_actor::text||':'||p_request::text,0));
 select * into r from public.rooms where id=p_room for update;
 select * into receipt from private.deletion_receipts where actor=p_actor and request_id=p_request;
 if found then
   if receipt.kind<>'room' or receipt.room_id<>p_room or receipt.target_id<>p_room or receipt.name is distinct from p_name
   then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return jsonb_build_object('deleted',true);
 end if;
 if r.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
 if r.owner_id<>p_actor or private.game_access(p_room,p_actor)<>'owner' then raise exception 'PERMISSION_DENIED'; end if;
 if r.name is distinct from p_name then raise exception 'DELETE_NAME_MISMATCH'; end if;
 insert into private.deletion_receipts values(p_actor,p_request,'room',p_room,p_room,p_name);
 delete from public.rooms where id=p_room;
 perform realtime.send(jsonb_build_object('version',r.version+1),'room.updated','room:'||p_room::text,true);
 return jsonb_build_object('deleted',true);
end $$;

revoke all on function public.game_create(uuid,uuid,uuid,jsonb,jsonb),public.game_commit(uuid,uuid,uuid,uuid,jsonb,bigint,jsonb),
 public.game_delete(uuid,uuid,uuid,uuid,text),public.room_delete(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.game_create(uuid,uuid,uuid,jsonb,jsonb),public.game_commit(uuid,uuid,uuid,uuid,jsonb,bigint,jsonb),
 public.game_delete(uuid,uuid,uuid,uuid,text) ,public.room_delete(uuid,uuid,uuid,text) to service_role;
