-- Rozúčtovanie dokladu na viac riadkov (predkontácia, členenie DPH, sadzba, základ, DPH).
alter table public.purchase_invoices add column if not exists rozuctovanie jsonb;
alter table public.expense_documents add column if not exists rozuctovanie jsonb;

-- Číselník: pri ktorých druhoch dokladov sa kód ponúka a pre ktorú kategóriu nákladu sa použije sám.
alter table public.predkontacie
  add column if not exists druhy_dokladov text[] not null default '{}',
  add column if not exists kategoria text;

comment on column public.purchase_invoices.rozuctovanie is 'Rozúčtovanie na riadky [{predkontacia, clenenie, sadzba, zaklad, dph, text}] — súčty po sadzbách sedia s dokladom.';
comment on column public.expense_documents.rozuctovanie is 'Rozúčtovanie na riadky [{predkontacia, clenenie, sadzba, zaklad, dph, text}] — súčty po sadzbách sedia s dokladom.';
comment on column public.predkontacie.druhy_dokladov is 'Kľúče z PREDVOLENE (faktura, prijata, doklady…); prázdne = ponúka sa všade.';
comment on column public.predkontacie.kategoria is 'Kategória nákladu, pre ktorú sa kód použije, keď doklad nemá vlastný.';
