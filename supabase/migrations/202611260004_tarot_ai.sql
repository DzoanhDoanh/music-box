-- AI-written readings live inside the reading's result as result.ai, so every member sees the same
-- text and history keeps it. Only the worker (service_role) writes it, after the person who drew claims it.
--   ai = {status: 'pending'|'done'|'failed', at, attempts, text?}

-- Claim the right to write a reading. Returns the reading, or null when one is already being
-- written (under 90 s), is finished, or has used its 3 attempts.
create function public.tarot_ai_claim(p_actor uuid,p_room uuid,p_reading uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t private.tarot_readings; ai jsonb; tries int; now_at timestamptz:=clock_timestamp();
begin
  if p_actor is null or p_room is null or p_reading is null then raise exception 'INVALID_INPUT'; end if;
  select * into t from private.tarot_readings where id=p_reading and room_id=p_room for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if t.actor<>p_actor or not exists(select 1 from public.room_members where room_id=p_room and user_id=p_actor)
    or exists(select 1 from public.bans where room_id=p_room and user_id=p_actor) then raise exception 'PERMISSION_DENIED'; end if;
  ai:=t.result->'ai';
  tries:=coalesce((ai->>'attempts')::int,0);
  if ai->>'status'='done' or tries>=3
    or (ai->>'status'='pending' and (ai->>'at')::timestamptz>now_at-interval '90 seconds') then return null; end if;
  update private.tarot_readings set result=result||jsonb_build_object('ai',
    jsonb_build_object('status','pending','at',now_at,'attempts',tries+1))
    where id=p_reading returning result into t.result;
  update public.rooms set version=version+1,updated_at=now_at where id=p_room;
  return t.result;
end $$;

-- Store the outcome of a claimed attempt. Ignored if the reading is gone or no longer pending.
create function public.tarot_ai_save(p_room uuid,p_reading uuid,p_ok boolean,p_text text) returns boolean
language plpgsql security definer set search_path='' as $$
declare now_at timestamptz:=clock_timestamp();
begin
  if p_ok and (p_text is null or btrim(p_text)='' or char_length(p_text)>8000) then raise exception 'INVALID_INPUT'; end if;
  update private.tarot_readings set result=result||jsonb_build_object('ai',
    jsonb_build_object('status',case when p_ok then 'done' else 'failed' end,'at',now_at,
      'attempts',coalesce((result->'ai'->>'attempts')::int,1))
    ||case when p_ok then jsonb_build_object('text',p_text) else '{}'::jsonb end)
    where id=p_reading and room_id=p_room and result->'ai'->>'status'='pending';
  if not found then return false; end if;
  update public.rooms set version=version+1,updated_at=now_at where id=p_room;
  return true;
end $$;

revoke all on function public.tarot_ai_claim(uuid,uuid,uuid),public.tarot_ai_save(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.tarot_ai_claim(uuid,uuid,uuid),public.tarot_ai_save(uuid,uuid,boolean,text) to service_role;
