-- Indexy pre zoznamy a párovanie (vytvorené ručne cez execute_sql, CONCURRENTLY,
-- preto nie sú v supabase_migrations.schema_migrations).
create index concurrently if not exists bank_transactions_firma_datum_idx on public.bank_transactions (company_id, booking_date desc, id desc);
create index concurrently if not exists bank_transactions_nesparovane_prijmy_idx on public.bank_transactions (company_id, booking_date desc) where matched_invoice_id is null and vybavenie is null and amount > 0;
create index concurrently if not exists expense_documents_zoznam_idx on public.expense_documents (company_id, issue_date desc nulls last, created_at desc, id);
create index concurrently if not exists invoices_zoznam_idx on public.invoices (company_id, issue_date desc nulls last, created_at desc, id) where deleted_at is null;
create index concurrently if not exists purchase_invoices_zoznam_idx on public.purchase_invoices (company_id, type, issue_date desc, id) where deleted_at is null;
create index concurrently if not exists trips_doplnenie_idx on public.trips (external_source, created_at desc) where start_location is null or end_location is null or driver_name is null;
