-- Tỷ Phú computer seats: players flagged "bot" are added by the host through the rules engine
-- and are not room members, so the membership check on commit skips them.
create or replace function public.ty_phu_commit(p_actor uuid,p_room uuid,p_game uuid,p_request uuid,p_command jsonb,p_version bigint,p_state jsonb)
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
 if exists(select 1 from jsonb_array_elements(p_state->'players') p where p->>'status'='ACTIVE' and coalesce(p->>'bot','false')<>'true' and p_state->>'status' in ('WAITING','PLAYING')
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
 if m.status is distinct from p_state->>'status' or p_command->>'action' in ('join','leave','ready','add_bot','remove_bot','rematch') then
  perform realtime.send('{}'::jsonb,'ty_phu.list','room:'||p_room::text,true); end if;
 return result;
end $$;
