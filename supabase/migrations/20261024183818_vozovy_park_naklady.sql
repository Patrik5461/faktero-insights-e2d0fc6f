-- Bločky a prijaté faktúry priradené k vozidlu vozového parku.
alter table public.expense_documents add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;
alter table public.purchase_invoices add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;
create index if not exists expense_documents_vehicle_idx on public.expense_documents (vehicle_id) where vehicle_id is not null;
create index if not exists purchase_invoices_vehicle_idx on public.purchase_invoices (vehicle_id) where vehicle_id is not null;
