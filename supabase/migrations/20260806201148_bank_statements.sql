create table if not exists public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  export_type text not null check (export_type in ('PDF','XML')),
  status text not null default 'pending' check (status in ('pending','ready','failed')),
  task_id text,
  statement_id text,
  storage_path text,
  file_size integer,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bank_account_id, period_start, period_end, export_type)
);

create index if not exists bank_statements_company_idx on public.bank_statements (company_id, period_start desc);
create index if not exists bank_statements_pending_idx on public.bank_statements (status) where status = 'pending';

alter table public.bank_statements enable row level security;

create policy "bank_statements member select" on public.bank_statements
  for select using (is_company_member(company_id, auth.uid()));
create policy "bank_statements admin write" on public.bank_statements
  for insert with check (is_company_admin(company_id, auth.uid()));
create policy "bank_statements admin update" on public.bank_statements
  for update using (is_company_admin(company_id, auth.uid()));
create policy "bank_statements admin delete" on public.bank_statements
  for delete using (is_company_admin(company_id, auth.uid()));

-- Privátny bucket na súbory výpisov. Prístup výhradne cez service role
-- (cron) a cez podpísané URL vydané aplikáciou — žiadne verejné čítanie.
insert into storage.buckets (id, name, public)
values ('bank-statements', 'bank-statements', false)
on conflict (id) do nothing;
