-- Výkon databázy (vlna 31. 10. 2026): zmazané indexy, ktoré sú presnou
-- predponou iného indexu na tej istej tabuľke (napr. (company_id) vedľa
-- (company_id, deleted_at)). Plánovač použije širší index, cudzí kľúč ostáva
-- pokrytý, zápisy sú lacnejšie. Žiadny unikátny ani primárny kľúč sa nemaže.
-- V komentári je index, ktorý ich nahrádza.

drop index if exists public.idx_customers_company;            -- idx_customers_company_deleted
drop index if exists public.idx_products_company;             -- idx_products_company_deleted
drop index if exists public.idx_invoices_company;             -- idx_invoices_company_deleted, idx_invoices_status
drop index if exists public.idx_payments_company;             -- idx_payments_company_date
drop index if exists public.idx_quotes_company;               -- idx_quotes_company_deleted, quotes_company_id_quote_number_key
drop index if exists public.idx_recurring_company;            -- idx_recurring_company_deleted
drop index if exists public.bank_transactions_company_idx;    -- bank_transactions_firma_datum_idx
drop index if exists public.efaktura_profiles_company_idx;    -- efaktura_profiles_company_id_key (unique)
drop index if exists public.efaktura_documents_invoice_idx;   -- efaktura_documents_invoice_id_key (unique)
drop index if exists public.idx_warehouses_company;           -- warehouses_company_name_unique
drop index if exists public.idx_stock_items_company;          -- stock_items_company_archived_idx
drop index if exists public.idx_stock_movements_company;      -- idx_stock_movements_company_created
drop index if exists public.idx_expense_documents_company_date; -- expense_documents_zoznam_idx
drop index if exists public.idx_invoice_reminders_company;    -- idx_invoice_reminders_company_sent
drop index if exists public.idx_email_templates_company;      -- email_templates_company_id_template_type_key
drop index if exists public.idx_company_invitations_token;    -- company_invitations_token_key (unique)
drop index if exists public.notification_reads_lookup_idx;    -- notification_reads_unique
drop index if exists public.financing_installments_zmluva_idx; -- financing_installments_contract_id_number_key
drop index if exists public.invoice_advances_invoice_idx;     -- invoice_advances_invoice_id_advance_invoice_id_key
drop index if exists public.predkontacie_firma_idx;           -- predkontacie_kluc (unique)
drop index if exists public.invoices_approval_token_idx;      -- invoices_approval_token_key (unique, celý stĺpec)
