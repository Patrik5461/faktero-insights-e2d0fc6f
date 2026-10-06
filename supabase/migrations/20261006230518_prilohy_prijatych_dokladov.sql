-- Prílohy k prijatým faktúram a bločkom (ako v Doklado: presun dokladu medzi prílohy iného).
create table public.prilohy_dokladov (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  purchase_invoice_id uuid references public.purchase_invoices(id) on delete cascade,
  expense_document_id uuid references public.expense_documents(id) on delete cascade,
  path text not null,
  name text not null,
  mime text,
  size bigint,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint prilohy_dokladov_prave_jeden check (num_nonnulls(purchase_invoice_id, expense_document_id) = 1)
);
create index prilohy_dokladov_prijata on public.prilohy_dokladov (purchase_invoice_id);
create index prilohy_dokladov_doklad on public.prilohy_dokladov (expense_document_id);

alter table public.prilohy_dokladov enable row level security;
create policy "clenovia citaju" on public.prilohy_dokladov for select to authenticated
  using (is_company_member(company_id, (select auth.uid())));
create policy "clenovia mazu" on public.prilohy_dokladov for delete to authenticated
  using (is_company_member(company_id, (select auth.uid())));
create policy "clenovia zapisuju" on public.prilohy_dokladov for insert to authenticated
  with check (
    is_company_member(company_id, (select auth.uid()))
    and split_part(path, '/', 1) = company_id::text
    and (
      (purchase_invoice_id is not null and exists (
        select 1 from public.purchase_invoices d where d.id = purchase_invoice_id and d.company_id = prilohy_dokladov.company_id))
      or (expense_document_id is not null and exists (
        select 1 from public.expense_documents d where d.id = expense_document_id and d.company_id = prilohy_dokladov.company_id))
    )
  );
create policy "mfa ak je zapnute" on public.prilohy_dokladov as restrictive for all to authenticated
  using ((select mfa_ok())) with check ((select mfa_ok()));
select public.vlastny_pristup_politiky_na('prilohy_dokladov', 'company_id', 'doklady');

revoke all on public.prilohy_dokladov from public, anon;
grant select, insert, delete on public.prilohy_dokladov to authenticated;
grant all on public.prilohy_dokladov to service_role;
