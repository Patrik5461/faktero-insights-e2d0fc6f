-- Konektor do Pohody: Pohoda po importe vráti `responsePack`, v ktorom je pri
-- každom doklade jeho stav a číslo, ktoré mu pridelila. Bez týchto stĺpcov by
-- sme mali len „odoslané" a nevedeli by sme, či sa doklad naozaj založil.

alter table public.export_logs
  add column if not exists pohoda_cislo text,
  add column if not exists pohoda_stav text,
  add column if not exists potvrdene_at timestamptz;

comment on column public.export_logs.pohoda_cislo is 'Číslo, ktoré dokladu pridelila Pohoda pri importe.';
comment on column public.export_logs.pohoda_stav is 'Stav z responsePack: ok, warning alebo error.';

alter table public.expense_documents
  add column if not exists pohoda_cislo text;

-- Pokladňa doteraz nemala pamäť na odovzdanie — mesačný balík ju posielal celú
-- za mesiac. Konektor beží denne, takže bez tohto by pohyby chodili opakovane.
alter table public.cash_entries
  add column if not exists exported_at timestamptz,
  add column if not exists export_job_id uuid references public.export_jobs(id) on delete set null,
  add column if not exists pohoda_cislo text;

create index if not exists cash_entries_exported_at_idx
  on public.cash_entries (company_id, exported_at);
