create function private.bau_member(t uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bau_cua_tables g join public.bau_cua_settings s on s.room_id=g.room_id
 where g.id=t and private.is_member(g.room_id)
 and not exists(select 1 from public.bau_cua_table_members b where b.table_id=t and b.user_id=auth.uid() and b.banned)
 and ((s.settings->>'spectators')::boolean
 or exists(select 1 from public.room_members m where m.room_id=g.room_id and m.user_id=auth.uid() and (m.role='owner' or (m.role='moderator' and (s.settings->>'moderatorManage')::boolean)))
 or exists(select 1 from public.bau_cua_table_members b where b.table_id=t and b.user_id=auth.uid() and not b.spectator)))
$$;
create function private.bau_round_member(r uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bau_cua_rounds b join public.bau_cua_tables t on t.id=b.table_id join public.bau_cua_settings s on s.room_id=t.room_id
 where b.id=r and private.bau_member(b.table_id) and ((s.settings->>'publishHistory')::boolean
 or b.number=(select max(number) from public.bau_cua_rounds where table_id=b.table_id)
 or exists(select 1 from public.room_members m where m.room_id=t.room_id and m.user_id=auth.uid() and (m.role='owner' or (m.role='moderator' and (s.settings->>'moderatorManage')::boolean)))))
$$;
create function private.bau_penalty_member(p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bau_cua_penalty_executions e join public.bau_cua_settings s on s.room_id=e.room_id
 where e.id=p and private.is_member(e.room_id) and (e.announce or e.user_id=auth.uid()
 or exists(select 1 from public.room_members m where m.room_id=e.room_id and m.user_id=auth.uid()
 and (m.role='owner' or (m.role='moderator' and ((s.settings->>'moderatorManage')::boolean or (s.settings->>'moderatorRestore')::boolean))))))
$$;
create function private.bau_topic_allowed(topic text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if topic !~ '^bau:[0-9a-f-]{36}$' then return false; end if;
 return private.bau_member(substr(topic,5)::uuid);
exception when invalid_text_representation then return false; end $$;
create policy bau_private_receive on realtime.messages for select to authenticated
 using(extension='broadcast' and private.bau_topic_allowed(realtime.topic()));

-- Finish known results or refund unrevealed rounds before a room/user cascade.
create function private.bau_dispose(t uuid) returns void language plpgsql set search_path='' as $$
declare r public.bau_cua_rounds;
begin
 select * into r from public.bau_cua_rounds where table_id=t order by number desc limit 1 for update;
 if r.status='REVEALING' then
 update public.bau_cua_rounds set deadline=now() where id=r.id; perform private.bau_settle(r.id);
 elsif r.status in ('BETTING_OPEN','BETTING_LOCKED','SHAKING') then perform private.bau_cancel(t,'Phòng hoặc danh tính bị xóa'); end if;
end $$;
create function private.bau_room_departing() returns trigger language plpgsql security definer set search_path='' as $$
declare t uuid; begin
 perform private.bau_lock();
 for t in select id from public.bau_cua_tables where room_id=old.id order by id loop perform private.bau_dispose(t); end loop;
 return old;
end $$;
create trigger bau_before_room_delete before delete on public.rooms for each row execute function private.bau_room_departing();
create function private.bau_user_departing() returns trigger language plpgsql security definer set search_path='' as $$
declare t uuid; begin
 -- Same order as API commands; room IDs sorted when a user participated across rooms.
 perform 1 from public.rooms where id in(select g.room_id from public.bau_cua_tables g join public.bau_cua_rounds r on r.table_id=g.id
 where r.status not in ('RESULT','CANCELLED') and (r.dealer_id=old.id or exists(select 1 from public.bau_cua_bets b where b.round_id=r.id and b.user_id=old.id))) order by id for update;
 perform private.bau_lock();
 for t in select distinct r.table_id from public.bau_cua_rounds r where r.status not in ('RESULT','CANCELLED')
 and (r.dealer_id=old.id or exists(select 1 from public.bau_cua_bets b where b.round_id=r.id and b.user_id=old.id)) order by r.table_id loop perform private.bau_dispose(t); end loop;
 return old;
end $$;
create trigger bau_before_user_delete before delete on auth.users for each row execute function private.bau_user_departing();

do $$ declare t text; f record; rule text; begin
 foreach t in array array['coin_wallets','coin_ledger','coin_claims','bau_cua_settings','bau_cua_tables','bau_cua_table_members','bau_cua_dealer_queue','bau_cua_dealer_sessions','bau_cua_rounds','bau_cua_bets','bau_cua_round_events','bau_cua_penalty_executions','bau_cua_penalty_songs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('grant select on public.%I to authenticated',t);
 rule:=case when t in ('coin_wallets','coin_ledger','coin_claims') then 'user_id=auth.uid()'
 when t='bau_cua_settings' then 'private.is_member(room_id)'
 when t='bau_cua_tables' then 'private.bau_member(id)'
 when t='bau_cua_bets' then 'private.bau_round_member(round_id)'
 when t='bau_cua_rounds' then 'private.bau_round_member(id)'
 when t='bau_cua_round_events' then 'private.bau_member(table_id) and (round_id is null or private.bau_round_member(round_id))'
 when t='bau_cua_penalty_executions' then 'private.bau_penalty_member(id)'
 when t='bau_cua_penalty_songs' then 'private.bau_penalty_member(penalty_id)'
 else 'private.bau_member(table_id)' end;
 execute format('create policy bau_read on public.%I for select to authenticated using(%s)',t,rule);
 end loop;
 foreach t in array array['bau_economy','coin_grants','bau_seeds','bau_receipts','bau_outbox'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated',t);
 execute format('grant all on private.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure sig,n.nspname ns from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where p.proname like 'bau_%' and n.nspname in ('public','private') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 if f.ns='public' then execute format('grant execute on function %s to service_role',f.sig); end if;
 end loop;
end $$;
grant execute on function private.bau_member(uuid),private.bau_round_member(uuid),private.bau_penalty_member(uuid),private.bau_topic_allowed(text) to authenticated;
