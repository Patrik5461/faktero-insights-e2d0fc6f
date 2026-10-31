-- Čas úpravy faktúry (updated_at) sa neposúva pri technických zápisoch na pozadí:
-- uložené PDF (pdf_url, pdf_source_hash) a návrh autopilota (auto_uctovanie_navrh,
-- auto_uctovanie_at). updated_at stráži súbeh v uloz_upravu_faktury — tieto zápisy
-- prídu do pol minúty po vystavení (PDF z detailu, autopilot každú minútu) a človek,
-- ktorý hneď otvoril úpravu, dostal „Faktúru medzitým zmenil niekto iný“ a o zmeny prišiel.
-- Zaúčtovanie autopilotom (zauctovane_at, predkontácia) čas posúva ďalej — to je skutočná zmena.
create or replace function public.set_updated_at_faktury()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (to_jsonb(new) - 'updated_at' - 'pdf_url' - 'pdf_source_hash' - 'auto_uctovanie_navrh' - 'auto_uctovanie_at')
     is not distinct from
     (to_jsonb(old) - 'updated_at' - 'pdf_url' - 'pdf_source_hash' - 'auto_uctovanie_navrh' - 'auto_uctovanie_at')
  then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_invoices_updated on public.invoices;
create trigger trg_invoices_updated before update on public.invoices
  for each row execute function public.set_updated_at_faktury();
