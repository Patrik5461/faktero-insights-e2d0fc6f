-- Číselník predkontácií a členení DPH firmy (ako v Doklado).
-- Kódy pochádzajú z Pohody (import cez konektor alebo súbor) alebo sa zadajú
-- ručne. `agenda` je agenda Pohody (receivedInvoice, issuedInvoice,
-- cashPaid, …) — podľa nej sa ponúkajú pri danom druhu dokladu; prázdna =
-- pre všetky.
create table if not exists public.predkontacie (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  druh text not null default 'predkontacia' check (druh in ('predkontacia', 'clenenie_dph')),
  kod text not null check (btrim(kod) <> '' and length(kod) <= 30),
  popis text,
  agenda text,
  ucet_md text,
  ucet_d text,
  zdroj text not null default 'rucne' check (zdroj in ('rucne', 'pohoda', 'subor')),
  aktivne boolean not null default true,
  pohoda_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists predkontacie_kluc
  on public.predkontacie (company_id, druh, kod, coalesce(agenda, ''));
create index if not exists predkontacie_firma_idx on public.predkontacie (company_id, druh);

alter table public.predkontacie enable row level security;
create policy "clenovia citaju predkontacie" on public.predkontacie
  for select to authenticated using (public.is_company_member(company_id, (select auth.uid())));
create policy "clenovia zakladaju predkontacie" on public.predkontacie
  for insert to authenticated with check (public.is_company_member(company_id, (select auth.uid())));
create policy "clenovia upravuju predkontacie" on public.predkontacie
  for update to authenticated
  using (public.is_company_member(company_id, (select auth.uid())))
  with check (public.is_company_member(company_id, (select auth.uid())));
create policy "clenovia mazu predkontacie" on public.predkontacie
  for delete to authenticated using (public.is_company_member(company_id, (select auth.uid())));
create policy "mfa ak je zapnute" on public.predkontacie
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
select public.vlastny_pristup_politiky_na('predkontacie', 'company_id', 'doklady');
revoke all on public.predkontacie from public, anon;
grant select, insert, update, delete on public.predkontacie to authenticated;
grant all on public.predkontacie to service_role;

-- Bločky a doklady majú vlastné predvolené kódy (doteraz brali tie z prijatých
-- faktúr). Konektor si môže z Pohody vyžiadať číselníky.
alter table public.companies
  add column if not exists pohoda_predkontacia_doklady text,
  add column if not exists pohoda_clenenie_dph_doklady text,
  add column if not exists pohoda_nacitat_ciselniky boolean not null default false,
  add column if not exists pohoda_ciselniky_nacitane_at timestamptz;
