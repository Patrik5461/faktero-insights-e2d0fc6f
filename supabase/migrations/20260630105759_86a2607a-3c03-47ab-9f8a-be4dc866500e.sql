
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS constant_symbol text,
  ADD COLUMN IF NOT EXISTS specific_symbol text,
  ADD COLUMN IF NOT EXISTS order_number text,
  ADD COLUMN IF NOT EXISTS delivery_method text,
  ADD COLUMN IF NOT EXISTS rounding_mode text DEFAULT 'per_document',
  ADD COLUMN IF NOT EXISTS advance_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS advance_amount numeric(14,2);
