-- Objednávky u dodávateľov. Doteraz Faktero vedelo povedať „chýba a objednaj
-- toľkoto", ale nie „už je to objednané" — návrh preto opakovane pýtal tovar,
-- ktorý bol na ceste. Toto tú medzeru zatvára a zároveň uzatvára cestu
-- objednávka → príjem → vážená nákupná cena.

create type public.purchase_order_status as enum
  ('draft','sent','partially_received','received','cancelled');

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_number text not null,
  supplier_id uuid references public.customers(id) on delete set null,
  -- Meno sa odpisuje na doklad. Keď sa dodávateľ premenuje alebo zmaže,
  -- objednávka musí ostať čitateľná tak, ako bola vystavená.
  supplier_name text,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  status public.purchase_order_status not null default 'draft',
  order_date date not null default current_date,
  expected_date date,
  currency text not null default 'EUR',
  note text,
  created_by uuid,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, order_number)
);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  stock_item_id uuid references public.stock_items(id) on delete set null,
  name text not null,
  unit text,
  quantity numeric not null check (quantity > 0),
  received_quantity numeric not null default 0 check (received_quantity >= 0),
  unit_price numeric not null default 0 check (unit_price >= 0),
  vat_rate numeric not null default 23,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index purchase_orders_company_status_idx
  on public.purchase_orders (company_id, status);
create index purchase_orders_supplier_idx on public.purchase_orders (supplier_id);
create index purchase_order_items_order_idx on public.purchase_order_items (purchase_order_id);
-- Podľa tohto indexu sa počíta „už objednané" pri návrhu doobjednania.
create index purchase_order_items_stock_item_idx on public.purchase_order_items (stock_item_id);

create trigger purchase_orders_set_updated_at
  before update on public.purchase_orders
  for each row execute function public.set_updated_at();

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

create policy "Members read purchase orders" on public.purchase_orders
  for select to authenticated using (public.is_company_member(company_id, auth.uid()));
create policy "Members create purchase orders" on public.purchase_orders
  for insert to authenticated with check (public.is_company_member(company_id, auth.uid()));
create policy "Members update purchase orders" on public.purchase_orders
  for update to authenticated
  using (public.is_company_member(company_id, auth.uid()))
  with check (public.is_company_member(company_id, auth.uid()));
-- Zmazať sa dá len rozpracovaná objednávka; odoslaná sa ruší stavom,
-- aby po nej ostala stopa.
create policy "Members delete draft purchase orders" on public.purchase_orders
  for delete to authenticated
  using (public.is_company_member(company_id, auth.uid()) and status = 'draft');

create policy "Members read purchase order items" on public.purchase_order_items
  for select to authenticated using (exists (
    select 1 from public.purchase_orders o
    where o.id = purchase_order_items.purchase_order_id
      and public.is_company_member(o.company_id, auth.uid())));
create policy "Members write purchase order items" on public.purchase_order_items
  for all to authenticated
  using (exists (
    select 1 from public.purchase_orders o
    where o.id = purchase_order_items.purchase_order_id
      and public.is_company_member(o.company_id, auth.uid())))
  with check (exists (
    select 1 from public.purchase_orders o
    where o.id = purchase_order_items.purchase_order_id
      and public.is_company_member(o.company_id, auth.uid())));

grant select, insert, update, delete on public.purchase_orders to authenticated;
grant select, insert, update, delete on public.purchase_order_items to authenticated;
grant all on public.purchase_orders to service_role;
grant all on public.purchase_order_items to service_role;
