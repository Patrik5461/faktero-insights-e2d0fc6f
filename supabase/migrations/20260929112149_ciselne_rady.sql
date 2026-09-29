-- Číselné rady dokladov.
--
-- Doteraz mala firma jedinú šablónu čísla faktúry a ostatné doklady pevnú
-- predponu v kóde (Q…, OBJ…, PD…). Kto potreboval druhý rad — pobočka, druhá
-- prevádzka, oddelené rady za rok — nemal ako. Rad je preto vlastný záznam:
-- druh dokladu, šablóna a príznak predvoleného. Doklad si pamätá, z ktorého
-- radu číslo dostal, aby sa rad dal zmeniť bez toho, že by sa staré doklady
-- prečíslovali.

create table if not exists public.number_series (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null,
  name text not null,
  format text not null,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint number_series_kind_check check (
    kind in (
      'invoice', 'proforma', 'credit_note', 'advance_payment',
      'quote', 'sales_order', 'purchase_order', 'cash'
    )
  ),
  constraint number_series_format_check check (btrim(format) <> '' and format ~ '\{N{2,6}\}'),
  constraint number_series_name_check check (btrim(name) <> '')
);

create unique index if not exists number_series_meno_idx
  on public.number_series (company_id, kind, lower(btrim(name)));
create unique index if not exists number_series_predvoleny_idx
  on public.number_series (company_id, kind)
  where is_default;
create index if not exists number_series_firma_idx
  on public.number_series (company_id, kind, active);

alter table public.number_series enable row level security;

drop policy if exists "Members read number series" on public.number_series;
create policy "Members read number series" on public.number_series
  for select using (public.is_company_member(company_id, (select auth.uid())));
drop policy if exists "Members write number series – vklad" on public.number_series;
create policy "Members write number series – vklad" on public.number_series
  for insert with check (public.is_company_member(company_id, (select auth.uid())));
drop policy if exists "Members write number series – úprava" on public.number_series;
create policy "Members write number series – úprava" on public.number_series
  for update using (public.is_company_member(company_id, (select auth.uid())))
  with check (public.is_company_member(company_id, (select auth.uid())));
drop policy if exists "Members write number series – mazanie" on public.number_series;
create policy "Members write number series – mazanie" on public.number_series
  for delete using (public.is_company_member(company_id, (select auth.uid())));

drop policy if exists "mfa ak je zapnute" on public.number_series;
create policy "mfa ak je zapnute" on public.number_series
  as restrictive for all using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

drop policy if exists "oblast citanie" on public.number_series;
create policy "oblast citanie" on public.number_series
  as restrictive for select
  using (company_id = any ((select public.firmy_s_pravom('faktury', false))::uuid[]));
drop policy if exists "oblast zapis" on public.number_series;
create policy "oblast zapis" on public.number_series
  as restrictive for insert
  with check (company_id = any ((select public.firmy_s_pravom('faktury', true))::uuid[]));
drop policy if exists "oblast uprava" on public.number_series;
create policy "oblast uprava" on public.number_series
  as restrictive for update
  using (company_id = any ((select public.firmy_s_pravom('faktury', true))::uuid[]))
  with check (company_id = any ((select public.firmy_s_pravom('faktury', true))::uuid[]));
drop policy if exists "oblast mazanie" on public.number_series;
create policy "oblast mazanie" on public.number_series
  as restrictive for delete
  using (company_id = any ((select public.firmy_s_pravom('faktury', true))::uuid[]));

revoke all on public.number_series from public;
grant select, insert, update, delete on public.number_series to authenticated;
grant all on public.number_series to service_role;

alter table public.invoices add column if not exists number_series_id uuid references public.number_series (id) on delete set null;
alter table public.quotes add column if not exists number_series_id uuid references public.number_series (id) on delete set null;
alter table public.sales_orders add column if not exists number_series_id uuid references public.number_series (id) on delete set null;
alter table public.purchase_orders add column if not exists number_series_id uuid references public.number_series (id) on delete set null;
alter table public.cash_entries add column if not exists number_series_id uuid references public.number_series (id) on delete set null;

comment on table public.number_series is 'Číselné rady dokladov: druh, šablóna a predvolený rad na firmu';
comment on column public.number_series.format is 'Šablóna čísla, napr. ZF{YYYY}{NNNN}; {MM} v nej znamená mesačný reset poradia';
