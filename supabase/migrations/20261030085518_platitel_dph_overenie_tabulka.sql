-- Pokračovanie 20261030085452_platitel_dph_overenie: tabuľka dôkazov a spúšťač čakania na overenie.
create table if not exists public.dph_overenia (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- Prvé overenie s týmto výsledkom; ďalšie behy s rovnakým výsledkom posúvajú len `naposledy_at`.
  overene_at timestamptz not null default now(),
  naposledy_at timestamptz not null default now(),
  zdroj text not null check (zdroj in ('fs_sk', 'adis_cz')),
  stav text not null check (stav in ('platitel', 'registrovany', 'neregistrovany', 'chyba')),
  schema text,
  ic_dph text,
  platne_od date,
  zrusene_od date,
  -- Ku dňu, ku ktorému bol zoznam zverejnený (FS ho aktualizuje raz denne).
  zoznam_k date,
  -- nova_registracia / zrusenie / zmena_druhu oproti predošlému záznamu.
  zmena text check (zmena in ('nova_registracia', 'zrusenie', 'zmena_druhu')),
  predosla_schema text,
  -- Čo sa na firme doplnilo automaticky (prázdny režim DPH, IČ DPH).
  doplnene jsonb,
  -- Nastavenie firmy v čase overenia, keď s registrom nesedí.
  nesulad jsonb,
  -- Riadky registra, z ktorých výsledok vznikol (dôkaz).
  odpoved jsonb,
  sposob text not null default 'cron' check (sposob in ('cron', 'rucne', 'zmena', 'prevzatie', 'spatne')),
  created_by uuid
);

create index if not exists dph_overenia_firma_idx on public.dph_overenia (company_id, overene_at desc);
create index if not exists companies_dph_overit_idx on public.companies (dph_overit_od)
  where dph_overit_od is not null;

alter table public.dph_overenia enable row level security;

-- Zapisuje len server (servisný kľúč) — výsledok registra nesmie nikto prepísať.
create policy "clenovia citaju overenia dph" on public.dph_overenia for select to authenticated
  using (is_company_member(company_id, (select auth.uid())));
create policy "mfa ak je zapnute" on public.dph_overenia as restrictive for all to authenticated
  using ((select mfa_ok())) with check ((select mfa_ok()));

revoke all on public.dph_overenia from anon, public;
grant select on public.dph_overenia to authenticated;
grant all on public.dph_overenia to service_role;

/*
  Nová firma a zmena identifikátorov ju zaradia na overenie. Kto
  `dph_overit_od` mení výslovne (server po overení), toho spúšťač nechá tak.
*/
create or replace function public.companies_dph_na_overenie()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.dph_overit_od is null then
      new.dph_overit_od := now();
    end if;
    return new;
  end if;
  if (new.ico is distinct from old.ico
      or new.ic_dph is distinct from old.ic_dph
      or new.dic is distinct from old.dic
      or new.country is distinct from old.country)
     and new.dph_overit_od is not distinct from old.dph_overit_od then
    new.dph_overit_od := now();
  end if;
  return new;
end;
$$;

revoke all on function public.companies_dph_na_overenie() from public, anon, authenticated;

drop trigger if exists companies_dph_na_overenie on public.companies;
create trigger companies_dph_na_overenie
  before insert or update on public.companies
  for each row execute function public.companies_dph_na_overenie();
