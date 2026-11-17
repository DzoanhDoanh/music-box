-- Add safe start rules without changing existing games or the CHECK function identity.
-- Reuse the previous validator for every field and single-occupancy check.
create function private.valid_game_state_v2_unprotected(s jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare p jsonb; n jsonb; r jsonb; l jsonb; k text; cells text[] := '{}'; cell text; begin
 if s->'schema' = '1'::jsonb then return private.valid_game_state_v1(s); end if;
 if jsonb_typeof(s) is distinct from 'object' or s-array['schema','id','room','host','name','version','round','status','rules','players','turn','phase','dice','sixes','deadline','remaining','last']<>'{}'::jsonb then return false; end if;
 foreach k in array array['id','room','host','name','status','phase'] loop
   if jsonb_typeof(s->k) is distinct from 'string' then return false; end if;
 end loop;
 if s->'schema' is distinct from '2'::jsonb or not private.game_integer(s->'version',0,9007199254740991)
 or not private.game_integer(s->'round',1,9007199254740991) or not private.game_integer(s->'sixes',0,3)
 or not private.game_integer(s->'dice',1,6,true) or not private.game_integer(s->'deadline',0,9007199254740991,true)
 or not private.game_integer(s->'remaining',0,90000,true) then return false; end if;
 if s->'turn'<>'null'::jsonb then
   if jsonb_typeof(s->'turn') is distinct from 'string' then return false; end if;
   perform (s->>'turn')::uuid;
 end if;
 if not (s ?& array['schema','id','room','host','name','version','round','status','rules','players','turn','phase','dice','sixes','deadline','remaining','last'])
 or jsonb_typeof(s->'rules') is distinct from 'object' or jsonb_typeof(s->'players') is distinct from 'array' then return false; end if;
 if jsonb_typeof(s)<>'object' or s->>'schema'<>'2' or (s->>'version')::bigint<0 or (s->>'round')::int<1
 or s->>'status' not in ('WAITING','READY','PLAYING','PAUSED','FINISHED','CANCELLED')
 or s->>'phase' not in ('ROLL','MOVE','DONE') or jsonb_typeof(s->'players')<>'array'
 or jsonb_array_length(s->'players')>4 or char_length(s->>'name') not between 1 and 60 then return false; end if;
 perform (s->>'id')::uuid, (s->>'room')::uuid, (s->>'host')::uuid;
 if s->>'id' is null or s->>'room' is null or s->>'host' is null or s->>'version' is null or s->>'round' is null or s->>'status' is null or s->>'phase' is null then return false; end if;
 if s->>'dice' is not null and (s->>'dice')::int not between 1 and 6 then return false; end if;
 if (s->>'sixes')::int not between 0 and 3 or (s->>'deadline')::numeric<0 then return false; end if;
 if s->>'phase'='MOVE' and s->>'dice' is null then return false; end if;
 r:=s->'rules';
 if r->'variant' is distinct from '"CANGUA_V2"'::jsonb
 or jsonb_typeof(r->'jumpOnOne') is distinct from 'boolean'
 or r->'safe' is distinct from '"NONE"'::jsonb
 or r->'threeSixes' is distinct from 'false'::jsonb
 or r->'captureBonus' is distinct from 'false'::jsonb
 or r->'finishBonus' is distinct from 'false'::jsonb then return false; end if;
 if r-array['entry','safe','captureBonus','finishBonus','threeSixes','turnSeconds','maxMisses','variant','jumpOnOne']<>'{}'::jsonb
 or jsonb_typeof(r->'entry') is distinct from 'string' or jsonb_typeof(r->'safe') is distinct from 'string'
 or not private.game_integer(r->'turnSeconds',30,90) or not private.game_integer(r->'maxMisses',2,5) then return false; end if;
 if not (r ?& array['entry','safe','captureBonus','finishBonus','threeSixes','turnSeconds','maxMisses','variant','jumpOnOne']) then return false; end if;
 if r->>'entry' not in ('SIX','ONE_OR_SIX') or r->>'safe' not in ('STARS','STARTS','NONE')
 or (r->>'turnSeconds')::int not in (30,45,60,90) or (r->>'maxMisses')::int not between 2 and 5
 or jsonb_typeof(r->'captureBonus') is distinct from 'boolean' or jsonb_typeof(r->'finishBonus') is distinct from 'boolean'
 or jsonb_typeof(r->'threeSixes') is distinct from 'boolean' then return false; end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(s->'players') x) <> jsonb_array_length(s->'players')
 or (select count(distinct x->>'color') from jsonb_array_elements(s->'players') x) <> jsonb_array_length(s->'players') then return false; end if;
 for p in select * from jsonb_array_elements(s->'players') loop
   if jsonb_typeof(p) is distinct from 'object' or p-array['id','name','color','ready','pieces','status','rank','misses']<>'{}'::jsonb
   or not private.game_integer(p->'color',0,3) or not private.game_integer(p->'misses',0,5)
   or not private.game_integer(p->'rank',1,4,true) then return false; end if;
   foreach k in array array['id','name','status'] loop
     if jsonb_typeof(p->k) is distinct from 'string' then return false; end if;
   end loop;
   if (p->>'status'='ACTIVE') is distinct from (p->>'rank' is null) then return false; end if;
   if not(p ?& array['id','name','color','ready','pieces','status','rank','misses']) or jsonb_typeof(p->'pieces') is distinct from 'array' then return false; end if;
   perform (p->>'id')::uuid;
   if p->>'id' is null or (p->>'color')::int not between 0 and 3 or char_length(p->>'name') not between 1 and 40
   or jsonb_typeof(p->'ready') is distinct from 'boolean' or p->>'status' not in ('ACTIVE','FINISHED','FORFEITED')
   or jsonb_array_length(p->'pieces')<>4 or (p->>'misses')::int not between 0 and 5
   or (p->>'rank')::int not between 1 and 4 then return false; end if;
   for n in select * from jsonb_array_elements(p->'pieces') loop
     if jsonb_typeof(n)<>'number' or n::text !~ '^-?[0-9]+$' or n::text::int not between -1 and 61 then return false; end if;
     if n::text::int >= 0 and p->>'status' <> 'FORFEITED' then
       cell := case when n::text::int < 56 then 'track:' || (((p->>'color')::int * 14 + n::text::int) % 56)::text
         else (p->>'id') || ':' || n::text end;
       if cell = any(cells) then return false; end if;
       cells := array_append(cells, cell);
     end if;
   end loop;
 end loop;
 if s->>'status' in ('PLAYING','PAUSED') and not exists(select 1 from jsonb_array_elements(s->'players') x where x->>'id'=s->>'turn' and x->>'status'='ACTIVE') then return false; end if;
 if (s->>'phase'='MOVE') is distinct from (s->>'dice' is not null) then return false; end if;
 if s->>'status'='PLAYING' and (s->>'deadline' is null or s->>'remaining' is not null) then return false; end if;
 if s->>'status'<>'PLAYING' and s->>'deadline' is not null then return false; end if;
 if s->>'status'='PAUSED' and s->>'remaining' is null then return false; end if;
 if s->>'status' not in ('PLAYING','PAUSED') and s->>'turn' is not null then return false; end if;
 if s->>'status' in ('PLAYING','PAUSED') and (s->>'phase'='DONE' or
 (select count(*) from jsonb_array_elements(s->'players') x where x->>'status'='ACTIVE')<2) then return false; end if;
 if (select count(distinct x->>'rank') from jsonb_array_elements(s->'players') x) <> (select count(*) from jsonb_array_elements(s->'players') x where x->>'rank' is not null) then return false; end if;
 if s->>'status'='FINISHED' and (s->>'phase'<>'DONE' or exists(select 1 from jsonb_array_elements(s->'players') x where x->>'rank' is null)) then return false; end if;
 l:=s->'last';
 if l ? 'moveKind' and (jsonb_typeof(l->'moveKind') is distinct from 'string' or l->>'moveKind' not in ('STEP','JUMP')) then return false; end if;
 if jsonb_typeof(l) is distinct from 'object' or not(l ?& array['type','actor'])
 or l-array['type','actor','piece','from','to','dice','captures','moveKind']<>'{}'::jsonb
 or jsonb_typeof(l->'type') is distinct from 'string' or char_length(l->>'type')>40
 or jsonb_typeof(l->'actor') is distinct from 'string' or char_length(l->>'actor')>40 then return false; end if;
 if l ? 'piece' and not private.game_integer(l->'piece',0,3) then return false; end if;
 if l ? 'dice' and not private.game_integer(l->'dice',1,6) then return false; end if;
 foreach k in array array['from','to'] loop
   if l ? k and not private.game_integer(l->k,-1,61) then return false; end if;
 end loop;
 if l ? 'captures' then
   if jsonb_typeof(l->'captures') is distinct from 'array' or jsonb_array_length(l->'captures')>12 then return false; end if;
   for n in select * from jsonb_array_elements(l->'captures') loop
     if jsonb_typeof(n) is distinct from 'string' or char_length(n#>>'{}')>40 then return false; end if;
   end loop;
 end if;
 return true;
exception when others then return false;
end $$;

revoke all on function private.valid_game_state_v2_unprotected(jsonb) from public,anon,authenticated;

create or replace function private.valid_game_state(s jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 if not private.valid_game_state_v2_unprotected(
   case when s->'schema'='2'::jsonb and s#>>'{rules,safe}'='STARTS'
     then jsonb_set(s,'{rules,safe}',to_jsonb('NONE'::text))
     else s end
 ) then return false; end if;
 -- Only the matching color may occupy a safe start (relative progress zero).
 if s->'schema'='2'::jsonb and s#>>'{rules,safe}'='STARTS' and exists (
   select 1 from jsonb_array_elements(s->'players') p,
     lateral jsonb_array_elements(p->'pieces') n
   where p->>'status'<>'FORFEITED' and n::text::int in (14,28,42)
 ) then return false; end if;
 return true;
exception when others then return false;
end
$$;
