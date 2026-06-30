
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS reverse_charge boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reverse_charge_type text;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_reverse_charge_type_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_reverse_charge_type_check
  CHECK (reverse_charge_type IS NULL OR reverse_charge_type IN ('domestic_69','eu_b2b','export'));
