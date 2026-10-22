-- Nespracované doklady — drobnosti (stĺpec „Spracoval“).
--
-- Kto prijatú faktúru vytvoril z Nespracovaných dokladov a kedy. `created_by`
-- ostáva ten, kto doklad nahral (pri maile majiteľ adresy) — podľa neho
-- zaúčtujú pravidlá a učenie z opráv, preto sa nemení. Bločky to už majú
-- v `processed_by` / `processed_at`.
--
-- ON DELETE SET NULL: zrušenie účtu nesmie zablokovať odkaz na používateľa.

alter table public.purchase_invoices
  add column if not exists spracoval uuid references auth.users(id) on delete set null,
  add column if not exists spracovane_at timestamptz;

comment on column public.purchase_invoices.spracoval is
  'Kto faktúru vytvoril z Nespracovaných dokladov (klikol Vytvoriť).';
comment on column public.purchase_invoices.spracovane_at is
  'Kedy bola faktúra vytvorená z Nespracovaných dokladov.';
