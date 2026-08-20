-- Nastavenie bankového výpisu do Pohody patrí firme, nie prehliadaču:
-- predkontácie si takto vyplní jeden človek a majú ich všetci.
alter table public.companies
  add column if not exists pohoda_banka text,
  add column if not exists pohoda_predkontacia_banka text,
  -- Kód označenia platby -> predkontácia v Pohode, napr. {"poplatok":"3Bv"}.
  -- Kľúče sú z `vypis-oznacenie.ts`; jsonb, aby pribúdanie označení
  -- neznamenalo zakaždým nový stĺpec.
  add column if not exists pohoda_predkontacie_oznaceni jsonb;

comment on column public.companies.pohoda_banka is
  'Skratka bankového účtu v Pohode pre prevodník bankových výpisov.';
comment on column public.companies.pohoda_predkontacia_banka is
  'Spoločná predkontácia bankového dokladu; použije sa tam, kde označenie platby vlastnú nemá.';
comment on column public.companies.pohoda_predkontacie_oznaceni is
  'Predkontácia podľa označenia platby: {"faktura":"2Bv","poplatok":"3Bv"}.';
