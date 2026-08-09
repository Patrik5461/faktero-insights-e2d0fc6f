-- Zákazky (job / cost centre) prevzaté z POHODY. Faktero vie, čo sa vyfakturovalo,
-- čo sa vydalo zo skladu a kam sa jazdilo — ale doteraz sa tie tri veci nikde
-- nestretli. Zákazka je ten spoločný menovateľ: pripne sa na doklad a potom sa
-- dá povedať, koľko na nej ostalo.

create type public.job_status as enum ('active','closed','cancelled');

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_number text not null,
  name text not null,
  customer_id uuid references public.customers(id) on delete set null,
  -- Meno odberateľa sa odpisuje rovnako ako na doklad: zákazka musí ostať
  -- čitateľná aj po premenovaní alebo zmazaní odberateľa.
  customer_name text,
  status public.job_status not null default 'active',
  start_date date,
  end_date date,
  -- Plán zákazky; skutočnosť sa proti nemu porovnáva vo vyhodnotení.
  planned_revenue numeric check (planned_revenue is null or planned_revenue >= 0),
  planned_cost numeric check (planned_cost is null or planned_cost >= 0),
  note text,
  created_by uuid,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, job_number)
);

create index jobs_company_status_idx on public.jobs (company_id, status);
create index jobs_customer_idx on public.jobs (customer_id);

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- Zákazka na dokladoch. Partial index preto, že drvivá väčšina dokladov
-- zákazku mať nebude a index nad NULLmi by bol len réžia.
alter table public.invoices          add column job_id uuid references public.jobs(id) on delete set null;
alter table public.purchase_invoices add column job_id uuid references public.jobs(id) on delete set null;
alter table public.stock_movements   add column job_id uuid references public.jobs(id) on delete set null;
alter table public.trips             add column job_id uuid references public.jobs(id) on delete set null;
alter table public.purchase_orders   add column job_id uuid references public.jobs(id) on delete set null;
alter table public.quotes            add column job_id uuid references public.jobs(id) on delete set null;

create index invoices_job_idx          on public.invoices (job_id)          where job_id is not null;
create index purchase_invoices_job_idx on public.purchase_invoices (job_id) where job_id is not null;
create index stock_movements_job_idx   on public.stock_movements (job_id)   where job_id is not null;
create index trips_job_idx             on public.trips (job_id)             where job_id is not null;
create index purchase_orders_job_idx   on public.purchase_orders (job_id)   where job_id is not null;
create index quotes_job_idx            on public.quotes (job_id)            where job_id is not null;

-- Predvolená zákazka odberateľa: v POHODE sa doplní do nového dokladu sama,
-- aby ju nikto nemusel vyberať pri každej faktúre.
alter table public.customers
  add column default_job_id uuid references public.jobs(id) on delete set null;

/*
 * Strážca priradenia. Dve veci naraz:
 *  1. zákazka musí patriť tej istej firme ako doklad — inak by sa dali náklady
 *     preliať medzi firmami a vyhodnotenie by ukazovalo cudzie čísla;
 *  2. na uzatvorenú zákazku sa už doklad pripnúť nedá (POHODA pole zamkne),
 *     lebo inak by sa vyhodnotenie hotovej stavby menilo aj po jej uzavretí.
 *
 * Nemenené priradenie prechádza vždy, nech sa dá uzatvorená zákazka na starom
 * doklade upraviť v iných poliach.
 */
create or replace function public.jobs_guard_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare j record;
begin
  if new.job_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.job_id is not distinct from new.job_id then
    return new;
  end if;

  select company_id, status into j from public.jobs where id = new.job_id;
  if not found then
    raise exception 'Zákazka neexistuje.';
  end if;
  if j.company_id <> new.company_id then
    raise exception 'Zákazka patrí inej firme.';
  end if;
  if j.status <> 'active' then
    raise exception 'Zákazka nie je otvorená, doklad sa k nej priradiť nedá.';
  end if;
  return new;
end $$;

create trigger jobs_guard_invoice_job
  before insert or update of job_id on public.invoices
  for each row execute function public.jobs_guard_assignment();
create trigger jobs_guard_purchase_invoice_job
  before insert or update of job_id on public.purchase_invoices
  for each row execute function public.jobs_guard_assignment();
create trigger jobs_guard_stock_movement_job
  before insert on public.stock_movements
  for each row execute function public.jobs_guard_assignment();
create trigger jobs_guard_trip_job
  before insert or update of job_id on public.trips
  for each row execute function public.jobs_guard_assignment();
create trigger jobs_guard_purchase_order_job
  before insert or update of job_id on public.purchase_orders
  for each row execute function public.jobs_guard_assignment();
create trigger jobs_guard_quote_job
  before insert or update of job_id on public.quotes
  for each row execute function public.jobs_guard_assignment();

/*
 * Zákazku s dokladmi nemožno zmazať. Cudzí kľúč je `on delete set null`, takže
 * bez tejto zábrany by zmazanie ticho odpojilo doklady a história zákazky by
 * zmizla bez stopy. Prázdna zákazka sa zmazať dá, uzavretá sa uzatvára stavom.
 */
create or replace function public.jobs_block_delete_with_documents()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (select 1 from public.invoices          where job_id = old.id)
  or exists (select 1 from public.purchase_invoices where job_id = old.id)
  or exists (select 1 from public.stock_movements   where job_id = old.id)
  or exists (select 1 from public.trips             where job_id = old.id)
  or exists (select 1 from public.purchase_orders   where job_id = old.id)
  or exists (select 1 from public.quotes            where job_id = old.id) then
    raise exception 'Zákazka má naviazané doklady, zmazať sa nedá. Uzavrite ju.';
  end if;
  return old;
end $$;

create trigger jobs_block_delete
  before delete on public.jobs
  for each row execute function public.jobs_block_delete_with_documents();

alter table public.jobs enable row level security;

create policy "Members read jobs" on public.jobs
  for select to authenticated using (public.is_company_member(company_id, auth.uid()));
create policy "Members create jobs" on public.jobs
  for insert to authenticated with check (public.is_company_member(company_id, auth.uid()));
create policy "Members update jobs" on public.jobs
  for update to authenticated
  using (public.is_company_member(company_id, auth.uid()))
  with check (public.is_company_member(company_id, auth.uid()));
create policy "Members delete jobs" on public.jobs
  for delete to authenticated using (public.is_company_member(company_id, auth.uid()));

grant select, insert, update, delete on public.jobs to authenticated;
grant all on public.jobs to service_role;
