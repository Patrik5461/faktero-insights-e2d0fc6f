/*
  GPS integrácie — spoločná vrstva pre viac poskytovateľov (GPS Dozor,
  Webdispečink, Webfleet, Traccar, …). Commander a Tesla ostávajú vo svojich
  tabuľkách.

  - gps_pripojenia: jeden účet u poskytovateľa. Prihlasovacie údaje sú celé
    zašifrované (AES-GCM, ten istý kľúč ako pri platobných bránach a SMTP) v
    `prihlasenie_sifrovane`; `prihlasenie_verejne` drží len netajné polia
    (meno, adresa servera), aby ich formulár vedel ukázať. Šifrovaný stĺpec
    prehliadač nedostane ani na čítanie (stĺpcové GRANT).
  - gps_vozidla_vazby: vozidlo u poskytovateľa ↔ vozidlo vo Fakterе;
    `jazdy_do` je kurzor, po ktorý sú jazdy stiahnuté (beh po dávkach do 25 s).
  - gps_sync_logy: história behov.
  Zapisuje len server (servisný kľúč) po overení správcu firmy, prihlásený
  používateľ tabuľky len číta.

  fuel_records dostáva external_source/external_id ako trips — tankovania
  z GPS a palivových kariet sa tak neimportujú dvakrát. Nové stĺpce sú
  nepovinné, starý kód ich nepozná a nevadia mu.
*/
create table public.gps_pripojenia (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  poskytovatel text not null check (poskytovatel ~ '^[a-z0-9_-]{2,40}$'),
  nazov text not null default '' check (char_length(nazov) <= 120),
  prihlasenie_sifrovane text not null,
  prihlasenie_verejne jsonb not null default '{}'::jsonb,
  aktivne boolean not null default true,
  auto_sync boolean not null default true,
  stav text not null default 'nove' check (stav in ('nove', 'ok', 'chyba', 'limit', 'prebieha')),
  neuplne boolean not null default true,
  posledna_sync_at timestamptz,
  posledna_chyba text,
  tankovania_do timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index gps_pripojenia_firma_idx on public.gps_pripojenia (company_id, poskytovatel);
create index gps_pripojenia_cron_idx on public.gps_pripojenia (posledna_sync_at nulls first) where aktivne and auto_sync;
create trigger trg_gps_pripojenia_updated_at before update on public.gps_pripojenia
  for each row execute function public.set_updated_at();

create table public.gps_vozidla_vazby (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pripojenie_id uuid not null references public.gps_pripojenia(id) on delete cascade,
  externe_id text not null,
  nazov text,
  spz text,
  vin text,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  jazdy_do timestamptz,
  posledna_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pripojenie_id, externe_id)
);
create index gps_vozidla_vazby_firma_idx on public.gps_vozidla_vazby (company_id);
create index gps_vozidla_vazby_vozidlo_idx on public.gps_vozidla_vazby (vehicle_id) where vehicle_id is not null;
create trigger trg_gps_vozidla_vazby_updated_at before update on public.gps_vozidla_vazby
  for each row execute function public.set_updated_at();

create table public.gps_sync_logy (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pripojenie_id uuid not null references public.gps_pripojenia(id) on delete cascade,
  druh text not null,
  stav text not null check (stav in ('ok', 'chyba', 'limit', 'ciastocne')),
  sprava text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index gps_sync_logy_pripojenie_idx on public.gps_sync_logy (pripojenie_id, created_at desc);
create index gps_sync_logy_firma_idx on public.gps_sync_logy (company_id);

-- RLS: členovia firmy čítajú, zapisuje len server.
alter table public.gps_pripojenia enable row level security;
alter table public.gps_vozidla_vazby enable row level security;
alter table public.gps_sync_logy enable row level security;

create policy "clenovia citaju gps pripojenia" on public.gps_pripojenia for select to authenticated
  using (is_company_member(company_id, (select auth.uid())));
create policy "clenovia citaju gps vazby" on public.gps_vozidla_vazby for select to authenticated
  using (is_company_member(company_id, (select auth.uid())));
create policy "clenovia citaju gps logy" on public.gps_sync_logy for select to authenticated
  using (is_company_member(company_id, (select auth.uid())));

create policy "mfa ak je zapnute" on public.gps_pripojenia as restrictive for all to authenticated
  using ((select mfa_ok())) with check ((select mfa_ok()));
create policy "mfa ak je zapnute" on public.gps_vozidla_vazby as restrictive for all to authenticated
  using ((select mfa_ok())) with check ((select mfa_ok()));
create policy "mfa ak je zapnute" on public.gps_sync_logy as restrictive for all to authenticated
  using ((select mfa_ok())) with check ((select mfa_ok()));

select public.vlastny_pristup_politiky_na('gps_pripojenia', 'company_id', 'jazdy');
select public.vlastny_pristup_politiky_na('gps_vozidla_vazby', 'company_id', 'jazdy');
select public.vlastny_pristup_politiky_na('gps_sync_logy', 'company_id', 'jazdy');

revoke all on public.gps_pripojenia from anon, public, authenticated;
revoke all on public.gps_vozidla_vazby from anon, public, authenticated;
revoke all on public.gps_sync_logy from anon, public, authenticated;
-- Šifrované prihlásenie prehliadač nedostane ani zašifrované.
grant select (id, company_id, poskytovatel, nazov, prihlasenie_verejne, aktivne, auto_sync, stav,
  neuplne, posledna_sync_at, posledna_chyba, tankovania_do, created_by, created_at, updated_at)
  on public.gps_pripojenia to authenticated;
grant select on public.gps_vozidla_vazby to authenticated;
grant select on public.gps_sync_logy to authenticated;
grant all on public.gps_pripojenia to service_role;
grant all on public.gps_vozidla_vazby to service_role;
grant all on public.gps_sync_logy to service_role;

-- Tankovania z externých zdrojov — idempotentný import ako pri jazdách.
alter table public.fuel_records
  add column if not exists external_source text,
  add column if not exists external_id text,
  add column if not exists imported_at timestamptz,
  add column if not exists raw_provider_data jsonb;
create unique index if not exists idx_fuel_records_external_unique
  on public.fuel_records (company_id, external_source, external_id)
  where external_source is not null and external_id is not null;
