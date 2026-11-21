-- Partnerský program pre účtovníkov.
--
-- Účtovník (kancelária) sa prihlási, admin ho schváli a dostane kód na
-- odporúčanie. Firmy sa k nemu priradia dvoma cestami: registráciou cez jeho
-- odkaz (?partner=KOD) alebo tým, že je v nich členom. Z každej zaplatenej
-- platby predplatného priradenej firmy vznikne provízia (predvolene 20 % zo
-- sumy bez DPH). Provízia čaká 30 dní (vrátenie platby), potom je na výplatu.
--
-- Zápisy idú len cez server (servisný kľúč) — RLS pustí partnera čítať
-- vlastné riadky a platform admina všetko.

create table if not exists public.partneri_uctovnici (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  nazov text not null check (length(trim(nazov)) between 2 and 200),
  ico text,
  kontakt_meno text,
  email text not null,
  telefon text,
  web text,
  iban text,
  pocet_klientov text,
  poznamka text,
  kod text unique check (kod ~ '^[A-Z0-9]{4,12}$'),
  provizia_pct numeric(5,2) not null default 20 check (provizia_pct >= 0 and provizia_pct <= 100),
  stav text not null default 'ziadost'
    check (stav in ('ziadost', 'aktivny', 'pozastaveny', 'zamietnuty')),
  poznamka_admin text,
  schvalene_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_firmy (
  company_id uuid primary key references public.companies(id) on delete cascade,
  partner_id uuid not null references public.partneri_uctovnici(id) on delete cascade,
  zdroj text not null check (zdroj in ('odkaz', 'clen', 'admin')),
  created_at timestamptz not null default now()
);
create index if not exists partner_firmy_partner_idx on public.partner_firmy (partner_id);

create table if not exists public.partner_provizie (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partneri_uctovnici(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  billing_payment_id uuid not null unique references public.billing_payments(id) on delete cascade,
  zaklad_cents integer not null,
  provizia_pct numeric(5,2) not null,
  provizia_cents integer not null,
  mena text not null default 'EUR',
  zaplatene_at timestamptz not null,
  stav text not null default 'caka' check (stav in ('caka', 'na_vyplatu', 'vyplatene', 'storno')),
  vyplatene_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists partner_provizie_partner_idx on public.partner_provizie (partner_id, zaplatene_at desc);

grant select on public.partneri_uctovnici, public.partner_firmy, public.partner_provizie to authenticated;
grant all on public.partneri_uctovnici, public.partner_firmy, public.partner_provizie to service_role;
revoke all on public.partneri_uctovnici, public.partner_firmy, public.partner_provizie from anon;

alter table public.partneri_uctovnici enable row level security;
alter table public.partner_firmy enable row level security;
alter table public.partner_provizie enable row level security;

create policy "partner cita svoj zaznam" on public.partneri_uctovnici
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy "partner cita svoje firmy" on public.partner_firmy
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (select 1 from public.partneri_uctovnici p where p.id = partner_id and p.user_id = auth.uid())
  );

create policy "partner cita svoje provizie" on public.partner_provizie
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (select 1 from public.partneri_uctovnici p where p.id = partner_id and p.user_id = auth.uid())
  );

-- Člen firmy, ktorý je aktívny partner, si firmu priradí sám (prvý vyhráva).
create or replace function public.partner_prirad_clenstvo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner uuid;
begin
  select id into v_partner from public.partneri_uctovnici
   where user_id = new.user_id and stav = 'aktivny';
  if v_partner is null then
    return new;
  end if;
  -- Testovacia firma (náhľad) sa neprideľuje.
  if exists (select 1 from public.companies c where c.id = new.company_id and c.testovacia_pre is not null) then
    return new;
  end if;
  insert into public.partner_firmy (company_id, partner_id, zdroj)
  values (new.company_id, v_partner, 'clen')
  on conflict (company_id) do nothing;
  return new;
end;
$$;

drop trigger if exists zzz_partner_prirad_clenstvo on public.company_users;
create trigger zzz_partner_prirad_clenstvo
  after insert on public.company_users
  for each row execute function public.partner_prirad_clenstvo();

-- Zaplatená platba predplatného → provízia partnera firmy.
create or replace function public.partner_provizia_z_platby()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner record;
  v_zaklad integer;
begin
  if new.status is distinct from 'PAID' or coalesce(new.amount_cents, 0) <= 0 then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'PAID' then
    return new;
  end if;
  select p.id, p.provizia_pct into v_partner
    from public.partner_firmy pf
    join public.partneri_uctovnici p on p.id = pf.partner_id
   where pf.company_id = new.company_id and p.stav = 'aktivny';
  if v_partner.id is null then
    return new;
  end if;
  -- Suma bez DPH: pri prenesení daňovej povinnosti je platba už bez dane.
  v_zaklad := case when coalesce(new.prenesenie_dph, false)
                   then new.amount_cents
                   else round(new.amount_cents / 1.23)::integer end;
  insert into public.partner_provizie
    (partner_id, company_id, billing_payment_id, zaklad_cents, provizia_pct, provizia_cents, mena, zaplatene_at)
  values
    (v_partner.id, new.company_id, new.id, v_zaklad, v_partner.provizia_pct,
     round(v_zaklad * v_partner.provizia_pct / 100)::integer,
     coalesce(new.currency, 'EUR'), coalesce(new.paid_at, now()))
  on conflict (billing_payment_id) do nothing;
  return new;
end;
$$;

drop trigger if exists zzz_partner_provizia_z_platby on public.billing_payments;
create trigger zzz_partner_provizia_z_platby
  after insert or update of status on public.billing_payments
  for each row execute function public.partner_provizia_z_platby();

-- Platba vrátená/zrušená po zaplatení → provízia storno (ak ešte nie je vyplatená).
create or replace function public.partner_provizia_storno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'PAID' and new.status in ('REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELED') then
    update public.partner_provizie set stav = 'storno'
     where billing_payment_id = new.id and stav in ('caka', 'na_vyplatu');
  end if;
  return new;
end;
$$;

drop trigger if exists zzz_partner_provizia_storno on public.billing_payments;
create trigger zzz_partner_provizia_storno
  after update of status on public.billing_payments
  for each row execute function public.partner_provizia_storno();

revoke all on function public.partner_prirad_clenstvo() from public, anon, authenticated;
revoke all on function public.partner_provizia_z_platby() from public, anon, authenticated;
revoke all on function public.partner_provizia_storno() from public, anon, authenticated;
