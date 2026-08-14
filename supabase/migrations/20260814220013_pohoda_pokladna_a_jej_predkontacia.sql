-- Pokladničný doklad musí vedieť, do ktorej pokladne v Pohode patrí; firma ich
-- môže mať viac a bez skratky by ich Pohoda hádzala do prvej.
alter table public.companies
  add column if not exists pohoda_pokladna text,
  add column if not exists pohoda_predkontacia_pokladna text;

comment on column public.companies.pohoda_pokladna is 'Skratka pokladne v Pohode, napr. HOT';
comment on column public.companies.pohoda_predkontacia_pokladna is 'Predkontácia v Pohode pre pokladničný doklad';
