-- The owner's own AI (202611260006) now belongs to the room, not to Tarot: every AI feature in the
-- room uses it. Saved setups and their sealed keys move over unchanged; only names change.
drop function public.tarot_ai_view(uuid,uuid);
drop function public.tarot_ai_configure(uuid,uuid,boolean,text,text,text,text,boolean);
drop function public.tarot_ai_secret(uuid);
drop function private.tarot_ai_public(private.tarot_ai_settings);
drop function private.tarot_owner(uuid,uuid);
alter table private.tarot_ai_settings rename to room_ai_settings;
alter table private.room_ai_settings rename constraint tarot_ai_settings_pkey to room_ai_settings_pkey;

create function private.room_ai_owner(p_actor uuid,p_room uuid) returns void language plpgsql stable set search_path='' as $$
begin
  if not exists(select 1 from public.rooms where id=p_room) then raise exception 'ROOM_NOT_FOUND'; end if;
  if not exists(select 1 from public.room_members where room_id=p_room and user_id=p_actor and role='owner')
    or exists(select 1 from public.bans where room_id=p_room and user_id=p_actor) then raise exception 'PERMISSION_DENIED'; end if;
end $$;

create function private.room_ai_public(s private.room_ai_settings) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('enabled',coalesce(s.enabled,false),'base_url',coalesce(s.base_url,''),'model',coalesce(s.model,''),
    'has_key',s.key_cipher is not null,'key_hint',s.key_hint,'updated_at',s.updated_at)
$$;

-- What the owner sees in the room settings: everything except the key itself.
create function public.room_ai_view(p_actor uuid,p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.room_ai_settings;
begin
  perform private.room_ai_owner(p_actor,p_room);
  select * into s from private.room_ai_settings where room_id=p_room;
  return private.room_ai_public(s);
end $$;

-- p_cipher/p_hint: null keeps the saved key; p_clear removes it.
create function public.room_ai_configure(p_actor uuid,p_room uuid,p_enabled boolean,p_base_url text,p_model text,
  p_cipher text,p_hint text,p_clear boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.room_ai_settings;
begin
  if p_actor is null or p_room is null or p_enabled is null or p_base_url is null or p_model is null or p_clear is null
    then raise exception 'INVALID_INPUT'; end if;
  perform private.room_ai_owner(p_actor,p_room);
  insert into private.room_ai_settings(room_id) values(p_room) on conflict do nothing;
  select * into s from private.room_ai_settings where room_id=p_room for update;
  if p_clear then s.key_cipher:=null; s.key_hint:=null;
  elsif p_cipher is not null then s.key_cipher:=p_cipher; s.key_hint:=p_hint; end if;
  if p_enabled and (p_base_url='' or btrim(p_model)='' or s.key_cipher is null) then raise exception 'ROOM_AI_INCOMPLETE'; end if;
  update private.room_ai_settings set enabled=p_enabled,base_url=p_base_url,model=btrim(p_model),
    key_cipher=s.key_cipher,key_hint=s.key_hint,updated_by=p_actor,updated_at=now()
    where room_id=p_room returning * into s;
  -- Never the key, hint or URL in the log: only that the AI setup changed.
  insert into public.audit_logs(room_id,actor,action,details)
    values(p_room,p_actor,'room.ai_settings',jsonb_build_object('enabled',p_enabled,'key_changed',p_clear or p_cipher is not null));
  return private.room_ai_public(s);
end $$;

-- For the worker only: the room's AI with its sealed key (also while switched off, to test it again).
create function public.room_ai_secret(p_room uuid) returns jsonb
language sql security definer stable set search_path='' as $$
  select jsonb_build_object('enabled',s.enabled,'base_url',s.base_url,'model',s.model,'key_cipher',s.key_cipher)
  from private.room_ai_settings s where s.room_id=p_room and s.key_cipher is not null
$$;

revoke all on function private.room_ai_owner(uuid,uuid),private.room_ai_public(private.room_ai_settings),
  public.room_ai_view(uuid,uuid),public.room_ai_configure(uuid,uuid,boolean,text,text,text,text,boolean),
  public.room_ai_secret(uuid) from public,anon,authenticated;
grant execute on function public.room_ai_view(uuid,uuid),
  public.room_ai_configure(uuid,uuid,boolean,text,text,text,text,boolean),public.room_ai_secret(uuid) to service_role;
