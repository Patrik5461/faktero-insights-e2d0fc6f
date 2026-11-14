-- Konektor do POHODY: položky dávky a ich potvrdenie odpoveďou POHODY
-- (audit exportov 14. 11. 2026 — K3, V12, V13).
--
-- Predtým konektor doklady označil za odovzdané (a zamkol) už pri stiahnutí
-- dávky. Keď POHODA odmietla celý balík alebo odpoveď neprišla, doklady boli
-- u nás odovzdané a v POHODE neexistovali. Teraz je každá položka dávky
-- najprv `odoslane`; doklad je odovzdaný až po odpovedi POHODY (`ok`),
-- odmietnutý (`chyba`) alebo nepotvrdený do 6 hodín (`vyprsane`) ide znova.
--
-- `polozka_id` = `dataPackItem id` z dávky — podľa neho sa páruje odpoveď
-- (aj storno `<id>-storno`, ktoré sa predtým nespárovalo). Príjemka/výdajka
-- má jedno id pre viac pohybov — každý pohyb má vlastný riadok.
--
-- `druh = 'zmazane_v_pohode'`: človek v Kontrole Pohody potvrdil, že pôvodnú
-- verziu opraveného dokladu (verzia = `pohoda_verzia`) v POHODE zmazal;
-- `storno_opravy` = storno pôvodnej verzie, ktoré konektor poslal sám.
--
-- Zapisuje len server (servisný kľúč) — konektor nemá prihláseného
-- používateľa, potvrdenie zmazania ide cez serverovú funkciu po kontrole práv.

create table if not exists public.pohoda_konektor_polozky (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  export_job_id uuid references public.export_jobs(id) on delete cascade,
  polozka_id text not null,
  druh text not null check (druh in (
    'faktura', 'prijata', 'doklad', 'pokladna',
    'adresar', 'sklad', 'zakazka', 'pohyb',
    'storno', 'storno_opravy', 'zmazane_v_pohode'
  )),
  zaznam_id uuid not null,
  verzia text,
  stav text not null default 'odoslane' check (stav in ('odoslane', 'ok', 'chyba', 'vyprsane')),
  pohoda_cislo text,
  chyba text,
  created_at timestamptz not null default now(),
  potvrdene_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists pohoda_konektor_polozky_stav_idx
  on public.pohoda_konektor_polozky (company_id, stav, created_at desc);
create index if not exists pohoda_konektor_polozky_zaznam_idx
  on public.pohoda_konektor_polozky (company_id, zaznam_id, created_at desc);
create index if not exists pohoda_konektor_polozky_polozka_idx
  on public.pohoda_konektor_polozky (company_id, polozka_id, created_at desc);
create index if not exists pohoda_konektor_polozky_job_idx
  on public.pohoda_konektor_polozky (export_job_id);

alter table public.pohoda_konektor_polozky enable row level security;

-- Čítať smú členovia firmy (Kontrola Pohody); zapisuje len service_role.
revoke all on public.pohoda_konektor_polozky from public, anon, authenticated;
grant select on public.pohoda_konektor_polozky to authenticated;
grant all on public.pohoda_konektor_polozky to service_role;

drop policy if exists "clenovia citaju pohoda_konektor_polozky" on public.pohoda_konektor_polozky;
create policy "clenovia citaju pohoda_konektor_polozky" on public.pohoda_konektor_polozky
  for select to authenticated
  using (is_company_member(company_id, (select auth.uid())));

drop policy if exists "mfa ak je zapnute" on public.pohoda_konektor_polozky;
create policy "mfa ak je zapnute" on public.pohoda_konektor_polozky as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

comment on table public.pohoda_konektor_polozky is
  'Položky dávok konektora do POHODY a ich potvrdenie odpoveďou POHODY (odovzdané až po ok).';
