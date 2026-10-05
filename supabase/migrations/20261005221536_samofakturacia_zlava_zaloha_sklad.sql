-- Samofaktúra: zľava na celý doklad, odpočet zaplatenej zálohy a príznak,
-- že jej tovar už bol prijatý na sklad (aby sa nenaskladnil dvakrát).
alter table public.purchase_invoices
  add column if not exists discount_type text,
  add column if not exists discount_value numeric,
  add column if not exists discount_total numeric,
  add column if not exists advance_amount numeric,
  add column if not exists naskladnene_at timestamptz;

alter table public.purchase_invoices drop constraint if exists purchase_invoices_discount_type_chk;
alter table public.purchase_invoices add constraint purchase_invoices_discount_type_chk
  check (discount_type is null or discount_type in ('percent', 'amount'));
