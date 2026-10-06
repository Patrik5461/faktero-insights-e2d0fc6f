-- Rozdeľovač (ako v Doklado): jedna adresa používateľa pre všetky jeho firmy.
create table public.mail_rozdelovace (
  user_id uuid primary key references auth.users(id) on delete cascade,
  local_part text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_received_at timestamptz
);
create unique index mail_rozdelovace_local_part_key on public.mail_rozdelovace (lower(local_part));

-- Doklady z rozdeľovača, ktoré nesedeli na žiadnu firmu používateľa.
create table public.mail_nepriradene (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_email_id text not null,
  from_email text,
  subject text,
  received_at timestamptz not null default now(),
  prilohy jsonb not null default '[]'::jsonb,
  status text not null default 'caka' check (status in ('caka','spracuva','priradene','zahodene','chyba')),
  detail text,
  company_id uuid references public.companies(id) on delete set null
);
create index mail_nepriradene_user on public.mail_nepriradene (user_id, received_at desc);

-- Výber stĺpcov a uložené filtre zoznamov; company_id null = pre všetky firmy.
create table public.nastavenia_zoznamov (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  zoznam text not null,
  stlpce text[],
  filtre jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create unique index nastavenia_zoznamov_kluc on public.nastavenia_zoznamov
  (user_id, zoznam, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.mail_rozdelovace enable row level security;
alter table public.mail_nepriradene enable row level security;
alter table public.nastavenia_zoznamov enable row level security;

create policy "vlastne citanie" on public.mail_rozdelovace for select to authenticated
  using (user_id = (select auth.uid()));
create policy "vlastne citanie" on public.mail_nepriradene for select to authenticated
  using (user_id = (select auth.uid()));
create policy "vlastne" on public.nastavenia_zoznamov for all to authenticated
  using (user_id = (select auth.uid()) and (company_id is null or is_company_member(company_id, (select auth.uid()))))
  with check (user_id = (select auth.uid()) and (company_id is null or is_company_member(company_id, (select auth.uid()))));

create policy "mfa ak je zapnute" on public.mail_rozdelovace as restrictive for all to authenticated
  using ((select mfa_ok())) with check ((select mfa_ok()));
create policy "mfa ak je zapnute" on public.mail_nepriradene as restrictive for all to authenticated
  using ((select mfa_ok())) with check ((select mfa_ok()));
create policy "mfa ak je zapnute" on public.nastavenia_zoznamov as restrictive for all to authenticated
  using ((select mfa_ok())) with check ((select mfa_ok()));

revoke all on public.mail_rozdelovace, public.mail_nepriradene, public.nastavenia_zoznamov from public, anon;
grant select on public.mail_rozdelovace, public.mail_nepriradene to authenticated;
grant select, insert, update, delete on public.nastavenia_zoznamov to authenticated;
grant all on public.mail_rozdelovace, public.mail_nepriradene, public.nastavenia_zoznamov to service_role;
