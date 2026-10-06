-- Číselník: okrem predkontácií a členení aj strediská, činnosti a číselné rady Pohody.
alter table public.predkontacie drop constraint if exists predkontacie_druh_check;
alter table public.predkontacie add constraint predkontacie_druh_check
  check (druh in ('predkontacia', 'clenenie_dph', 'stredisko', 'cinnost', 'ciselny_rad'));

-- Na dokladoch: stredisko, činnosť, číselný rad Pohody, interná poznámka, odkaz na sken.
alter table public.expense_documents
  add column if not exists job_id uuid references public.jobs(id) on delete set null,
  add column if not exists stredisko text,
  add column if not exists cinnost text,
  add column if not exists pohoda_rad text,
  add column if not exists int_poznamka text,
  add column if not exists pdf_token text;
alter table public.purchase_invoices
  add column if not exists stredisko text,
  add column if not exists cinnost text,
  add column if not exists pohoda_rad text,
  add column if not exists int_poznamka text,
  add column if not exists pdf_token text;
alter table public.invoices
  add column if not exists stredisko text,
  add column if not exists cinnost text,
  add column if not exists int_poznamka text;
create unique index if not exists expense_documents_pdf_token on public.expense_documents (pdf_token) where pdf_token is not null;
create unique index if not exists purchase_invoices_pdf_token on public.purchase_invoices (pdf_token) where pdf_token is not null;
create index if not exists expense_documents_job_idx on public.expense_documents (job_id) where job_id is not null;

-- Predvolené číselné rady a stredisko pre doklady.
alter table public.companies
  add column if not exists pohoda_rad_prijate text,
  add column if not exists pohoda_rad_doklady text,
  add column if not exists pohoda_rad_pokladna text,
  add column if not exists pohoda_rad_interne text,
  add column if not exists pohoda_stredisko text,
  add column if not exists pohoda_odkaz_na_doklady boolean not null default true;

-- Kôš: zmazaný doklad sa odloží celý (aj s väzbou na pohyb v banke), aby sa
-- dal obnoviť. Pôvodná tabuľka ostáva bez neho — žiadny výkaz ani export ho nevidí.
create table if not exists public.kos_dokladov (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  druh text not null check (druh in ('doklad')),
  zaznam_id uuid not null,
  zaznam jsonb not null,
  vazby jsonb,
  popis text,
  zmazal uuid references auth.users(id) on delete set null,
  zmazane_at timestamptz not null default now()
);
create index if not exists kos_dokladov_firma on public.kos_dokladov (company_id, zmazane_at desc);
create index if not exists kos_dokladov_zmazal on public.kos_dokladov (zmazal) where zmazal is not null;

alter table public.kos_dokladov enable row level security;
create policy "clenovia citaju kos" on public.kos_dokladov
  for select to authenticated using (public.is_company_member(company_id, (select auth.uid())));
create policy "clenovia zakladaju kos" on public.kos_dokladov
  for insert to authenticated with check (public.is_company_member(company_id, (select auth.uid())));
create policy "clenovia mazu kos" on public.kos_dokladov
  for delete to authenticated using (public.is_company_member(company_id, (select auth.uid())));
create policy "mfa ak je zapnute" on public.kos_dokladov
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
select public.vlastny_pristup_politiky_na('kos_dokladov', 'company_id', 'doklady');
revoke all on public.kos_dokladov from public, anon;
grant select, insert, delete on public.kos_dokladov to authenticated;
grant all on public.kos_dokladov to service_role;
