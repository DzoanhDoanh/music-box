-- Chat has its own sequence and invalidation event; it never updates queue/playback versions.
alter table public.rooms add column chat_sequence bigint not null default 0 check(chat_sequence between 0 and 9007199254740991);
create table private.chat_messages (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.rooms on delete cascade,
 sender_id uuid not null references public.profiles on delete cascade,
 sequence bigint not null, body text not null check(char_length(body)<=1000),
 created_at timestamptz not null default now(), deleted_at timestamptz,
 unique(room_id,sequence),
 check(deleted_at is not null or body ~ '[^[:space:]]')
);
create index on private.chat_messages(sender_id,created_at);
revoke all on private.chat_messages from public,anon,authenticated;

create function public.room_chat(p_actor uuid,p_room uuid,p_since bigint default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; begin
 if not exists(select 1 from public.room_members where room_id=p_room and user_id=p_actor)
 or exists(select 1 from public.bans where room_id=p_room and user_id=p_actor) then raise exception 'PERMISSION_DENIED'; end if;
 if p_since is null or p_since<0 or p_since>9007199254740991 then raise exception 'INVALID_INPUT'; end if;
 select jsonb_build_object('latest_sequence',r.chat_sequence,'read_sequence',p_since,
 'unread_count',(select count(*) from private.chat_messages m where m.room_id=p_room and m.sequence>p_since and m.sender_id<>p_actor and m.deleted_at is null and m.created_at>now()-interval '30 days'),
 'messages',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'sequence',m.sequence,'sender_id',m.sender_id,'sender',p.name,'body',m.body,'created_at',m.created_at,'deleted',m.deleted_at is not null) order by m.sequence),'[]'::jsonb)
 from (select * from private.chat_messages where room_id=p_room and created_at>now()-interval '30 days' order by sequence desc limit 100) m join public.profiles p on p.id=m.sender_id))
 into result from public.rooms r where r.id=p_room;
 return result;
end $$;

create function public.room_chat_command(p_actor uuid,p_room uuid,p_request uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare role_name text; receipt private.operation_receipts; message private.chat_messages; request_payload jsonb; result jsonb; next_sequence bigint; text_body text; begin
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,0));
 perform 1 from public.rooms where id=p_room for update;
 if not found then raise exception 'ROOM_NOT_FOUND'; end if;
 select role into role_name from public.room_members where room_id=p_room and user_id=p_actor;
 if role_name is null or exists(select 1 from public.bans where room_id=p_room and user_id=p_actor) then raise exception 'PERMISSION_DENIED'; end if;
 if p_request is null then raise exception 'INVALID_INPUT'; end if;
 request_payload:=case when p_command->>'action'='send' then jsonb_build_object('action','send','body_digest',encode(extensions.digest(p_command->>'body','sha256'),'hex')) else p_command end;
 select * into receipt from private.operation_receipts where actor=p_actor and request_id=p_request;
 if found then
   if receipt.scope<>'chat:'||p_room::text or receipt.payload is distinct from request_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return receipt.result;
 end if;
 if p_command->>'action'='send' then
   if not public.consume_rate_limit('chat:'||p_room::text||':'||p_actor::text,20,60) then raise exception 'RATE_LIMITED'; end if;
   if jsonb_typeof(p_command->'body') is distinct from 'string' then raise exception 'INVALID_INPUT'; end if;
   text_body:=btrim(p_command->>'body',E' \t\r\n');
   if char_length(text_body)>1000 or not text_body ~ '[^[:space:]]' then raise exception 'INVALID_INPUT'; end if;
   update public.rooms set chat_sequence=chat_sequence+1 where id=p_room returning chat_sequence into next_sequence;
   insert into private.chat_messages(room_id,sender_id,sequence,body) values(p_room,p_actor,next_sequence,text_body) returning * into message;
 elsif p_command->>'action'='remove' then
   select * into message from private.chat_messages where id=(p_command->>'message_id')::uuid and room_id=p_room;
   if not found then raise exception 'NOT_FOUND'; end if;
   if message.sender_id<>p_actor and role_name not in ('owner','moderator') then raise exception 'PERMISSION_DENIED'; end if;
   update private.chat_messages set body='',deleted_at=coalesce(deleted_at,now()) where id=message.id;
   insert into public.audit_logs(room_id,actor,action,details) values(p_room,p_actor,'chat.remove',jsonb_build_object('message_id',message.id));
 else raise exception 'INVALID_INPUT'; end if;
 delete from private.chat_messages where room_id=p_room and created_at<now()-interval '30 days';
 -- Never broadcast text/author data: previously authorized cached channels must refetch through Auth.
 perform realtime.send('{}'::jsonb,'chat.updated','room:'||p_room::text,true);
 result:=jsonb_build_object('id',message.id,'sequence',message.sequence);
 insert into private.operation_receipts values(p_actor,p_request,'chat:'||p_room::text,request_payload,result,now());
 return result;
end $$;

create function public.chat_export(p_actor uuid,p_offset integer default 0) returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at),'[]'::jsonb) from
 (select room_id,body,created_at from private.chat_messages where sender_id=p_actor and deleted_at is null and created_at>now()-interval '30 days' order by created_at desc,id limit 500 offset greatest(p_offset,0)) m;
$$;

revoke all on function public.room_chat(uuid,uuid,bigint),public.room_chat_command(uuid,uuid,uuid,jsonb),public.chat_export(uuid,integer) from public,anon,authenticated;
grant execute on function public.room_chat(uuid,uuid,bigint),public.room_chat_command(uuid,uuid,uuid,jsonb),public.chat_export(uuid,integer) to service_role;

create or replace function public.maintenance_cleanup() returns void language plpgsql security definer set search_path='' as $$ begin
 delete from public.youtube_search_cache where expires_at<now();
 delete from private.rate_limits where window_at<now()-interval '2 days';
 delete from private.operation_receipts where created_at<now()-interval '7 days';
 delete from private.room_presence where expires_at<now()-interval '1 day';
 delete from private.reorder_proposals where created_at<now()-interval '30 days';
 delete from private.chat_messages where created_at<now()-interval '30 days';
 update public.songs set title='Video cần cập nhật',channel='',thumbnail='/favicon.svg',duration=1 where verified_at<now()-interval '29 days' and title<>'Video cần cập nhật';
end $$;
revoke all on function public.maintenance_cleanup() from public,anon,authenticated;
grant execute on function public.maintenance_cleanup() to service_role;
