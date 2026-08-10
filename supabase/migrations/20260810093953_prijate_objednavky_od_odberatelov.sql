/*
 * Prijaté objednávky od odberateľov (v POHODE Objednávky → Prijaté objednávky).
 *
 * Dopĺňajú reťaz ponuka → objednávka → faktúra. Ponuka je návrh, objednávka je
 * záväzok, ktorý sa vybavuje postupne — aj viacerými faktúrami.
 *
 * Stav sa nedrží ručne, počíta ho `objednavky-odberatel.ts` z vyfakturovaných
 * množstiev. Preto tu nie je žiadny trigger, ktorý by stav prepisoval; jediné,
 * čo databáza stráži, je príslušnosť k firme a nezápornosť množstiev.
 */

create type public.sales_order_status as enum (
  'draft',
  'confirmed',
  'partially_invoiced',
  'completed',
  'cancelled'
);

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_number text not null,
  status public.sales_order_status not null default 'draft',

  customer_id uuid references public.customers(id) on delete set null,
  -- Odpis odberateľa v čase objednávky. Faktúra ho robí rovnako: premenovanie
  -- odberateľa nesmie spätne prepísať, čo bolo na doklade.
  customer_name text,
  customer_ico text,
  customer_email text,

  order_date date not null default current_date,
  -- Kedy to odberateľ chce. Podľa toho sa objednávka označí ako po termíne.
  requested_date date,
  -- Číslo objednávky u odberateľa — píše sa na faktúru.
  customer_order_number text,

  currency text not null default 'EUR',
  subtotal numeric not null default 0,
  vat_total numeric not null default 0,
  total numeric not null default 0,

  job_id uuid references public.jobs(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  reserve_stock boolean not null default false,
  note text,

  created_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, order_number),
  constraint sales_orders_termin check (requested_date is null or requested_date >= order_date)
);

create index sales_orders_company_status_idx
  on public.sales_orders (company_id, status, order_date desc)
  where deleted_at is null;
create index sales_orders_customer_idx on public.sales_orders (customer_id)
  where customer_id is not null;
create index sales_orders_job_idx on public.sales_orders (job_id) where job_id is not null;

create trigger sales_orders_set_updated_at
  before update on public.sales_orders
  for each row execute function public.set_updated_at();

create table public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  stock_item_id uuid references public.stock_items(id) on delete set null,
  position integer not null default 0,
  name text not null,
  description text,
  quantity numeric not null check (quantity > 0),
  -- Koľko z položky už išlo na faktúru. Nikdy záporné; viac než objednané
  -- povolené je (doobjednanie na tú istú faktúru), stav to neprekročí.
  invoiced_quantity numeric not null default 0 check (invoiced_quantity >= 0),
  unit text not null default 'ks',
  unit_price numeric not null default 0,
  vat_rate numeric not null default 23,
  created_at timestamptz not null default now()
);

create index sales_order_items_order_idx on public.sales_order_items (sales_order_id);

/*
 * Cudzie kľúče nestrážia firmu — objednávka vytvorená priamo cez PostgREST môže
 * mať `company_id` vlastnej firmy a `customer_id` cudzej. RLS to nezachytí,
 * lebo tá sa pozerá len na `company_id`.
 */
create or replace function public.guard_sales_order_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cudzie text;
begin
  if new.customer_id is not null
     and not exists (select 1 from public.customers c
                     where c.id = new.customer_id and c.company_id = new.company_id) then
    cudzie := 'odberateľa';
  elsif new.job_id is not null
     and not exists (select 1 from public.jobs j
                     where j.id = new.job_id and j.company_id = new.company_id) then
    cudzie := 'zákazku';
  elsif new.quote_id is not null
     and not exists (select 1 from public.quotes q
                     where q.id = new.quote_id and q.company_id = new.company_id) then
    cudzie := 'ponuku';
  end if;

  if cudzie is not null then
    raise exception 'Do objednávky nemožno priradiť % z inej firmy.', cudzie;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_sales_order_company() from public, anon, authenticated;

create trigger sales_orders_guard_company
  before insert or update on public.sales_orders
  for each row execute function public.guard_sales_order_company();

/*
 * Položka objednávky sa k firme dostane len cez hlavičku, takže sa produkt aj
 * skladová karta overujú proti firme hlavičky.
 */
create or replace function public.guard_sales_order_item_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  firma uuid;
  cudzie text;
begin
  select company_id into firma from public.sales_orders where id = new.sales_order_id;
  if firma is null then
    raise exception 'Objednávka neexistuje.';
  end if;

  if new.product_id is not null
     and not exists (select 1 from public.products p
                     where p.id = new.product_id and p.company_id = firma) then
    cudzie := 'produkt';
  elsif new.stock_item_id is not null
     and not exists (select 1 from public.stock_items s
                     where s.id = new.stock_item_id and s.company_id = firma) then
    cudzie := 'skladovú kartu';
  end if;

  if cudzie is not null then
    raise exception 'Do objednávky nemožno priradiť % z inej firmy.', cudzie;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_sales_order_item_company() from public, anon, authenticated;

create trigger sales_order_items_guard_company
  before insert or update on public.sales_order_items
  for each row execute function public.guard_sales_order_item_company();

alter table public.sales_orders enable row level security;
alter table public.sales_order_items enable row level security;

create policy "Members read sales orders" on public.sales_orders
  for select to authenticated using (public.is_company_member(company_id, auth.uid()));
create policy "Members write sales orders" on public.sales_orders
  for all to authenticated
  using (public.is_company_member(company_id, auth.uid()))
  with check (public.is_company_member(company_id, auth.uid()));

-- Položka nemá `company_id`; členstvo sa overuje cez hlavičku objednávky.
create policy "Members read sales order items" on public.sales_order_items
  for select to authenticated using (
    exists (select 1 from public.sales_orders o
            where o.id = sales_order_id
              and public.is_company_member(o.company_id, auth.uid()))
  );
create policy "Members write sales order items" on public.sales_order_items
  for all to authenticated
  using (
    exists (select 1 from public.sales_orders o
            where o.id = sales_order_id
              and public.is_company_member(o.company_id, auth.uid()))
  )
  with check (
    exists (select 1 from public.sales_orders o
            where o.id = sales_order_id
              and public.is_company_member(o.company_id, auth.uid()))
  );

grant select, insert, update, delete on public.sales_orders to authenticated;
grant select, insert, update, delete on public.sales_order_items to authenticated;
grant all on public.sales_orders to service_role;
grant all on public.sales_order_items to service_role;

-- Väzba faktúry späť na objednávku, z ktorej vznikla.
alter table public.invoices
  add column sales_order_id uuid references public.sales_orders(id) on delete set null;

create index invoices_sales_order_idx on public.invoices (sales_order_id)
  where sales_order_id is not null;
