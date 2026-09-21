-- Kto a kedy doklad odklikol ako spracovaný. Nový doklad je vždy „new"
-- (Nespracovaný) a spracovaným sa stane až po kontrole. ON DELETE SET NULL,
-- aby odkaz nebránil zrušeniu účtu (pozri created_by s NO ACTION).
alter table public.expense_documents
  add column if not exists processed_at timestamptz,
  add column if not exists processed_by uuid references auth.users(id) on delete set null;

create index if not exists expense_documents_company_new_idx
  on public.expense_documents (company_id, created_at desc)
  where status = 'new';
