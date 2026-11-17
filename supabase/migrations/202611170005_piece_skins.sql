-- Optional cosmetic player field for both board versions. Existing states remain unchanged.
create or replace function private.valid_game_state(s jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare normalized jsonb := s; player_json jsonb; players jsonb := '[]'::jsonb;
begin
 if s->'rules' ? 'movement' then
   if s->'schema' is distinct from '2'::jsonb
     or s#>'{rules,movement}' is distinct from '"SKIP_STARTS_AUTO_JUMP"'::jsonb
   then return false; end if;
   normalized := normalized #- '{rules,movement}';
 end if;
 if jsonb_typeof(s->'players') = 'array' then
   for player_json in select value from jsonb_array_elements(s->'players') loop
     if player_json ? 'skin' then
       if jsonb_typeof(player_json->'skin') is distinct from 'string' or player_json->>'skin' not in
         ('HORSE','CAT','DOG','RABBIT','BIRD','FISH','TURTLE','ROCKET','CROWN','GEM','GHOST','STAR',
          'HERO','MASKED_HERO','ROBOT','NINJA')
       then return false; end if;
       player_json := player_json - 'skin';
     end if;
     players := players || jsonb_build_array(player_json);
   end loop;
   normalized := jsonb_set(normalized,'{players}',players);
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
