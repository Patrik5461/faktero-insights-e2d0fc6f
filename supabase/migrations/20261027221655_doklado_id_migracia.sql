-- Idempotencia migrácie z Doklada: id dokladu v Doklade pri každom prenesenom zázname.
-- Schválené 2026-10-27 (Patrik), aplikované cez MCP.
alter table public.invoices add column if not exists doklado_id text;
alter table public.purchase_invoices add column if not exists doklado_id text;
alter table public.expense_documents add column if not exists doklado_id text;

create unique index if not exists invoices_doklado_id_uniq
  on public.invoices (company_id, doklado_id) where doklado_id is not null;
create unique index if not exists purchase_invoices_doklado_id_uniq
  on public.purchase_invoices (company_id, doklado_id) where doklado_id is not null;
create unique index if not exists expense_documents_doklado_id_uniq
  on public.expense_documents (company_id, doklado_id) where doklado_id is not null;
