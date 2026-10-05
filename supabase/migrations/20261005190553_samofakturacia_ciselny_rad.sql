-- Samofaktúra si pamätá rad, z ktorého dostala číslo — rad s vystavenými
-- dokladmi sa potom nedá zmazať, len vypnúť (ako pri ostatných dokladoch).
alter table public.purchase_invoices
  add column if not exists number_series_id uuid references public.number_series(id) on delete set null;
create index if not exists purchase_invoices_number_series_id_idx
  on public.purchase_invoices (number_series_id)
  where number_series_id is not null;
