-- Denný e-mailový súhrn úloh (na schválenie, komentáre, nespracované doklady,
-- faktúry po splatnosti). Kód: src/lib/faktero/denny-suhrn*.ts,
-- hook /api/public/hooks/denny-suhrn.
--
-- Po aplikovaní cez MCP premenuj súbor podľa zapísanej verzie
-- (supabase/migrations/<verzia>_denny_suhrn.sql).

-- 1) Osobné nastavenie: súhrn je predvolene zapnutý, vypína sa v Nastaveniach
--    účtu alebo odkazom v e-maile.
alter table public.profiles
  add column if not exists denny_suhrn boolean not null default true;

-- `authenticated` má na `profiles` UPDATE len po stĺpcoch (pozri
-- 20260811195741_zrusenie_uctu_stlpce_len_pre_server_oprava.sql) — nový
-- stĺpec treba povoliť zvlášť, inak prepínač v nastaveniach vráti
-- „permission denied". Politika „Users update own profile" stráži riadok.
grant update (denny_suhrn) on public.profiles to authenticated;

-- 2) Čo už dnes odišlo — ochrana pred dvojitým odoslaním. Jeden e-mail na
--    človeka a deň (so sekciami za všetky firmy), preto kľúč (user_id, den).
--    Hook riadok zapíše so stavom 'odosiela' PRED odoslaním (insert … on
--    conflict do nothing), po úspechu prepne na 'odoslane', pri chybe
--    Resendu ho zmaže, aby to ďalší beh skúsil znova. Riadok, ktorý ostane
--    v 'odosiela' (pád servera uprostred), znamená radšej žiadny e-mail než
--    dva.
create table if not exists public.denny_suhrn_odoslane (
  user_id uuid not null references auth.users(id) on delete cascade,
  den date not null,
  firmy uuid[] not null default '{}',
  pocty jsonb not null default '[]'::jsonb,
  stav text not null default 'odosiela' check (stav in ('odosiela', 'odoslane')),
  resend_id text,
  odoslane_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, den)
);
create index if not exists denny_suhrn_odoslane_den on public.denny_suhrn_odoslane (den);

-- Len pre server (servisný kľúč). Klient k nej nemá prístup vôbec.
alter table public.denny_suhrn_odoslane enable row level security;
create policy "mfa ak je zapnute" on public.denny_suhrn_odoslane as restrictive
  for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
revoke all on public.denny_suhrn_odoslane from public, anon, authenticated;
grant all on public.denny_suhrn_odoslane to service_role;
