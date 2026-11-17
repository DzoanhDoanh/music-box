-- Opt-in movement revision. No stored state, position, receipt or active rule is rewritten.
-- Keep the CHECK function identity so existing constraints use this validator as well.
create or replace function private.valid_game_state(s jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare normalized jsonb := s;
begin
 if s->'rules' ? 'movement' then
   if s->'schema' is distinct from '2'::jsonb
     or s#>'{rules,movement}' is distinct from '"SKIP_STARTS_AUTO_JUMP"'::jsonb
   then return false; end if;
   normalized := s #- '{rules,movement}';
 end if;
 if not private.valid_game_state_v2_unprotected(
   case when normalized->'schema'='2'::jsonb and normalized#>>'{rules,safe}'='STARTS'
     then jsonb_set(normalized,'{rules,safe}',to_jsonb('NONE'::text))
     else normalized end
 ) then return false; end if;
 if s->'schema'='2'::jsonb and s#>>'{rules,safe}'='STARTS' and exists (
   select 1 from jsonb_array_elements(s->'players') p,
     lateral jsonb_array_elements(p->'pieces') n
   where p->>'status'<>'FORFEITED' and n::text::int in (14,28,42)
 ) then return false; end if;
 return true;
exception when others then return false;
end
$$;
