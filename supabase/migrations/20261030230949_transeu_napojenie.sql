-- Trans.eu pre dopravcov: prijaté prepravné objednávky → prijatá objednávka → faktúra,
-- faktúra späť do Trans.eu. Prihlásenie cez OAuth 2.0 (authorization code); tokeny a
-- vlastné kľúče aplikácie sú zašifrované na serveri (encryptSecret).

create table if not exists public.transeu_napojenia (
  company_id uuid primary key references public.companies(id) on delete cascade,
  -- Vlastná aplikácia dopravcu (Client ID/Secret/Api-key z Trans.eu). Bez nich platí aplikácia Faktera.
  client_id text,
  client_secret_sifrovany text,
  api_kluc_sifrovany text,
  access_token_sifrovany text,
  refresh_token_sifrovany text,
  token_plati_do timestamptz,
  stav text not null default 'caka' check (stav in ('caka', 'pripojene', 'chyba')),
  firma_nazov text,
  firma_vat_id text,
  -- Hook sťahuje objednávky len firmám so zapnutým auto_sync, a to od auto_od.
  auto_sync boolean not null default false,
  auto_od timestamptz,
  posledna_sync_at timestamptz,
  posledna_chyba text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transeu_objednavky (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- id objednávky v Trans.eu (UUID z /ext/orders-api/v1/orders-received)
  transeu_id text not null,
  cislo text,
  referencia text,
  stav text,
  zakaznik_nazov text,
  zakaznik_vat_id text,
  nakladka text,
  nakladka_krajina text,
  nakladka_od timestamptz,
  vykladka text,
  vykladka_krajina text,
  vykladka_do timestamptz,
  vzdialenost_km numeric,
  cena numeric,
  mena text,
  typ_ceny text,
  splatnost_dni integer,
  ma_fakturu_v_transeu boolean not null default false,
  data jsonb,
  sales_order_id uuid references public.sales_orders(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  faktura_odoslana_at timestamptz,
  faktura_media_id text,
  chyba text,
  stiahnuta_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, transeu_id)
);
create index if not exists transeu_objednavky_firma on public.transeu_objednavky (company_id, nakladka_od desc);
create index if not exists transeu_objednavky_so on public.transeu_objednavky (sales_order_id) where sales_order_id is not null;
create index if not exists transeu_objednavky_inv on public.transeu_objednavky (invoice_id) where invoice_id is not null;

-- Čítať smú členovia firmy s oblasťou faktúr; zapisuje len server po overení oprávnenia.
do $$
declare t text;
begin
  foreach t in array array['transeu_napojenia', 'transeu_objednavky'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "clenovia citaju" on public.%I for select to authenticated using (public.is_company_member(company_id, (select auth.uid())))', t);
    execute format('create policy "mfa ak je zapnute" on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))', t);
    perform public.vlastny_pristup_politiky_na(t, 'company_id', 'faktury');
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Tokeny a kľúče prehliadač nikdy nedostane — len stĺpce bez tajomstiev.
grant select (company_id, client_id, token_plati_do, stav, firma_nazov, firma_vat_id, auto_sync,
  auto_od, posledna_sync_at, posledna_chyba, updated_at)
  on public.transeu_napojenia to authenticated;
grant select on public.transeu_objednavky to authenticated;
