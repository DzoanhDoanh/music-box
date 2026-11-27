-- Tỷ Phú tables can be deleted by their host or the room owner, like Cờ Cá Ngựa tables.
-- Deleting removes the match with its deck, results and receipts (cascade).

alter table private.deletion_receipts drop constraint deletion_receipts_kind_check;
alter table private.deletion_receipts add constraint deletion_receipts_kind_check check(kind in ('room','game','ty_phu'));

-- A delayed retry of CREATE must not bring back a table that was deleted: its receipt went with it.
alter function public.ty_phu_create(uuid,uuid,uuid,jsonb,jsonb) set schema private;
alter function private.ty_phu_create(uuid,uuid,uuid,jsonb,jsonb) rename to ty_phu_create_before_delete;
revoke all on function private.ty_phu_create_before_delete(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.ty_phu_create(p_actor uuid,p_room uuid,p_request uuid,p_command jsonb,p_state jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('ty_phu:'||p_actor::text||':'||p_request::text,0));
 if exists(select 1 from private.deleted_game_creates where actor=p_actor and request_id=p_request)
 then raise exception 'NOT_FOUND'; end if;
 return private.ty_phu_create_before_delete(p_actor,p_room,p_request,p_command,p_state);
end $$;

create function public.ty_phu_delete(p_actor uuid,p_room uuid,p_game uuid,p_request uuid,p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.ty_phu_matches; receipt private.deletion_receipts; role_name text; begin
 perform pg_advisory_xact_lock(hashtextextended('delete:'||p_actor::text||':'||p_request::text,0));
 perform 1 from public.rooms where id=p_room for update;
 role_name:=private.game_access(p_room,p_actor);
 select * into receipt from private.deletion_receipts where actor=p_actor and request_id=p_request;
 if found then
   if receipt.kind<>'ty_phu' or receipt.room_id<>p_room or receipt.target_id<>p_game or receipt.name is distinct from p_name
   then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return jsonb_build_object('deleted',true);
 end if;
 select * into m from public.ty_phu_matches where id=p_game and room_id=p_room for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if role_name<>'owner' and m.state->>'host'<>p_actor::text then raise exception 'PERMISSION_DENIED'; end if;
 if m.state->>'name' is distinct from p_name then raise exception 'DELETE_NAME_MISMATCH'; end if;
 insert into private.deleted_game_creates select actor,request_id,room_id from private.ty_phu_receipts
 where match_id=p_game and command->>'action'='create' on conflict do nothing;
 insert into private.deletion_receipts values(p_actor,p_request,'ty_phu',p_room,p_game,p_name);
 delete from public.ty_phu_matches where id=p_game;
 insert into public.audit_logs(room_id,actor,action,details)
 values(p_room,p_actor,'ty_phu.delete',jsonb_build_object('game',p_game,'name',m.state->>'name'));
 -- Players at the table refetch and learn it is gone; the lobby list refreshes.
 perform realtime.send(jsonb_build_object('version',m.version+1),'ty_phu.updated','typhu:'||p_game::text,true);
 perform realtime.send('{}'::jsonb,'ty_phu.list','room:'||p_room::text,true);
 return jsonb_build_object('deleted',true);
end $$;

revoke all on function public.ty_phu_create(uuid,uuid,uuid,jsonb,jsonb),public.ty_phu_delete(uuid,uuid,uuid,uuid,text)
 from public,anon,authenticated;
grant execute on function public.ty_phu_create(uuid,uuid,uuid,jsonb,jsonb),public.ty_phu_delete(uuid,uuid,uuid,uuid,text)
 to service_role;
