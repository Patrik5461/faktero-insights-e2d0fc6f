-- Indexy na cudzie kľúče.
--
-- Postgres index na FK stĺpci nevytvára automaticky (na rozdiel od PK/UNIQUE).
-- Bez neho:
--   1. každé DELETE rodičovského riadku prehľadá celú detskú tabuľku (kontrola
--      FK / ON DELETE CASCADE),
--   2. joiny a filtre cez daný stĺpec idú seq scanom.
--
-- Zahrnuté sú len stĺpce s REFERENCES, ktoré ešte nemajú index s týmto
-- stĺpcom ako vedúcim. Polymorfné stĺpce (stock_audit_logs.entity_id,
-- stock_reservations.source_document_id) zámerne vynechané — nie sú to FK.
--
-- Pozn.: CREATE INDEX (bez CONCURRENTLY) drží ShareLock na tabuľke počas
-- vytvárania. Pri dnešných objemoch je to otázka sekúnd. Ak niektorá tabuľka
-- medzitým narástla do miliónov riadkov, spusti pre ňu CREATE INDEX
-- CONCURRENTLY ručne mimo migrácie (v transakcii sa použiť nedá).

-- ── Multi-tenant a používatelia ────────────────────────────────────────────
-- company_users.user_id: UNIQUE (company_id, user_id) pokrýva len company_id
-- ako vedúci stĺpec. Dotaz "do ktorých firiem patrí tento používateľ" a
-- ON DELETE CASCADE z auth.users idú bez tohto indexu seq scanom.
CREATE INDEX IF NOT EXISTS idx_company_users_user ON public.company_users (user_id);
CREATE INDEX IF NOT EXISTS idx_companies_created_by ON public.companies (created_by);
CREATE INDEX IF NOT EXISTS idx_company_invitations_accepted_user ON public.company_invitations (accepted_user_id);

-- ── Fakturácia ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices (created_by);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON public.invoice_items (product_id);
CREATE INDEX IF NOT EXISTS idx_quotes_created_by ON public.quotes (created_by);
CREATE INDEX IF NOT EXISTS idx_quotes_converted_invoice ON public.quotes (converted_invoice_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_product ON public.quote_items (product_id);
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_created_by ON public.recurring_invoices (created_by);
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_customer ON public.recurring_invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_last_invoice ON public.recurring_invoices (last_invoice_id);
CREATE INDEX IF NOT EXISTS idx_recurring_invoice_logs_invoice ON public.recurring_invoice_logs (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payment_links_created_by ON public.invoice_payment_links (created_by);

-- ── Sklad ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse ON public.stock_movements (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_by ON public.stock_movements (created_by);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_warehouse ON public.stock_reservations (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_warehouse_from ON public.stock_transfers (warehouse_from_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_warehouse_to ON public.stock_transfers (warehouse_to_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_created_by ON public.stock_transfers (created_by);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_source ON public.stock_transfer_items (source_stock_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_target ON public.stock_transfer_items (target_stock_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_warehouse ON public.inventory_counts (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_created_by ON public.inventory_counts (created_by);
CREATE INDEX IF NOT EXISTS idx_stock_audit_logs_user ON public.stock_audit_logs (user_id);

-- ── Kniha jázd a GPS integrácie ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trips_created_by ON public.trips (created_by);
CREATE INDEX IF NOT EXISTS idx_commander_vehicle_links_vehicle ON public.commander_vehicle_links (faktero_vehicle_id);
CREATE INDEX IF NOT EXISTS idx_tesla_connections_user ON public.tesla_connections (user_id);
CREATE INDEX IF NOT EXISTS idx_tesla_sync_logs_company ON public.tesla_sync_logs (company_id);
CREATE INDEX IF NOT EXISTS idx_tesla_vehicle_links_vehicle ON public.tesla_vehicle_links (faktero_vehicle_id);
CREATE INDEX IF NOT EXISTS idx_tesla_vehicle_snapshots_connection ON public.tesla_vehicle_snapshots (tesla_connection_id);
CREATE INDEX IF NOT EXISTS idx_tesla_vehicle_snapshots_vehicle ON public.tesla_vehicle_snapshots (faktero_vehicle_id);

-- ── Banka, doklady, integrácie ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bank_transactions_matched_invoice ON public.bank_transactions (matched_invoice_id);
CREATE INDEX IF NOT EXISTS idx_expense_documents_created_by ON public.expense_documents (created_by);
CREATE INDEX IF NOT EXISTS idx_expense_documents_export_job ON public.expense_documents (export_job_id);
CREATE INDEX IF NOT EXISTS idx_efaktura_received_matched_invoice ON public.efaktura_received_documents (matched_supplier_invoice_id);
CREATE INDEX IF NOT EXISTS idx_export_jobs_created_by ON public.export_jobs (created_by);
CREATE INDEX IF NOT EXISTS idx_export_logs_invoice ON public.export_logs (invoice_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_by ON public.import_jobs (created_by);
CREATE INDEX IF NOT EXISTS idx_google_seo_connections_connected_by ON public.google_seo_connections (connected_by);

-- ── API, webhooky, AI ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_api_keys_created_by ON public.api_keys (created_by);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook ON public.webhook_logs (webhook_id);
CREATE INDEX IF NOT EXISTS idx_billing_payments_subscription ON public.billing_payments (subscription_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON public.ai_conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_actions_user ON public.ai_actions (user_id);
CREATE INDEX IF NOT EXISTS idx_delivery_parse_jobs_user ON public.delivery_parse_jobs (user_id);
