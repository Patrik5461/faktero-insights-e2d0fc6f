-- Rozúčtovanie zložiek (istina, úrok, poistenie, poplatky) aj na jednotlivej
-- splátke — prebíja kalendár (financovanie-pohoda.ts, kodyPolozky).
alter table public.financing_installments
  add column if not exists pohoda_rozuctovanie jsonb not null default '{}'::jsonb;

alter table public.financing_installments
  drop constraint if exists financing_installments_rozuctovanie_objekt;
alter table public.financing_installments
  add constraint financing_installments_rozuctovanie_objekt check (jsonb_typeof(pohoda_rozuctovanie) = 'object');

comment on column public.financing_installments.pohoda_rozuctovanie is
  'Kódy Pohody po zložkách len pre túto splátku (istina, urok, poistenie, poplatky): predkontacia, clenenie, kv.';
