-- Poistka: firma, ktorá nie je platiteľ DPH (companies.vat_payer = false),
-- nesmie na faktúre ani na položke vyčísliť DPH. Len nové zápisy – staré
-- doklady (august 2026) sa pri zápise bez zmeny DPH nekontrolujú.
-- K tomu: odpočítaná záloha musí byť v mene faktúry.

create or replace function public.invoices_dph_neplatitela()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if coalesce(new.vat_total, 0) <> 0
     and (tg_op = 'INSERT' or new.vat_total is distinct from old.vat_total or new.company_id is distinct from old.company_id)
     and exists (select 1 from public.companies c where c.id = new.company_id and c.vat_payer = false) then
    raise exception 'Firma nie je platiteľ DPH — faktúra nesmie mať DPH. Nastavte sadzbu 0 %%.' using errcode = 'P0001';
  end if;
  return new;
end $function$;

drop trigger if exists invoices_dph_neplatitela on public.invoices;
create trigger invoices_dph_neplatitela
  before insert or update of vat_total, company_id on public.invoices
  for each row execute function public.invoices_dph_neplatitela();

create or replace function public.invoice_items_dph_neplatitela()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (coalesce(new.vat_amount, 0) <> 0 or coalesce(new.vat_rate, 0) <> 0)
     and (tg_op = 'INSERT'
          or new.vat_amount is distinct from old.vat_amount
          or new.vat_rate is distinct from old.vat_rate
          or new.invoice_id is distinct from old.invoice_id)
     and exists (
       select 1 from public.invoices i join public.companies c on c.id = i.company_id
       where i.id = new.invoice_id and c.vat_payer = false
     ) then
    raise exception 'Firma nie je platiteľ DPH — položka „%“ nesmie mať DPH. Nastavte sadzbu 0 %%.', new.name using errcode = 'P0001';
  end if;
  return new;
end $function$;

drop trigger if exists invoice_items_dph_neplatitela on public.invoice_items;
create trigger invoice_items_dph_neplatitela
  before insert or update of vat_amount, vat_rate, invoice_id on public.invoice_items
  for each row execute function public.invoice_items_dph_neplatitela();

create or replace function public.invoice_advances_mena()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  mena_faktury text;
  mena_zalohy text;
begin
  select currency into mena_faktury from public.invoices where id = new.invoice_id;
  select currency into mena_zalohy from public.invoices where id = new.advance_invoice_id;
  if mena_faktury is not null and mena_zalohy is not null
     and upper(mena_faktury) <> upper(mena_zalohy) then
    raise exception 'Záloha je v inej mene (%) než faktúra (%). Odpočítať sa dá len záloha v mene faktúry.', mena_zalohy, mena_faktury using errcode = 'P0001';
  end if;
  return new;
end $function$;

drop trigger if exists invoice_advances_mena on public.invoice_advances;
create trigger invoice_advances_mena
  before insert or update of invoice_id, advance_invoice_id on public.invoice_advances
  for each row execute function public.invoice_advances_mena();
