-- eFaktúra: žiadosti z Finančnej správy (PDS/PFS) a webhooky ePoštáka.
--
-- 1) Firma si na Portáli FS vyberie Faktero ako poskytovateľa doručovacej
--    služby. FS pošle na náš webhook jej DIČ, názov, kontakt a verification_token
--    (podpis „DIČ poskytovateľa : DIČ firmy“). Token odovzdáme ePoštákovi
--    (White Label registrácia do SMP). Kým registrácia neprebehne, token držíme
--    zašifrovaný; potom sa zmaže — ePošták ho žiada nikdy nelogovať.
-- 2) ePošták posiela udalosti o dokladoch (document.received, …) na náš
--    webhook. Každé predplatné má vlastné HMAC tajomstvo — ukladá sa šifrované.
--
-- Obe tabuľky sú len pre server (service role). Klient k nim nemá prístup;
-- administrácia ich číta cez serverové funkcie s kontrolou platform_admins.

create table if not exists public.efaktura_pds_ziadosti (
  id uuid primary key default gen_random_uuid(),
  prijate_at timestamptz not null default now(),
  vytvorene_fs timestamptz,
  dic text not null check (dic ~ '^[0-9]{10}$'),
  nazov text,
  email text,
  telefon text,
  token_sifrovany text,
  token_odtlacok text not null,
  stav text not null default 'prijata'
    check (stav in ('prijata', 'registruje_sa', 'registrovana', 'na_kontrolu', 'zamietnuta', 'chyba')),
  company_id uuid references public.companies(id) on delete set null,
  epostak_operacia_id text,
  epostak_firm_id text,
  peppol_id text,
  chyba text,
  pokusov integer not null default 0,
  posledny_pokus_at timestamptz,
  pozvanka_odoslana_at timestamptz,
  ip text
);

create unique index if not exists efaktura_pds_ziadosti_token_key
  on public.efaktura_pds_ziadosti (token_odtlacok);
create index if not exists efaktura_pds_ziadosti_dic_idx on public.efaktura_pds_ziadosti (dic);
create index if not exists efaktura_pds_ziadosti_stav_idx on public.efaktura_pds_ziadosti (stav);

create table if not exists public.efaktura_webhooky (
  company_id uuid primary key references public.companies(id) on delete cascade,
  epostak_firm_id text not null,
  webhook_id text,
  tajomstvo_sifrovane text,
  stav text not null default 'aktivny' check (stav in ('aktivny', 'chyba')),
  chyba text,
  vytvorene_at timestamptz not null default now(),
  posledna_udalost_at timestamptz
);
create index if not exists efaktura_webhooky_firm_idx on public.efaktura_webhooky (epostak_firm_id);

alter table public.efaktura_pds_ziadosti enable row level security;
alter table public.efaktura_webhooky enable row level security;

-- Žiadne povoľujúce politiky: prihlásený používateľ nevidí nič. Reštriktívna
-- mfa_ok ako na každej tabuľke, keby sa niekedy politika pridala.
create policy "mfa ak je zapnute" on public.efaktura_pds_ziadosti as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "mfa ak je zapnute" on public.efaktura_webhooky as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

revoke all on public.efaktura_pds_ziadosti from public, anon, authenticated;
revoke all on public.efaktura_webhooky from public, anon, authenticated;
grant all on public.efaktura_pds_ziadosti to service_role;
grant all on public.efaktura_webhooky to service_role;
