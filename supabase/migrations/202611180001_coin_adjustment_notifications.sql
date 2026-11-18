-- Existing admin adjustments already enforce authorization, idempotency and ledger writes.
-- Queue a private invalidation after the audit write, in that same transaction.
-- Never broadcast balances, amounts or the administrator's reason to the room.
create function private.bau_coin_adjustment_notice() returns trigger
language plpgsql set search_path='' as $$
begin
  insert into private.bau_outbox(room_id, version, kind, topic, payload)
  select new.room_id, r.version, 'wallet.updated', 'room:' || new.room_id::text,
         jsonb_build_object('user', new.details->>'user')
  from public.rooms r where r.id = new.room_id;
  return new;
end $$;

revoke all on function private.bau_coin_adjustment_notice() from public, anon, authenticated;

create trigger bau_coin_adjustment_notice
after insert on public.audit_logs
for each row when (new.action = 'bau.adjust')
execute function private.bau_coin_adjustment_notice();
