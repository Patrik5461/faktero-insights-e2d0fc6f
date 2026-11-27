-- Plánované odstávky elektronických služieb inštitúcií (Finančná správa, slovensko.sk,
-- Sociálna poisťovňa, zdravotné poisťovne) — Patrik 26. 11. 2026 (FAK-523).
-- Automaticky sa sťahujú z RSS/HTML, admin ich schvaľuje alebo zadáva ručne;
-- používatelia vidia len schválené.
create table public.odstavky_institucii (
  id uuid primary key default gen_random_uuid(),
  zdroj text not null check (zdroj in ('fs','upvs','sp','vszp','dovera','union','rucne')),
  -- Identifikátor oznamu v zdroji (guid RSS, riadok tabuľky) — ten istý sa nezaloží dvakrát.
  guid text,
  institucia text not null,
  sluzba text,
  nazov text not null,
  popis text,
  url text,
  zaciatok timestamptz,
  koniec timestamptz,
  stav text not null default 'navrh' check (stav in ('navrh','schvalene','zamietnute')),
  automaticky boolean not null default false,
  schvalil uuid references auth.users(id) on delete set null,
  schvalene_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (koniec is null or zaciatok is null or koniec >= zaciatok)
);
create unique index odstavky_institucii_zdroj_guid_uq on public.odstavky_institucii (zdroj, guid) where guid is not null;
create index odstavky_institucii_koniec_idx on public.odstavky_institucii (koniec) where stav = 'schvalene';

alter table public.odstavky_institucii enable row level security;
revoke all on public.odstavky_institucii from public, anon;
grant select on public.odstavky_institucii to authenticated;
grant all on public.odstavky_institucii to service_role;

-- Prihlásený vidí len schválené (verejné informácie inštitúcií), admin platformy všetko.
create policy "odstavky citaju prihlaseni" on public.odstavky_institucii
  for select to authenticated
  using (stav = 'schvalene' or public.is_platform_admin((select auth.uid())));
