-- Nemecké firmy: mesačné kurzy BMF (§ 16 Abs. 6 UStG) a zdroj kurzu na dokladoch.
-- (Zusammenfassende Meldung — § 18a UStG — novú štruktúru nepotrebuje, počíta
-- sa z rovnakého načítania dokladov ako UStVA.)
--
-- Aplikované v dvoch častiach: 20261017190653_de_zm (tabuľka kurzy_bmf) a
-- 20261017190702_de_kurz_zdroj (stĺpce kurz_de_zdroj a exchange_rate_source).

-- 1) Kurzy BMF „Umsatzsteuer-Umrechnungskurse“ — mesačný priemer, „X za 1 EUR“.
--    `mesiac` = prvý deň mesiaca, za ktorý kurz platí.
create table if not exists public.kurzy_bmf (
  mesiac date not null check (extract(day from mesiac) = 1),
  mena text not null check (mena ~ '^[A-Z]{3}$'),
  kurz numeric not null check (kurz > 0),
  primary key (mesiac, mena)
);

comment on table public.kurzy_bmf is
  'Mesačné kurzy BMF na prepočet DPH nemeckých firiem (§ 16 Abs. 6 UStG), X meny za 1 EUR. Plní ich hook kurzy-ecb z dátového portálu BMF.';

alter table public.kurzy_bmf enable row level security;

drop policy if exists "kurzy bmf citaju prihlaseni" on public.kurzy_bmf;
create policy "kurzy bmf citaju prihlaseni" on public.kurzy_bmf
  for select to authenticated using (true);

-- Dvojfaktor podľa pravidla pre každú novú tabuľku (ako exchange_rates).
drop policy if exists "mfa ak je zapnute" on public.kurzy_bmf;
create policy "mfa ak je zapnute" on public.kurzy_bmf as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

revoke all on public.kurzy_bmf from public, anon;
grant select on public.kurzy_bmf to authenticated;
grant all on public.kurzy_bmf to service_role;

-- 2) Voľba nemeckej firmy: BMF-Monatskurs (predvolené) alebo denný kurz ECB,
--    ktorý smie použiť len s povolením Finanzamtu (§ 16 Abs. 6 Satz 4 UStG).
alter table public.companies
  add column if not exists kurz_de_zdroj text not null default 'bmf';
alter table public.companies drop constraint if exists companies_kurz_de_zdroj_chk;
alter table public.companies add constraint companies_kurz_de_zdroj_chk
  check (kurz_de_zdroj in ('bmf', 'ecb_tageskurs'));
comment on column public.companies.kurz_de_zdroj is
  'Len DE firma: bmf = mesačný kurz BMF, ecb_tageskurs = denný kurz ECB s povolením Finanzamtu.';

-- 3) Odkiaľ je kurz na doklade. NULL = starší doklad (ECB/ČNB podľa krajiny).
--    ecb_predbezne = DE firma s BMF, ale kurz mesiaca ešte nebol zverejnený —
--    hook ho po zverejnení prepočíta na bmf.
alter table public.invoices
  add column if not exists exchange_rate_source text;
alter table public.invoices drop constraint if exists invoices_exchange_rate_source_chk;
alter table public.invoices add constraint invoices_exchange_rate_source_chk
  check (exchange_rate_source is null
    or exchange_rate_source in ('ecb', 'cnb', 'bmf', 'ecb_predbezne', 'ecb_tageskurs'));

alter table public.purchase_invoices
  add column if not exists exchange_rate_source text;
alter table public.purchase_invoices drop constraint if exists purchase_invoices_exchange_rate_source_chk;
alter table public.purchase_invoices add constraint purchase_invoices_exchange_rate_source_chk
  check (exchange_rate_source is null
    or exchange_rate_source in ('ecb', 'cnb', 'bmf', 'ecb_predbezne', 'ecb_tageskurs'));

-- Hook hľadá doklady čakajúce na kurz BMF.
create index if not exists invoices_kurz_predbezne_idx
  on public.invoices (exchange_rate_source) where exchange_rate_source = 'ecb_predbezne';
create index if not exists purchase_invoices_kurz_predbezne_idx
  on public.purchase_invoices (exchange_rate_source) where exchange_rate_source = 'ecb_predbezne';

-- ─── Načítanie kurzov ─────────────────────────────────────────────────────
-- Nový cron netreba: existujúci denný cron `faktero-kurzy-ecb` volá hook
-- /api/public/hooks/kurzy-ecb, ktorý po ECB a ČNB stiahne aj ročný CSV BMF
--   https://www.bundesfinanzministerium.de/Datenportal/Daten/offene-daten/steuern-zoelle/umsatzsteuer-umrechnungskurse/datensaetze/uu-kurse-<ROK>-csv.csv?__blob=publicationFile
-- (v januári aj predošlý rok), uloží ho do kurzy_bmf a prepočíta doklady
-- s exchange_rate_source = 'ecb_predbezne'. Cron beží 30 15 * * 1-5 a má
-- timeout_milliseconds = 120000 (overené 2026-10-17); BMF súbor má ~5 kB,
-- takže sa zmestí aj pod 30 s strop nginxu.
--
-- Prvé naplnenie bežného roka: jedno ručné zavolanie hooku. Staršie roky sa
-- dotiahnu samy, keď príde doklad z takého mesiaca. Ručne cez SQL (napr. keby portál BMF zmenil adresu):
--   insert into public.kurzy_bmf (mesiac, mena, kurz) values
--     ('2026-09-01', 'USD', 1.1513), ('2026-09-01', 'CZK', 24.296)
--   on conflict (mesiac, mena) do update set kurz = excluded.kurz;
