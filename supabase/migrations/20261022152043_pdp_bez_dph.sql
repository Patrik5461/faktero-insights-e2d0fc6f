-- Poistka: faktúra s prenesením daňovej povinnosti nesmie niesť DPH.
-- 22. 10. 2026 úprava faktúry prepočítala 23 % na faktúre s PDP (BÝVAJLEPŠIE 20260010).
-- Aplikované po častiach: 20261022152043_pdp_bez_dph_obmedzenia … 20261022153716_pdp_bez_dph_spustac_polozky
-- (obmedzenia CHECK nahradili spúšťače so slovenskou hláškou).

create or replace function public.invoices_pdp_kontrola()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(new.reverse_charge, false) and coalesce(new.vat_total, 0) <> 0 then
    raise exception 'Faktúra má prenesenie daňovej povinnosti — DPH musí byť 0.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function public.invoice_items_pdp_kontrola()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(new.vat_amount, 0) <> 0 and (coalesce(new.prenesenie, false) or exists (
    select 1 from public.invoices i where i.id = new.invoice_id and coalesce(i.reverse_charge, false)
  )) then
    raise exception 'Položka s prenesením daňovej povinnosti nesmie mať DPH.' using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke all on function public.invoices_pdp_kontrola() from public, anon;
revoke all on function public.invoice_items_pdp_kontrola() from public, anon;

drop trigger if exists invoices_pdp_kontrola on public.invoices;
create trigger invoices_pdp_kontrola before insert or update of reverse_charge, vat_total on public.invoices
  for each row execute function public.invoices_pdp_kontrola();

drop trigger if exists invoice_items_pdp_kontrola on public.invoice_items;
create trigger invoice_items_pdp_kontrola before insert or update of vat_amount, invoice_id, prenesenie on public.invoice_items
  for each row execute function public.invoice_items_pdp_kontrola();
