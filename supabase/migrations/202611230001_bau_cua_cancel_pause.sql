-- A pending "pause after this round" must take effect when the round is cancelled.
-- Before this, the flag survived the cancel, the next round started anyway and the
-- table paused one round late while the manager's button stayed locked.
create or replace function private.bau_cancel(t uuid, reason text) returns void language plpgsql set search_path='' as $$
declare r public.bau_cua_rounds; b record; seed text;
begin
 select * into r from public.bau_cua_rounds where table_id=t order by number desc limit 1 for update;
 if not found or r.status in ('RESULT','CANCELLED') then return; end if;
 if r.status in ('REVEALING','SETTLING') then raise exception 'BAU_PHASE'; end if;
 for b in select user_id,sum(amount)::bigint amount from public.bau_cua_bets where round_id=r.id group by user_id order by user_id loop
 perform private.bau_money(b.user_id,b.amount,-b.amount,'BET_REFUND','refund:'||r.id::text);
 end loop;
 perform private.bau_money(r.dealer_id,r.collateral,-r.collateral,'BET_REFUND','refund-dealer:'||r.id::text);
 select s.seed into seed from private.bau_seeds s where round_id=r.id;
 update public.bau_cua_rounds set status='CANCELLED',deadline=null,action_at=null,revealed_seed=seed,dice=private.bau_dice(r.id,seed) where id=r.id;
 update public.bau_cua_tables
    set status=case when pause_after_round then 'PAUSED' else 'CANCELLED' end,
        pause_after_round=false
  where id=t;
 perform private.bau_emit(t,'round.cancelled',null,jsonb_build_object('reason',reason));
end $$;
