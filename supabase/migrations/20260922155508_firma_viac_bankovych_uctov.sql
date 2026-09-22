-- Viac bankových účtov firmy; na faktúre sa vyberie, kam majú prísť peniaze.
-- Faktúra si účet zapamätá (payment_*), takže zmena predvoleného účtu staré
-- faktúry neprepíše. companies.iban/swift ostávajú a držia predvolený účet.
create table public.company_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text,
  iban text not null check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$'),
  swift text,
  bank_name text,
  currency text not null default 'EUR',
  is_default boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index company_bank_accounts_iban_uq on public.company_bank_accounts (company_id, iban);
create unique index company_bank_accounts_default_uq on public.company_bank_accounts (company_id) where is_default;
create trigger company_bank_accounts_updated_at before update on public.company_bank_accounts
  for each row execute function public.set_updated_at();

alter table public.company_bank_accounts enable row level security;
create policy "members read company bank accounts" on public.company_bank_accounts
  for select to authenticated using (public.is_company_member(company_id, (select auth.uid())));
create policy "admins insert company bank accounts" on public.company_bank_accounts
  for insert to authenticated with check (public.is_company_admin(company_id, (select auth.uid())));
create policy "admins update company bank accounts" on public.company_bank_accounts
  for update to authenticated using (public.is_company_admin(company_id, (select auth.uid())))
  with check (public.is_company_admin(company_id, (select auth.uid())));
create policy "admins delete company bank accounts" on public.company_bank_accounts
  for delete to authenticated using (public.is_company_admin(company_id, (select auth.uid())));
create policy "mfa ak je zapnute" on public.company_bank_accounts as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
grant select, insert, update, delete on public.company_bank_accounts to authenticated;
grant all on public.company_bank_accounts to service_role;

create or replace function public.company_bank_accounts_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid := coalesce(new.company_id, old.company_id);
declare d record;
begin
  select iban, swift into d from public.company_bank_accounts where company_id = cid and is_default limit 1;
  if found then
    update public.companies set iban = d.iban, swift = d.swift where id = cid
      and (iban is distinct from d.iban or swift is distinct from d.swift);
  end if;
  return null;
end $$;
revoke all on function public.company_bank_accounts_sync() from public;
create trigger company_bank_accounts_sync after insert or update or delete on public.company_bank_accounts
  for each row execute function public.company_bank_accounts_sync();

insert into public.company_bank_accounts (company_id, name, iban, swift, is_default)
select id, 'Hlavný účet', upper(regexp_replace(iban, '\s', '', 'g')), nullif(trim(swift), ''), true
from public.companies
where iban is not null and upper(regexp_replace(iban, '\s', '', 'g')) ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$'
on conflict do nothing;

alter table public.invoices
  add column if not exists payment_account_id uuid references public.company_bank_accounts(id) on delete set null,
  add column if not exists payment_iban text,
  add column if not exists payment_swift text,
  add column if not exists payment_bank_name text;

create or replace function public.invoices_platobny_ucet()
returns trigger language plpgsql security definer set search_path = public as $$
declare u record;
begin
  if tg_op = 'INSERT' or new.payment_account_id is distinct from old.payment_account_id then
    if new.payment_account_id is not null then
      select * into u from public.company_bank_accounts
        where id = new.payment_account_id and company_id = new.company_id;
      if not found then raise exception 'Bankový účet nepatrí k tejto firme'; end if;
      new.payment_iban := u.iban; new.payment_swift := u.swift; new.payment_bank_name := u.bank_name;
    elsif tg_op = 'INSERT' and new.payment_iban is null then
      select * into u from public.company_bank_accounts
        where company_id = new.company_id and is_default limit 1;
      if found then
        new.payment_account_id := u.id; new.payment_iban := u.iban;
        new.payment_swift := u.swift; new.payment_bank_name := u.bank_name;
      else
        select iban, swift into new.payment_iban, new.payment_swift from public.companies where id = new.company_id;
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.invoices_platobny_ucet() from public;
create trigger invoices_platobny_ucet before insert or update of payment_account_id on public.invoices
  for each row execute function public.invoices_platobny_ucet();

update public.invoices i
set payment_iban = c.iban, payment_swift = c.swift,
    payment_account_id = (select a.id from public.company_bank_accounts a where a.company_id = i.company_id and a.is_default)
from public.companies c
where c.id = i.company_id and i.payment_iban is null and c.iban is not null;
