create table if not exists public.bank_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  purchase_invoice_id uuid references public.purchase_invoices(id) on delete set null,
  bank_connection_id uuid references public.bank_connections(id) on delete set null,
  debtor_iban text,
  creditor_iban text not null,
  creditor_name text not null,
  amount numeric not null,
  currency text not null default 'EUR',
  remittance_info text,
  end_to_end_id text,
  requested_execution_date date,
  -- Identifikátory od banky. paymentId má podľa TB maxLength 35 a nie je to UUID.
  payment_id text,
  authorization_id text,
  -- transactionStatus z ISO 20022: ACTC → ACSP → ACSC / RJCT / PDNG
  transaction_status text,
  sca_status text,
  -- Vlastný stav, aby sa dalo rozlíšiť "čaká na podpis" od "banka spracováva".
  status text not null default 'draft',
  error_message text,
  -- pkce_code_verifier a state sú jednorazové, po výmene kódu sa nulujú.
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_payments_status_check
    check (status in ('draft','pending_authorization','authorized','submitted','rejected','cancelled','failed'))
);

create index if not exists bank_payments_company_idx on public.bank_payments (company_id, created_at desc);
create index if not exists bank_payments_invoice_idx on public.bank_payments (purchase_invoice_id);

alter table public.bank_payments enable row level security;

create policy "bank_payments member select" on public.bank_payments
  for select using (is_company_member(company_id, auth.uid()));
create policy "bank_payments admin write" on public.bank_payments
  for insert with check (is_company_admin(company_id, auth.uid()));
create policy "bank_payments admin update" on public.bank_payments
  for update using (is_company_admin(company_id, auth.uid()));
create policy "bank_payments admin delete" on public.bank_payments
  for delete using (is_company_admin(company_id, auth.uid()));

grant select, insert, update, delete on public.bank_payments to authenticated;
grant select, insert, update, delete on public.bank_payments to service_role;
