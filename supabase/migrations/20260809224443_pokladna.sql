/*
 * Pokladňa (v POHODE Financie → Pokladňa).
 *
 * Faktero doteraz vedelo naskenovať bloček, ale nie povedať, koľko je
 * v pokladni. Chýbali dve veci: čím bol doklad zaplatený, a evidencia
 * hotovostných pohybov, ktoré doklad nemajú (vklad, výber, tržba).
 */

-- Čím bol doklad zaplatený. Do stavu pokladne vstupujú len tie hotovostné.
alter table public.expense_documents
  add column payment_method text not null default 'hotovost'
    check (payment_method in ('hotovost','karta','prevod'));

comment on column public.expense_documents.payment_method is
  'hotovost | karta | prevod — do stavu pokladne sa počítajú len hotovostné doklady.';

create type public.cash_entry_type as enum ('prijem','vydaj');

create table public.cash_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entry_number text not null,
  entry_date date not null default current_date,
  type public.cash_entry_type not null,
  -- Suma je vždy kladná; smer určuje `type`. Záporná suma s typom `vydaj` by
  -- znamenala príjem a stav pokladne by sa dal tíško obrátiť.
  amount numeric not null check (amount > 0),
  description text not null,
  category text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, entry_number)
);

create index cash_entries_company_date_idx on public.cash_entries (company_id, entry_date desc);

create trigger cash_entries_set_updated_at
  before update on public.cash_entries
  for each row execute function public.set_updated_at();

-- Pokladničný doklad je daňový záznam ako faktúra, takže platí uzávierka
-- rovnako. Meniť sa smie už len poznámka.
create trigger cash_entries_locked_period
  before insert or update or delete on public.cash_entries
  for each row execute function public.guard_locked_period(
    'entry_date',
    'entry_date','type','amount','description','category','entry_number');

alter table public.cash_entries enable row level security;

create policy "Members read cash entries" on public.cash_entries
  for select to authenticated using (public.is_company_member(company_id, auth.uid()));
create policy "Members create cash entries" on public.cash_entries
  for insert to authenticated with check (public.is_company_member(company_id, auth.uid()));
create policy "Members update cash entries" on public.cash_entries
  for update to authenticated
  using (public.is_company_member(company_id, auth.uid()))
  with check (public.is_company_member(company_id, auth.uid()));
create policy "Members delete cash entries" on public.cash_entries
  for delete to authenticated using (public.is_company_member(company_id, auth.uid()));

grant select, insert, update, delete on public.cash_entries to authenticated;
grant all on public.cash_entries to service_role;
