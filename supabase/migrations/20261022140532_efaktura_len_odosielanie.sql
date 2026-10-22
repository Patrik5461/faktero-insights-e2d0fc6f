-- Aplikované v dvoch častiach: 20261022140532_efaktura_len_odosielanie_tabulky a 20261022140534_…_prava.
-- eFaktúra „len odosielanie“ (ePošták Enterprise API, onboarding send_only).
--
-- Firma, ktorá prijíma eFaktúry u iného poskytovateľa (napr. SFC, s.r.o. u
-- Doklado), chce eFaktúry odosielať z Faktera. White Label to nevie — vždy
-- zakladá účastníka v SMP, teda preberá aj príjem. Onboarding „iba
-- odosielanie“ v SMP nič neregistruje ani neodregistrováva; príjem ostáva
-- u pôvodného poskytovateľa.
--
-- 1) efaktura_odosielanie_ziadosti — jedna žiadosť (onboarding request) na firmu.
--    Opakovanie po zamietnutí/vypršaní prepíše ten istý riadok s novým
--    `pokus` (a teda novým Idempotency-Key). Kľúč viazaný na firmu
--    (scopedFirmId, documents:send + documents:read) sa drží len zašifrovaný.
-- 2) efaktura_epostak_nastavenie — partnerské nastavenia u ePoštáka, zatiaľ len
--    onboarding webhook a jeho HMAC tajomstvo (ePošták ho vráti iba raz).
-- 3) efaktura_profiles.rezim / prijem_poskytovatel — aby rozhranie vedelo, že
--    príjem nejde cez Faktero, a server nesťahoval prijaté doklady.
--
-- Obe nové tabuľky číta len server (service role) — admin cez serverové funkcie
-- s kontrolou platform_admins, zákazník stav cez getEfakturaReadinessFn po
-- overení členstva vo firme.

create table if not exists public.efaktura_odosielanie_ziadosti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  -- Žiadosť z FS, z ktorej admin onboarding spustil (napr. „u iného poskytovateľa“).
  pds_ziadost_id uuid references public.efaktura_pds_ziadosti(id) on delete set null,
  dic text not null check (dic ~ '^[0-9]{10}$'),
  customer_ref text not null,
  -- Zvyšuje sa, keď predchádzajúca žiadosť skončila natrvalo (expired/revoked/blocked).
  pokus integer not null default 1,
  relationship_mode text not null default 'technical_delegation'
    check (relationship_mode in ('technical_delegation', 'managed_service')),
  contact_email text,
  -- Kto firme doručuje prijaté eFaktúry (napr. „Doklado s.r.o.“).
  prijem_poskytovatel text,
  stav text not null default 'vytvorena'
    check (stav in ('vytvorena', 'caka_na_fs', 'caka_na_potvrdenie', 'aktivuje_sa', 'active', 'zamietnuta', 'chyba')),
  epostak_request_id text,
  epostak_stav text,
  next_action text,
  client_message_sk text,
  payer_mode text,
  epostak_firm_id text,
  -- Kľúč viazaný na firmu (POST /integrator/keys so scopedFirmId).
  kluc_id text,
  kluc_client_id text,
  kluc_sifrovany text,
  kluc_chyba text,
  kluc_pokusov integer not null default 0,
  chyba text,
  pokusov integer not null default 0,
  posledna_udalost_id text,
  oznamenie_odoslane_at timestamptz,
  vytvoril uuid,
  vytvorene_at timestamptz not null default now(),
  aktualizovane_at timestamptz not null default now(),
  aktivovane_at timestamptz
);
create index if not exists efaktura_odosielanie_ziadosti_request_idx
  on public.efaktura_odosielanie_ziadosti (epostak_request_id);
create index if not exists efaktura_odosielanie_ziadosti_firm_idx
  on public.efaktura_odosielanie_ziadosti (epostak_firm_id);
create index if not exists efaktura_odosielanie_ziadosti_stav_idx
  on public.efaktura_odosielanie_ziadosti (stav);

create table if not exists public.efaktura_epostak_nastavenie (
  kluc text primary key,
  url text,
  udalosti text[] not null default '{}',
  tajomstvo_sifrovane text,
  chyba text,
  aktualizovane_at timestamptz not null default now()
);

alter table public.efaktura_odosielanie_ziadosti enable row level security;
alter table public.efaktura_epostak_nastavenie enable row level security;

-- Žiadne povoľujúce politiky: prihlásený používateľ nevidí nič. Reštriktívna
-- mfa_ok ako na každej tabuľke, keby sa niekedy politika pridala.
create policy "mfa ak je zapnute" on public.efaktura_odosielanie_ziadosti as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "mfa ak je zapnute" on public.efaktura_epostak_nastavenie as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

revoke all on public.efaktura_odosielanie_ziadosti from public, anon, authenticated;
revoke all on public.efaktura_epostak_nastavenie from public, anon, authenticated;
grant all on public.efaktura_odosielanie_ziadosti to service_role;
grant all on public.efaktura_epostak_nastavenie to service_role;

-- Profil eFaktúry: plný režim (odosielanie aj príjem cez Faktero) alebo len odosielanie.
alter table public.efaktura_profiles
  add column if not exists rezim text not null default 'plny',
  add column if not exists prijem_poskytovatel text;
alter table public.efaktura_profiles drop constraint if exists efaktura_profiles_rezim_check;
alter table public.efaktura_profiles add constraint efaktura_profiles_rezim_check
  check (rezim in ('plny', 'len_odosielanie'));

comment on column public.efaktura_profiles.rezim is
  'plny = odosielanie aj príjem cez Faktero (White Label); len_odosielanie = onboarding send_only, príjem u iného poskytovateľa.';
comment on column public.efaktura_profiles.prijem_poskytovatel is
  'Pri len_odosielanie: kto firme doručuje prijaté eFaktúry (napr. Doklado s.r.o.).';
comment on column public.efaktura_odosielanie_ziadosti.kluc_sifrovany is
  'sk_int_* kľúč viazaný na firmu (scopedFirmId), šifrovaný encryptSecret. ePošták ho vráti len raz.';
