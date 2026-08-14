-- Kódy z Pohody účtovníka. Bez nich sa doklad naimportuje, ale účtovník mu
-- musí ručne priradiť predkontáciu aj členenie DPH — a to je väčšina práce,
-- ktorú mal export ušetriť. Kódy sú textové skratky z konkrétnej účtovnej
-- jednotky (napr. 3Fv, UD), preto sa nedajú uhádnuť a musí ich vyplniť užívateľ.
alter table public.companies
  add column if not exists pohoda_predkontacia text,
  add column if not exists pohoda_predkontacia_zaloha text,
  add column if not exists pohoda_predkontacia_dobropis text,
  add column if not exists pohoda_clenenie_dph text,
  add column if not exists pohoda_clenenie_dph_pdp text;

comment on column public.companies.pohoda_predkontacia is 'Predkontácia v Pohode pre vydanú faktúru, napr. 3Fv';
comment on column public.companies.pohoda_predkontacia_zaloha is 'Predkontácia v Pohode pre zálohovú faktúru';
comment on column public.companies.pohoda_predkontacia_dobropis is 'Predkontácia v Pohode pre dobropis';
comment on column public.companies.pohoda_clenenie_dph is 'Členenie DPH v Pohode, napr. UD';
comment on column public.companies.pohoda_clenenie_dph_pdp is 'Členenie DPH pri prenesení daňovej povinnosti';
