-- Strážca cudzej prijatej faktúry: stav „booked“ bez zaúčtovania (napr. po zrušení
-- párovania s bankou) neblokovať — rozhoduje zápis zaúčtovania a odovzdania.
create or replace function public.faktero_strazca_cudzej_prijatej()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.odberatel_nesedi is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Vzniká s príznakom: zaúčtovanie z vytvorenia (pravidlo, predvolené kódy) sa nezapíše.
    new.zauctovane_at := null;
    new.zauctoval := null;
    new.zauctovanie_zdroj := null;
    new.zauctovanie_istota := null;
    if new.status = 'booked' then
      new.status := 'received';
    end if;
    return new;
  end if;
  if old.zauctovane_at is null and new.zauctovane_at is not null then
    raise exception 'Faktúra nepatrí tejto firme (odberateľ na doklade je iná firma) — kým nepotvrdíte, že patrí tejto firme, nedá sa zaúčtovať.'
      using errcode = 'P0001';
  end if;
  if old.exported_at is null and new.exported_at is not null then
    raise exception 'Faktúra nepatrí tejto firme (odberateľ na doklade je iná firma) — kým nepotvrdíte, že patrí tejto firme, nedá sa odovzdať.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;
