/*
  Help desk — požiadavky na podporu.

  Doteraz šlo „Nahlásiť chybu" e-mailom na servisnú adresu a do tabuľky
  `feedback`, ktorú nikto nečítal. Zákazník nevedel, či sa správa dostala ďalej,
  a podpora nemala kde odpovedať inak než z vlastnej schránky. Požiadavka má
  odteraz číslo, stav a vlákno správ, ktoré vidia obe strany.

  Zákazník svoje požiadavky len číta (RLS); zakladanie, odpovede a zmena stavu
  idú cez server, ktorý overí, komu požiadavka patrí, a pošle e-mail. Podpora
  (platform admin) pracuje výhradne cez server.
*/
create sequence if not exists public.podpora_cislo_seq start 1001;

create table public.podpora_poziadavky (
  id uuid primary key default gen_random_uuid(),
  cislo integer not null unique default nextval('public.podpora_cislo_seq'),
  user_id uuid references auth.users(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  email text not null,
  meno text,
  predmet text not null check (char_length(predmet) between 1 and 200),
  kategoria text not null default 'otazka'
    check (kategoria in ('otazka', 'chyba', 'napad', 'predplatne', 'diagnostika', 'kontakt')),
  stav text not null default 'nova'
    check (stav in ('nova', 'otvorena', 'caka_na_zakaznika', 'vyriesena')),
  zdroj text not null default 'aplikacia' check (zdroj in ('aplikacia', 'mobil', 'web')),
  url text,
  user_agent text,
  posledna_sprava_at timestamptz not null default now(),
  posledna_od text not null default 'zakaznik' check (posledna_od in ('zakaznik', 'podpora')),
  zakaznik_videl_at timestamptz,
  podpora_videla_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index podpora_poziadavky_user_idx on public.podpora_poziadavky (user_id, posledna_sprava_at desc);
create index podpora_poziadavky_stav_idx on public.podpora_poziadavky (stav, posledna_sprava_at desc);
create index podpora_poziadavky_company_idx on public.podpora_poziadavky (company_id);

create table public.podpora_spravy (
  id uuid primary key default gen_random_uuid(),
  poziadavka_id uuid not null references public.podpora_poziadavky(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null,
  od_podpory boolean not null default false,
  -- Interná poznámka podpory; zákazník ju nikdy neuvidí.
  interna boolean not null default false,
  text text not null check (char_length(text) between 1 and 10000),
  created_at timestamptz not null default now()
);

create index podpora_spravy_poziadavka_idx on public.podpora_spravy (poziadavka_id, created_at);
create index podpora_spravy_autor_idx on public.podpora_spravy (autor_id);

alter table public.podpora_poziadavky enable row level security;
alter table public.podpora_spravy enable row level security;

create policy "zakaznik cita svoje poziadavky" on public.podpora_poziadavky
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "zakaznik cita spravy svojich poziadaviek" on public.podpora_spravy
  for select to authenticated
  using (
    not interna
    and exists (
      select 1 from public.podpora_poziadavky p
       where p.id = poziadavka_id and p.user_id = (select auth.uid())
    )
  );

-- Dvojfaktor: nové tabuľky reštriktívnu politiku samy nedostanú.
create policy "mfa ak je zapnute" on public.podpora_poziadavky
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "mfa ak je zapnute" on public.podpora_spravy
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- Bez GRANT vracia tabuľka „permission denied", hoci politiky sedia. Zápis
-- zákazník nedostane — ide cez server.
revoke all on public.podpora_poziadavky, public.podpora_spravy from anon, public;
grant select on public.podpora_poziadavky, public.podpora_spravy to authenticated;
grant all on public.podpora_poziadavky, public.podpora_spravy to service_role;
grant usage, select on sequence public.podpora_cislo_seq to service_role;
