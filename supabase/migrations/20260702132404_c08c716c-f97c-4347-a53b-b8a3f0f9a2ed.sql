
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS approval_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS approval_status text CHECK (approval_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS approval_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_note text;

CREATE INDEX IF NOT EXISTS invoices_approval_token_idx ON public.invoices(approval_token) WHERE approval_token IS NOT NULL;
