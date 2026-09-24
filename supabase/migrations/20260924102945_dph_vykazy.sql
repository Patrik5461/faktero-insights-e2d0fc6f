-- Podklady pre priznanie k DPH, kontrolný výkaz a súhrnný výkaz.
--
-- Doklady doteraz niesli len sumy. Na výkazy to nestačí: kontrolný výkaz
-- rozlišuje, či daň platí dodávateľ alebo príjemca, súhrnný výkaz chce vedieť,
-- či išlo o tovar, službu alebo trojstranný obchod, a opravná faktúra musí
-- niesť číslo pôvodnej. Tieto tri údaje z dokladu dopočítať nejde.

-- Vystavená faktúra: čo bolo dodané do EÚ — kvôli kódu plnenia v súhrnnom výkaze.
alter table public.invoices
  add column if not exists eu_plnenie text;
alter table public.invoices drop constraint if exists invoices_eu_plnenie_chk;
alter table public.invoices add constraint invoices_eu_plnenie_chk
  check (eu_plnenie is null or eu_plnenie in ('tovar', 'sluzba', 'trojstranny'));

-- Prijatá faktúra: v akom režime sa daň uplatňuje.
--   tuzemsko      – bežná faktúra od slovenského platiteľa (KV B.2)
--   samozdanenie  – daň platí príjemca podľa § 69 (KV B.1, priznanie r09/r10)
--   nadobudnutie  – tovar z iného členského štátu (priznanie r05–r08, KV B.1)
--   dovoz         – daň zaplatená colnému orgánu (priznanie r22/r23)
--   bez_dane      – oslobodené alebo od neplatiteľa; do výkazov nevstupuje
alter table public.purchase_invoices
  add column if not exists dph_rezim text,
  add column if not exists delivery_date date,
  add column if not exists odpocet boolean not null default true,
  -- Opravná faktúra (dobropis) musí do C.2 niesť číslo pôvodnej faktúry.
  add column if not exists opravuje_cislo text;
alter table public.purchase_invoices drop constraint if exists purchase_invoices_dph_rezim_chk;
alter table public.purchase_invoices add constraint purchase_invoices_dph_rezim_chk
  check (dph_rezim is null or dph_rezim in ('tuzemsko', 'samozdanenie', 'nadobudnutie', 'dovoz', 'bez_dane'));

-- Doklad (bloček) — či sa z neho uplatňuje odpočet dane (KV B.3).
alter table public.expense_documents
  add column if not exists odpocet boolean not null default true;

-- Zostavený výkaz. Drží sa, lebo čísla sa po podaní nesmú meniť so zmenou
-- dokladov — a lebo účtovník do návrhu dopĺňa riadky, ktoré z dokladov
-- nevyplývajú (dovoz, odpočet pri registrácii, nadmerný odpočet z minula).
create table if not exists public.vat_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  druh text not null check (druh in ('priznanie', 'kv', 'sv')),
  -- Riadny, opravný alebo dodatočný.
  typ text not null default 'R' check (typ in ('R', 'O', 'D')),
  rok integer not null,
  mesiac integer check (mesiac between 1 and 12),
  stvrtrok integer check (stvrtrok between 1 and 4),
  data jsonb not null default '{}'::jsonb,
  podane_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Buď mesiac, alebo štvrťrok — nikdy oboje ani nič.
  constraint vat_reports_obdobie_chk check ((mesiac is null) <> (stvrtrok is null))
);

create index if not exists vat_reports_firma_obdobie
  on public.vat_reports (company_id, druh, rok, mesiac, stvrtrok);

alter table public.vat_reports enable row level security;

revoke all on public.vat_reports from public;
revoke all on public.vat_reports from anon;
grant select, insert, update, delete on public.vat_reports to authenticated;
grant all on public.vat_reports to service_role;

drop policy if exists "clenovia firmy citaju" on public.vat_reports;
create policy "clenovia firmy citaju" on public.vat_reports for select to authenticated
  using (public.is_company_member(company_id, auth.uid()));
drop policy if exists "clenovia firmy zapisuju" on public.vat_reports;
create policy "clenovia firmy zapisuju" on public.vat_reports for insert to authenticated
  with check (public.is_company_writer(company_id, auth.uid()));
drop policy if exists "clenovia firmy upravuju" on public.vat_reports;
create policy "clenovia firmy upravuju" on public.vat_reports for update to authenticated
  using (public.is_company_writer(company_id, auth.uid()))
  with check (public.is_company_writer(company_id, auth.uid()));
drop policy if exists "clenovia firmy mazu" on public.vat_reports;
create policy "clenovia firmy mazu" on public.vat_reports for delete to authenticated
  using (public.is_company_writer(company_id, auth.uid()));

-- Dvojfaktor podľa pravidla pre každú novú tabuľku.
drop policy if exists "mfa ak je zapnute" on public.vat_reports;
create policy "mfa ak je zapnute" on public.vat_reports as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- Vlastný prístup: výkazy patria do oblasti účtovníctva.
select public.vlastny_pristup_politiky_na('vat_reports', 'company_id', 'uctovnictvo');
