ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS stock_items_company_archived_idx ON public.stock_items (company_id, archived_at);