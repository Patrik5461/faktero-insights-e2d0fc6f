/*
  Help desk — automatická oprava nahlásených chýb.

  Pri požiadavke „chyba" spustí server (scripts/auto-oprava) Clauda nad kópiou
  kódu: ten navrhne opravu na samostatnej vetve, podpora dostane e-mail a
  nasadí sa až po schválení v Admin → Podpora. Text nahlásenia píše hocikto
  zvonka, preto agent nemá príkazový riadok, sieť ani tajomstvá a schválenie
  je vždy na človeku.

  Riadky zapisuje len spúšťač (servisný kľúč); admin mení stav cez server po
  overení `platform_admins`. Zákazník tabuľku nevidí vôbec.
*/
create table public.podpora_auto_opravy (
  id uuid primary key default gen_random_uuid(),
  poziadavka_id uuid not null references public.podpora_poziadavky(id) on delete cascade,
  stav text not null default 'caka'
    check (stav in ('caka', 'bezi', 'navrh', 'bez_opravy', 'zlyhala',
                    'schvalena', 'zlucuje', 'zlucena', 'nasadena', 'zamietnuta')),
  vetva text,
  commit_sha text,
  zlucene_sha text,
  pricina text,
  zmena text,
  istota text check (istota in ('vysoka', 'stredna', 'nizka')),
  subory text[] not null default '{}',
  diff text,
  kontrola text,
  chyba text,
  pokyn text,
  pokus integer not null default 1,
  schvalil uuid references auth.users(id) on delete set null,
  schvalene_at timestamptz,
  zaciatok_at timestamptz,
  koniec_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index podpora_auto_opravy_poziadavka_idx on public.podpora_auto_opravy (poziadavka_id, created_at desc);
create index podpora_auto_opravy_stav_idx on public.podpora_auto_opravy (stav, created_at);
create index podpora_auto_opravy_schvalil_idx on public.podpora_auto_opravy (schvalil);

alter table public.podpora_auto_opravy enable row level security;

create policy "mfa ak je zapnute" on public.podpora_auto_opravy
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

revoke all on public.podpora_auto_opravy from anon, authenticated, public;
grant all on public.podpora_auto_opravy to service_role;
