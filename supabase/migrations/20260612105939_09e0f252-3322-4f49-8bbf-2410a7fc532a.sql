
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.recurring_invoices ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_invoices_company_deleted ON public.invoices(company_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_quotes_company_deleted ON public.quotes(company_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_recurring_company_deleted ON public.recurring_invoices(company_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_customers_company_deleted ON public.customers(company_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_products_company_deleted ON public.products(company_id, deleted_at);
