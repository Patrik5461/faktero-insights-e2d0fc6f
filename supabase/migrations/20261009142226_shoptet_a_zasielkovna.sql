-- Napojenie na Shoptet (objednávky → faktúry) a Zásielkovňu (zásielka z faktúry).
-- Tokeny a heslá sú zašifrované na serveri; prehliadač k tabuľkám nemá prístup.
create table public.shoptet_napojenia (
  company_id uuid primary key references public.companies(id) on delete cascade,
  token_sifrovany text not null,
  eshop_nazov text,
  eshop_url text,
  posledny_import_at timestamptz,
  posledna_chyba text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table public.zasielkovna_napojenia (
  company_id uuid primary key references public.companies(id) on delete cascade,
  heslo_sifrovane text not null,
  -- Prvých 16 znakov hesla je verejný API kľúč (widget výdajných miest).
  api_kluc text not null,
  odosielatel text,
  posledna_chyba text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.shoptet_napojenia enable row level security;
alter table public.zasielkovna_napojenia enable row level security;
revoke all on public.shoptet_napojenia from public, anon, authenticated;
revoke all on public.zasielkovna_napojenia from public, anon, authenticated;
grant all on public.shoptet_napojenia to service_role;
grant all on public.zasielkovna_napojenia to service_role;

alter table public.invoices
  add column if not exists zasielkovna_id text,
  add column if not exists zasielkovna_cislo text,
  add column if not exists zasielkovna_stav text,
  add column if not exists zasielkovna_stav_at timestamptz;
