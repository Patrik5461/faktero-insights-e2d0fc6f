/*
 * Cenník — individuálne ceny, cenové skupiny a cenové akcie
 * (v POHODE Sklady → Cenové akcie a cenové skupiny odberateľov).
 *
 * Doteraz mal produkt jedinú cenu a zľava sa prepisovala ručne na každom
 * riadku faktúry. Tu pribúdajú tri veci: skupina odberateľov so spoločnou
 * zľavou, dohodnutá cena na konkrétny produkt a časovo ohraničená akcia.
 *
 * Poradie, v akom sa cena vyberá, drží `src/lib/faktero/ceny.ts`. Databáza
 * strážiť poradie nemá — stráži, aby sa cena nedala priviazať k produktu,
 * odberateľovi ani skupine z cudzej firmy.
 */

create table public.price_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  -- Zľava skupiny sa uplatní len na produkty, pre ktoré skupina nemá
  -- dohodnutú konkrétnu cenu.
  discount_percent numeric not null default 0
    check (discount_percent >= 0 and discount_percent <= 100),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, name)
);

create trigger price_groups_set_updated_at
  before update on public.price_groups
  for each row execute function public.set_updated_at();

alter table public.customers
  add column price_group_id uuid references public.price_groups(id) on delete set null,
  add column discount_percent numeric
    check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100));

comment on column public.customers.discount_percent is
  'Individuálna zľava odberateľa v %. Prebíja zľavu cenovej skupiny, nesčítava sa s ňou.';

create index customers_price_group_idx on public.customers (price_group_id)
  where price_group_id is not null;

/*
 * Dohodnutá cena produktu. Patrí buď odberateľovi, alebo cenovej skupine —
 * nikdy obom naraz, inak by nebolo jasné, ktorá platí.
 *
 * `min_quantity` je množstevná cena: platí tá s najvyšším prahom, ktorý
 * objednané množstvo ešte dosiahne.
 */
create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  price_group_id uuid references public.price_groups(id) on delete cascade,
  unit_price numeric not null check (unit_price >= 0),
  min_quantity numeric not null default 0 check (min_quantity >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_prices_jeden_adresat
    check (num_nonnulls(customer_id, price_group_id) = 1)
);

create trigger product_prices_set_updated_at
  before update on public.product_prices
  for each row execute function public.set_updated_at();

-- Dva prahy s rovnakým množstvom pre toho istého adresáta by robili cenu
-- závislou od poradia riadkov.
create unique index product_prices_odberatel_uniq
  on public.product_prices (product_id, customer_id, min_quantity)
  where customer_id is not null;
create unique index product_prices_skupina_uniq
  on public.product_prices (product_id, price_group_id, min_quantity)
  where price_group_id is not null;

create index product_prices_company_product_idx
  on public.product_prices (company_id, product_id);
create index product_prices_customer_idx
  on public.product_prices (customer_id) where customer_id is not null;

/*
 * Cenová akcia. Bez `valid_to` platí donekonečna. `active` slúži na dočasné
 * vypnutie bez mazania histórie.
 */
create table public.price_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  valid_from date not null default current_date,
  valid_to date,
  -- Zľava akcie platnej na celý sortiment. Pri akcii na vybrané produkty sa
  -- použije len tam, kde produkt nemá vlastnú akciovú cenu.
  discount_percent numeric not null default 0
    check (discount_percent >= 0 and discount_percent <= 100),
  -- true = akcia platí na celý sortiment, false = len na produkty v zozname
  applies_to_all boolean not null default false,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint price_actions_obdobie check (valid_to is null or valid_to >= valid_from)
);

create trigger price_actions_set_updated_at
  before update on public.price_actions
  for each row execute function public.set_updated_at();

create index price_actions_company_obdobie_idx
  on public.price_actions (company_id, valid_from, valid_to)
  where deleted_at is null;

create table public.price_action_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  price_action_id uuid not null references public.price_actions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  -- Pevná akciová cena. Prázdna znamená, že platí percentuálna zľava akcie.
  unit_price numeric check (unit_price is null or unit_price >= 0),
  created_at timestamptz not null default now(),
  unique (price_action_id, product_id)
);

create index price_action_products_product_idx
  on public.price_action_products (company_id, product_id);

/*
 * Cudzie kľúče samy o sebe nestrážia firmu — cena vytvorená priamo cez
 * PostgREST môže mať `company_id` vlastnej firmy a `product_id` cudzej.
 * RLS to nezachytí, lebo tá sa pozerá len na `company_id`.
 */
create or replace function public.guard_price_row_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Jedna funkcia stráži dve tabuľky s rôznymi stĺpcami, takže sa stĺpce
  -- čítajú z jsonb. `new.customer_id` priamo by pri vkladaní do
  -- `price_action_products` padlo na „record new has no field" — plpgsql
  -- preloží celú podmienku IF ako jeden SQL dotaz a stĺpec vyhľadá aj vo
  -- vetve, ktorá sa nikdy nevykoná.
  r jsonb := to_jsonb(new);
  firma uuid := (r ->> 'company_id')::uuid;
  cudzie text;
begin
  select 'produkt' into cudzie
  from public.products p
  where p.id = (r ->> 'product_id')::uuid and p.company_id <> firma;

  if cudzie is null and (r ->> 'customer_id') is not null then
    select 'odberateľa' into cudzie
    from public.customers c
    where c.id = (r ->> 'customer_id')::uuid and c.company_id <> firma;
  end if;

  if cudzie is null and (r ->> 'price_group_id') is not null then
    select 'cenovú skupinu' into cudzie
    from public.price_groups g
    where g.id = (r ->> 'price_group_id')::uuid and g.company_id <> firma;
  end if;

  if cudzie is null and (r ->> 'price_action_id') is not null then
    select 'cenovú akciu' into cudzie
    from public.price_actions a
    where a.id = (r ->> 'price_action_id')::uuid and a.company_id <> firma;
  end if;

  if cudzie is not null then
    raise exception 'Do cenníka nemožno priradiť % z inej firmy.', cudzie;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_price_row_company() from public, anon, authenticated;

create trigger product_prices_guard_company
  before insert or update on public.product_prices
  for each row execute function public.guard_price_row_company();

create trigger price_action_products_guard_company
  before insert or update on public.price_action_products
  for each row execute function public.guard_price_row_company();

-- Odberateľ nesmie ukazovať na cenovú skupinu inej firmy.
create or replace function public.guard_customer_price_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price_group_id is not null
     and not exists (
       select 1 from public.price_groups g
       where g.id = new.price_group_id and g.company_id = new.company_id
     ) then
    raise exception 'Cenová skupina patrí inej firme.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_customer_price_group() from public, anon, authenticated;

create trigger customers_guard_price_group
  before insert or update of price_group_id on public.customers
  for each row execute function public.guard_customer_price_group();

alter table public.price_groups enable row level security;
alter table public.product_prices enable row level security;
alter table public.price_actions enable row level security;
alter table public.price_action_products enable row level security;

create policy "Members read price groups" on public.price_groups
  for select to authenticated using (public.is_company_member(company_id, auth.uid()));
create policy "Members write price groups" on public.price_groups
  for all to authenticated
  using (public.is_company_member(company_id, auth.uid()))
  with check (public.is_company_member(company_id, auth.uid()));

create policy "Members read product prices" on public.product_prices
  for select to authenticated using (public.is_company_member(company_id, auth.uid()));
create policy "Members write product prices" on public.product_prices
  for all to authenticated
  using (public.is_company_member(company_id, auth.uid()))
  with check (public.is_company_member(company_id, auth.uid()));

create policy "Members read price actions" on public.price_actions
  for select to authenticated using (public.is_company_member(company_id, auth.uid()));
create policy "Members write price actions" on public.price_actions
  for all to authenticated
  using (public.is_company_member(company_id, auth.uid()))
  with check (public.is_company_member(company_id, auth.uid()));

create policy "Members read price action products" on public.price_action_products
  for select to authenticated using (public.is_company_member(company_id, auth.uid()));
create policy "Members write price action products" on public.price_action_products
  for all to authenticated
  using (public.is_company_member(company_id, auth.uid()))
  with check (public.is_company_member(company_id, auth.uid()));

grant select, insert, update, delete on public.price_groups to authenticated;
grant select, insert, update, delete on public.product_prices to authenticated;
grant select, insert, update, delete on public.price_actions to authenticated;
grant select, insert, update, delete on public.price_action_products to authenticated;
grant all on public.price_groups to service_role;
grant all on public.product_prices to service_role;
grant all on public.price_actions to service_role;
grant all on public.price_action_products to service_role;
