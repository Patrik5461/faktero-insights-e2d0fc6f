-- Schvaľovanie dokladov (ako v Doklado): cesty s úrovňami, stav dokladu, história.
alter table public.companies
  add column if not exists schvalovanie_zapnute boolean not null default false,
  add column if not exists schvalovanie_od timestamptz,
  add column if not exists schvalovanie_agendy text[] not null default '{doklad,prijata}',
  add column if not exists schvalovanie_auto_pod numeric,
  add column if not exists schvalovanie_odoslanie boolean not null default false;

create table if not exists public.schvalovacie_cesty (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nazov text not null check (btrim(nazov) <> ''),
  -- [[user_id, …], [user_id, …]] — úrovne od najnižšej po najvyššiu
  urovne jsonb not null default '[]'::jsonb,
  -- {"agenda":"prijata","ico":"123","suma_od":1000,"predkontacia":"1Fp"}
  podmienky jsonb not null default '{}'::jsonb,
  predvolena boolean not null default false,
  poradie int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists schvalovacie_cesty_firma on public.schvalovacie_cesty (company_id, poradie);

create table if not exists public.schvalovanie (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agenda text not null check (agenda in ('doklad', 'prijata', 'vystavena')),
  doklad_id uuid not null,
  cesta_id uuid references public.schvalovacie_cesty(id) on delete set null,
  urovne jsonb not null default '[]'::jsonb,
  schvalena_uroven int not null default 0,
  stav text not null default 'caka' check (stav in ('caka', 'schvaleny', 'zamietnuty', 'vrateny')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agenda, doklad_id)
);
create index if not exists schvalovanie_firma_stav on public.schvalovanie (company_id, agenda, stav);
create index if not exists schvalovanie_cesta on public.schvalovanie (cesta_id) where cesta_id is not null;

create table if not exists public.schvalovanie_historia (
  id uuid primary key default gen_random_uuid(),
  schvalovanie_id uuid not null references public.schvalovanie(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  akcia text not null check (akcia in ('schvalil', 'zamietol', 'vratil', 'zrusil', 'pridelil', 'automaticky')),
  uroven int,
  poznamka text,
  created_at timestamptz not null default now()
);
create index if not exists schvalovanie_historia_sch on public.schvalovanie_historia (schvalovanie_id, created_at);
create index if not exists schvalovanie_historia_firma on public.schvalovanie_historia (company_id);
create index if not exists schvalovanie_historia_user on public.schvalovanie_historia (user_id) where user_id is not null;

-- Čítať smú členovia firmy; zapisuje len server po overení oprávnenia.
do $$
declare t text;
begin
  foreach t in array array['schvalovacie_cesty', 'schvalovanie', 'schvalovanie_historia'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "clenovia citaju" on public.%I for select to authenticated using (public.is_company_member(company_id, (select auth.uid())))', t);
    execute format('create policy "mfa ak je zapnute" on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))', t);
    perform public.vlastny_pristup_politiky_na(t, 'company_id', 'doklady');
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
