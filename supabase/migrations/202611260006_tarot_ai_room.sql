-- A room's owner may bring their own AI for Tarot readings: any OpenAI-compatible API
-- (base URL + key + model), like Cursor's "Override OpenAI Base URL".
-- The worker encrypts the key (AES-GCM, bound to the room) before it reaches the database;
-- the database never sees it in clear, and no read path returns it to a browser.
create table private.tarot_ai_settings(
  room_id uuid primary key references public.rooms on delete cascade,
  enabled boolean not null default false,
  base_url text not null default '' check(char_length(base_url)<=300 and (base_url='' or base_url ~ '^https://')),
  model text not null default '' check(char_length(model)<=120),
  key_cipher text check(key_cipher is null or char_length(key_cipher) between 20 and 2000),
  key_hint text check(key_hint is null or char_length(key_hint)<=8),
  updated_by uuid references auth.users on delete set null,
  updated_at timestamptz not null default now());
revoke all on private.tarot_ai_settings from public, anon, authenticated;

create function private.tarot_owner(p_actor uuid,p_room uuid) returns void language plpgsql stable set search_path='' as $$
begin
  if not exists(select 1 from public.rooms where id=p_room) then raise exception 'ROOM_NOT_FOUND'; end if;
  if not exists(select 1 from public.room_members where room_id=p_room and user_id=p_actor and role='owner')
    or exists(select 1 from public.bans where room_id=p_room and user_id=p_actor) then raise exception 'PERMISSION_DENIED'; end if;
end $$;

create function private.tarot_ai_public(s private.tarot_ai_settings) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('enabled',coalesce(s.enabled,false),'base_url',coalesce(s.base_url,''),'model',coalesce(s.model,''),
    'has_key',s.key_cipher is not null,'key_hint',s.key_hint,'updated_at',s.updated_at)
$$;

-- What the owner sees in the room settings: everything except the key itself.
create function public.tarot_ai_view(p_actor uuid,p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.tarot_ai_settings;
begin
  perform private.tarot_owner(p_actor,p_room);
  select * into s from private.tarot_ai_settings where room_id=p_room;
  return private.tarot_ai_public(s);
end $$;

-- p_cipher/p_hint: null keeps the saved key; p_clear removes it.
create function public.tarot_ai_configure(p_actor uuid,p_room uuid,p_enabled boolean,p_base_url text,p_model text,
  p_cipher text,p_hint text,p_clear boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.tarot_ai_settings;
begin
  if p_actor is null or p_room is null or p_enabled is null or p_base_url is null or p_model is null or p_clear is null
    then raise exception 'INVALID_INPUT'; end if;
  perform private.tarot_owner(p_actor,p_room);
  insert into private.tarot_ai_settings(room_id) values(p_room) on conflict do nothing;
  select * into s from private.tarot_ai_settings where room_id=p_room for update;
  if p_clear then s.key_cipher:=null; s.key_hint:=null;
  elsif p_cipher is not null then s.key_cipher:=p_cipher; s.key_hint:=p_hint; end if;
  if p_enabled and (p_base_url='' or btrim(p_model)='' or s.key_cipher is null) then raise exception 'TAROT_AI_INCOMPLETE'; end if;
  update private.tarot_ai_settings set enabled=p_enabled,base_url=p_base_url,model=btrim(p_model),
    key_cipher=s.key_cipher,key_hint=s.key_hint,updated_by=p_actor,updated_at=now()
    where room_id=p_room returning * into s;
  -- Never the key, hint or URL in the log: only that the AI setup changed.
  insert into public.audit_logs(room_id,actor,action,details)
    values(p_room,p_actor,'tarot.ai_settings',jsonb_build_object('enabled',p_enabled,'key_changed',p_clear or p_cipher is not null));
  return private.tarot_ai_public(s);
end $$;

-- For the worker only: the room's AI with its encrypted key (also while switched off, for "test connection").
create function public.tarot_ai_secret(p_room uuid) returns jsonb
language sql security definer stable set search_path='' as $$
  select jsonb_build_object('enabled',s.enabled,'base_url',s.base_url,'model',s.model,'key_cipher',s.key_cipher)
  from private.tarot_ai_settings s where s.room_id=p_room and s.key_cipher is not null
$$;

revoke all on function private.tarot_owner(uuid,uuid),private.tarot_ai_public(private.tarot_ai_settings),
  public.tarot_ai_view(uuid,uuid),public.tarot_ai_configure(uuid,uuid,boolean,text,text,text,text,boolean),
  public.tarot_ai_secret(uuid) from public,anon,authenticated;
grant execute on function public.tarot_ai_view(uuid,uuid),
  public.tarot_ai_configure(uuid,uuid,boolean,text,text,text,text,boolean),public.tarot_ai_secret(uuid) to service_role;
