-- Odosielanie mailov firmy cez jej vlastný SMTP server (ako v Doklado).
-- Heslo je zašifrované (AES-GCM na serveri); prehliadač k tabuľke nemá prístup vôbec,
-- číta a zapisuje ju len server po kontrole, že ide o majiteľa alebo admina firmy.
create table public.firma_smtp (
  company_id uuid primary key references public.companies(id) on delete cascade,
  aktivne boolean not null default false,
  host text not null,
  port integer not null default 587 check (port between 1 and 65535),
  zabezpecenie text not null default 'starttls' check (zabezpecenie in ('ssl', 'starttls', 'ziadne')),
  pouzivatel text,
  heslo_sifrovane text,
  od_email text not null,
  od_meno text,
  overene_at timestamptz,
  posledna_chyba text,
  posledna_chyba_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.firma_smtp enable row level security;
revoke all on public.firma_smtp from public, anon, authenticated;
grant all on public.firma_smtp to service_role;
