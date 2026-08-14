-- Náklady sa účtujú inam než výnosy, takže prijatý doklad potrebuje vlastnú
-- predkontáciu aj vlastné členenie DPH — inak by mal rovnaké ako vydaná faktúra.
alter table public.companies
  add column if not exists pohoda_predkontacia_prijata text,
  add column if not exists pohoda_clenenie_dph_prijata text;

comment on column public.companies.pohoda_predkontacia_prijata is 'Predkontácia v Pohode pre prijatý doklad, napr. 5Fp';
comment on column public.companies.pohoda_clenenie_dph_prijata is 'Členenie DPH v Pohode pre prijatý doklad';
