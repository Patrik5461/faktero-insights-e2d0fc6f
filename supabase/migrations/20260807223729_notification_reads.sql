-- Notifikácie samotné sa nikde neukladajú, počítajú sa z aktuálneho stavu dát.
-- Tu je len to, čo si ktorý používateľ prečítal, aby zvonček nesvietil donekonečna.
create table if not exists public.notification_reads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  -- Stabilný kľúč notifikácie, napr. invoice_overdue:<id>. Generuje ho appka.
  notification_key text not null,
  read_at timestamptz not null default now(),
  constraint notification_reads_unique unique (company_id, user_id, notification_key)
);

create index if not exists notification_reads_lookup_idx
  on public.notification_reads (company_id, user_id);

alter table public.notification_reads enable row level security;

-- Prečítanie je osobná vec: každý vidí a zapisuje len svoje, aj keď firmu zdieľa.
create policy "notification_reads own select" on public.notification_reads
  for select using (user_id = auth.uid() and is_company_member(company_id, auth.uid()));
create policy "notification_reads own insert" on public.notification_reads
  for insert with check (user_id = auth.uid() and is_company_member(company_id, auth.uid()));
create policy "notification_reads own delete" on public.notification_reads
  for delete using (user_id = auth.uid());

grant select, insert, delete on public.notification_reads to authenticated;
grant select, insert, update, delete on public.notification_reads to service_role;
