-- Splátkový kalendár do Pohody: vlastná predkontácia a členenie DPH pre
-- istinu, úrok, poistenie a poplatky (financovanie-pohoda.ts, kodyPolozky).
-- Tvar: {"istina": {"predkontacia": "1Li", "clenenie": "PN"}, "urok": {...}, ...}
alter table public.financing_contracts
  add column if not exists pohoda_rozuctovanie jsonb not null default '{}'::jsonb;

alter table public.financing_contracts
  drop constraint if exists financing_contracts_rozuctovanie_objekt;
alter table public.financing_contracts
  add constraint financing_contracts_rozuctovanie_objekt check (jsonb_typeof(pohoda_rozuctovanie) = 'object');

comment on column public.financing_contracts.pohoda_rozuctovanie is
  'Kódy Pohody po zložkách splátky (istina, urok, poistenie, poplatky): predkontacia, clenenie.';
