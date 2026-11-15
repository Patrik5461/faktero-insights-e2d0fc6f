-- Cenová skupina skladovej karty v Pohode (audit exportov 14. 11. 2026, V16).
-- stock.xsd: `stk:typePrice` — „Tento element je vyžadován při vytvoření
-- dokladu“. Bez nej Pohoda skladovú kartu nezaloží; Faktero preto karty ani
-- príjemky/výdajky bez nej neposiela.
alter table public.companies
  add column if not exists pohoda_cenova_skupina text;

comment on column public.companies.pohoda_cenova_skupina is
  'Skratka cenovej skupiny v Pohode pre nové skladové karty (stk:typePrice).';
