-- Členenie kontrolného výkazu DPH na doklade (A1…D2); prázdne = automaticky.
alter table public.purchase_invoices add column if not exists kv_clenenie text;
alter table public.expense_documents add column if not exists kv_clenenie text;

-- Ako idú bločky do Pohody: 'faktura' = prijatá faktúra (doteraz),
-- 'podla_platby' = hotovosť ako pokladničný doklad, karta ako interný doklad (ako Doklado).
alter table public.companies
  add column if not exists pohoda_blocky_agenda text not null default 'faktura';
alter table public.companies drop constraint if exists companies_pohoda_blocky_agenda_check;
alter table public.companies add constraint companies_pohoda_blocky_agenda_check
  check (pohoda_blocky_agenda in ('faktura', 'podla_platby'));
