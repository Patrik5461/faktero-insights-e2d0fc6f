-- Oprava 20261031065257: úprava len položiek (hlavička bez zmeny, len pdf_url → null)
-- prestala posúvať updated_at a kontrola súbehu v uloz_upravu_faktury ju nezachytila —
-- druhá karta potichu prepísala položky prvej (E2E okraje-subeh, 31. 10. 07:00).
-- Čas sa teraz nechá len pri zápise, ktorý mení výhradne technické stĺpce a PDF
-- neruší: uloženie PDF (pdf_url nastavené) a návrh autopilota. Prázdny update,
-- zrušenie PDF (pdf_url → null, robí to každé uloženie úpravy) aj výslovne
-- zadaný updated_at čas posunú ako predtým.
create or replace function public.set_updated_at_faktury()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.updated_at is distinct from old.updated_at
     or (old.pdf_url is not null and new.pdf_url is null)
     or to_jsonb(new) - 'updated_at' is not distinct from to_jsonb(old) - 'updated_at'
     or (to_jsonb(new) - 'updated_at' - 'pdf_url' - 'pdf_source_hash' - 'auto_uctovanie_navrh' - 'auto_uctovanie_at')
        is distinct from
        (to_jsonb(old) - 'updated_at' - 'pdf_url' - 'pdf_source_hash' - 'auto_uctovanie_navrh' - 'auto_uctovanie_at')
  then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$function$;
