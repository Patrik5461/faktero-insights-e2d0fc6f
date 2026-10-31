-- Palivové karty (Shell, neskôr DKV, Eurowag, OMV): pripojenie, transakcie, väzby kariet na vozidlá, log.
-- Zapisuje len server servisným kľúčom po overPristup; prihlásený člen firmy smie len čítať.
-- Tajomstvá (client id/secret) sú v `prihlasenie_sifrovane` (AES-GCM, payment-crypto) a klient ten stĺpec nevidí.

create table if not exists public.palivove_karty_pripojenia (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  poskytovatel text not null check (poskytovatel ~ '^[a-z0-9_-]{2,40}$'),
  nazov text not null default '' check (char_length(nazov) <= 120),
  prihlasenie_sifrovane text not null,
  -- Nezávadné údaje na zobrazenie: payer/account number, prostredie, posledné 4 znaky client id.
  prihlasenie_verejne jsonb not null default '{}'::jsonb,
  -- Režim: 'faktura' = prijatá faktúra z Invoice API, 'len_tankovania' = bez dokladov.
  rezim text not null default 'faktura' check (rezim in ('faktura', 'len_tankovania')),
  aktivne boolean not null default true,
  auto_sync boolean not null default true,
  stav text not null default 'nove' check (stav in ('nove', 'ok', 'chyba', 'limit', 'prebieha')),
  posledna_sync_at timestamptz,
  posledna_chyba text,
  transakcie_do timestamptz,
  faktury_do date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists palivove_karty_pripojenia_firma_idx on public.palivove_karty_pripojenia (company_id, poskytovatel);
create index if not exists palivove_karty_pripojenia_cron_idx on public.palivove_karty_pripojenia (posledna_sync_at nulls first) where aktivne and auto_sync;
drop trigger if exists trg_palivove_karty_pripojenia_updated_at on public.palivove_karty_pripojenia;
create trigger trg_palivove_karty_pripojenia_updated_at before update on public.palivove_karty_pripojenia
  for each row execute function public.set_updated_at();

-- Karta alebo ŠPZ z karty → vozidlo. Číslo karty sa ukladá len maskované (posledných 6 číslic).
create table if not exists public.palivove_karty_vazby (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pripojenie_id uuid not null references public.palivove_karty_pripojenia(id) on delete cascade,
  karta text not null check (char_length(karta) between 2 and 40),
  spz text,
  vodic text,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  rucne boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pripojenie_id, karta)
);
create index if not exists palivove_karty_vazby_firma_idx on public.palivove_karty_vazby (company_id);
create index if not exists palivove_karty_vazby_vozidlo_idx on public.palivove_karty_vazby (vehicle_id) where vehicle_id is not null;
drop trigger if exists trg_palivove_karty_vazby_updated_at on public.palivove_karty_vazby;
create trigger trg_palivove_karty_vazby_updated_at before update on public.palivove_karty_vazby
  for each row execute function public.set_updated_at();

create table if not exists public.palivove_karty_transakcie (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pripojenie_id uuid not null references public.palivove_karty_pripojenia(id) on delete cascade,
  poskytovatel text not null,
  externe_id text not null,
  cas timestamptz not null,
  datum date not null,
  karta text,
  spz text,
  vodic text,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  produkt text,
  produkt_kod text,
  je_palivo boolean not null default false,
  mnozstvo numeric,
  jednotka text,
  zaklad numeric not null default 0,
  dph numeric not null default 0,
  sadzba_dph numeric,
  spolu numeric not null default 0,
  mena text not null default 'EUR',
  krajina text,
  krajina_dph text,
  miesto text,
  tachometer_km numeric,
  faktura_cislo text,
  faktura_datum date,
  dobropis boolean not null default false,
  purchase_invoice_id uuid references public.purchase_invoices(id) on delete set null,
  fuel_record_id uuid references public.fuel_records(id) on delete set null,
  -- Bloček z tej istej pumpy, ktorý už vo Fakteri je — hrozí dvojité zaúčtovanie.
  blocek_id uuid references public.expense_documents(id) on delete set null,
  surove jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pripojenie_id, externe_id)
);
create index if not exists palivove_karty_transakcie_firma_idx on public.palivove_karty_transakcie (company_id, datum desc);
create index if not exists palivove_karty_transakcie_vozidlo_idx on public.palivove_karty_transakcie (vehicle_id) where vehicle_id is not null;
create index if not exists palivove_karty_transakcie_faktura_idx on public.palivove_karty_transakcie (pripojenie_id, faktura_cislo) where faktura_cislo is not null;
create index if not exists palivove_karty_transakcie_prijata_idx on public.palivove_karty_transakcie (purchase_invoice_id) where purchase_invoice_id is not null;
create index if not exists palivove_karty_transakcie_tankovanie_idx on public.palivove_karty_transakcie (fuel_record_id) where fuel_record_id is not null;
create index if not exists palivove_karty_transakcie_blocek_idx on public.palivove_karty_transakcie (blocek_id) where blocek_id is not null;
drop trigger if exists trg_palivove_karty_transakcie_updated_at on public.palivove_karty_transakcie;
create trigger trg_palivove_karty_transakcie_updated_at before update on public.palivove_karty_transakcie
  for each row execute function public.set_updated_at();

create table if not exists public.palivove_karty_logy (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pripojenie_id uuid not null references public.palivove_karty_pripojenia(id) on delete cascade,
  druh text not null,
  stav text not null check (stav in ('ok', 'chyba', 'limit', 'ciastocne')),
  sprava text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists palivove_karty_logy_pripojenie_idx on public.palivove_karty_logy (pripojenie_id, created_at desc);
create index if not exists palivove_karty_logy_firma_idx on public.palivove_karty_logy (company_id);

alter table public.palivove_karty_pripojenia enable row level security;
alter table public.palivove_karty_vazby enable row level security;
alter table public.palivove_karty_transakcie enable row level security;
alter table public.palivove_karty_logy enable row level security;

drop policy if exists "clenovia citaju palivove karty" on public.palivove_karty_pripojenia;
create policy "clenovia citaju palivove karty" on public.palivove_karty_pripojenia for select to authenticated
  using (public.is_company_member(company_id, (select auth.uid())));
drop policy if exists "clenovia citaju vazby kariet" on public.palivove_karty_vazby;
create policy "clenovia citaju vazby kariet" on public.palivove_karty_vazby for select to authenticated
  using (public.is_company_member(company_id, (select auth.uid())));
drop policy if exists "clenovia citaju transakcie kariet" on public.palivove_karty_transakcie;
create policy "clenovia citaju transakcie kariet" on public.palivove_karty_transakcie for select to authenticated
  using (public.is_company_member(company_id, (select auth.uid())));
drop policy if exists "clenovia citaju logy kariet" on public.palivove_karty_logy;
create policy "clenovia citaju logy kariet" on public.palivove_karty_logy for select to authenticated
  using (public.is_company_member(company_id, (select auth.uid())));

drop policy if exists "mfa ak je zapnute" on public.palivove_karty_pripojenia;
create policy "mfa ak je zapnute" on public.palivove_karty_pripojenia as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
drop policy if exists "mfa ak je zapnute" on public.palivove_karty_vazby;
create policy "mfa ak je zapnute" on public.palivove_karty_vazby as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
drop policy if exists "mfa ak je zapnute" on public.palivove_karty_transakcie;
create policy "mfa ak je zapnute" on public.palivove_karty_transakcie as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
drop policy if exists "mfa ak je zapnute" on public.palivove_karty_logy;
create policy "mfa ak je zapnute" on public.palivove_karty_logy as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

select public.vlastny_pristup_politiky_na('palivove_karty_pripojenia', 'company_id', 'jazdy');
select public.vlastny_pristup_politiky_na('palivove_karty_vazby', 'company_id', 'jazdy');
select public.vlastny_pristup_politiky_na('palivove_karty_transakcie', 'company_id', 'jazdy');
select public.vlastny_pristup_politiky_na('palivove_karty_logy', 'company_id', 'jazdy');

revoke all on public.palivove_karty_pripojenia from anon, public, authenticated;
revoke all on public.palivove_karty_vazby from anon, public, authenticated;
revoke all on public.palivove_karty_transakcie from anon, public, authenticated;
revoke all on public.palivove_karty_logy from anon, public, authenticated;
grant select (id, company_id, poskytovatel, nazov, prihlasenie_verejne, rezim, aktivne, auto_sync, stav,
  posledna_sync_at, posledna_chyba, transakcie_do, faktury_do, created_by, created_at, updated_at)
  on public.palivove_karty_pripojenia to authenticated;
grant select on public.palivove_karty_vazby to authenticated;
grant select on public.palivove_karty_transakcie to authenticated;
grant select on public.palivove_karty_logy to authenticated;
grant all on public.palivove_karty_pripojenia to service_role;
grant all on public.palivove_karty_vazby to service_role;
grant all on public.palivove_karty_transakcie to service_role;
grant all on public.palivove_karty_logy to service_role;

-- Tankovanie: stav tachometra z nákupu kartou (Shell OdometerInput). Starý kód stĺpec nepozná, nevadí mu.
alter table public.fuel_records add column if not exists odometer_km numeric;
