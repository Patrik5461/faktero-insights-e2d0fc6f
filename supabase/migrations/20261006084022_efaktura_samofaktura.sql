-- Samofaktúra odoslaná cez eFaktúru (Peppol self_billing): doklad eFaktúry
-- sa viaže na prijatú faktúru, nie na vydanú.
alter table public.efaktura_documents
  add column if not exists purchase_invoice_id uuid references public.purchase_invoices(id) on delete set null;
create unique index if not exists efaktura_documents_purchase_invoice_key
  on public.efaktura_documents (purchase_invoice_id);
