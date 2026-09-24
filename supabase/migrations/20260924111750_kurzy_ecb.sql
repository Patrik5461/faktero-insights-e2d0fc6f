-- Referenčné kurzy ECB a prepočet dane do eur.
--
-- Faktúra v cudzej mene musí podľa § 26 ods. 1 zákona o DPH niesť daň aj
-- v eurách, prepočítanú kurzom ECB zo dňa predchádzajúceho vzniku daňovej
-- povinnosti. Doteraz bola faktúra celá len v zvolenej mene a do výkazov sa
-- dostala v nej — teda nesprávne.
create table if not exists public.exchange_rates (
  den date not null,
  mena text not null,
  -- Koľko jednotiek meny je za jedno euro (tak ako ich zverejňuje ECB).
  kurz numeric(18, 6) not null check (kurz > 0),
  created_at timestamptz not null default now(),
  primary key (den, mena)
);

alter table public.exchange_rates enable row level security;

-- Kurzy sú verejný údaj a potrebuje ich každá firma; zapisuje ich len server.
revoke all on public.exchange_rates from public;
revoke all on public.exchange_rates from anon;
grant select on public.exchange_rates to authenticated;
grant all on public.exchange_rates to service_role;

drop policy if exists "kurzy vidia prihlaseni" on public.exchange_rates;
create policy "kurzy vidia prihlaseni" on public.exchange_rates for select to authenticated
  using (true);

-- Dvojfaktor podľa pravidla pre každú novú tabuľku.
drop policy if exists "mfa ak je zapnute" on public.exchange_rates;
create policy "mfa ak je zapnute" on public.exchange_rates as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- Prepočet na faktúre: kurz aj výsledné sumy, aby sa doklad po zmene kurzu
-- spätne nemenil.
alter table public.invoices
  add column if not exists exchange_rate numeric(18, 6),
  add column if not exists exchange_rate_date date,
  add column if not exists subtotal_eur numeric(14, 2),
  add column if not exists vat_total_eur numeric(14, 2),
  add column if not exists total_eur numeric(14, 2);

-- To isté pre prijaté faktúry — do priznania vstupujú tiež v eurách.
alter table public.purchase_invoices
  add column if not exists exchange_rate numeric(18, 6),
  add column if not exists amount_without_vat_eur numeric(14, 2),
  add column if not exists vat_amount_eur numeric(14, 2);
