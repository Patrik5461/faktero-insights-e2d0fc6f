
-- 1. company_payment_providers
CREATE TABLE public.company_payment_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'gopay',
  enabled boolean NOT NULL DEFAULT false,
  sandbox_mode boolean NOT NULL DEFAULT true,
  goid text,
  client_id text,
  encrypted_client_secret text, -- AES-256-GCM ciphertext, base64. Never returned to client.
  webhook_secret text,           -- shared secret embedded in notify_url; safe to display once.
  connected_at timestamptz,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, provider)
);

GRANT SELECT ON public.company_payment_providers TO authenticated;
GRANT ALL ON public.company_payment_providers TO service_role;

ALTER TABLE public.company_payment_providers ENABLE ROW LEVEL SECURITY;

-- Members can read row metadata; the secret column is never sent to the client by server fns.
CREATE POLICY "members read own provider"
  ON public.company_payment_providers FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

-- All writes happen via server functions using service_role; no INSERT/UPDATE/DELETE policies for end users.

CREATE TRIGGER trg_cpp_updated_at
  BEFORE UPDATE ON public.company_payment_providers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. invoice_payment_links
CREATE TABLE public.invoice_payment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  provider text NOT NULL DEFAULT 'gopay',
  provider_payment_id text,
  gw_url text,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'created', -- created | pending | paid | failed | cancelled
  sandbox_mode boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ipl_company ON public.invoice_payment_links (company_id, created_at DESC);
CREATE INDEX idx_ipl_invoice ON public.invoice_payment_links (invoice_id);
CREATE INDEX idx_ipl_provider_payment ON public.invoice_payment_links (provider, provider_payment_id);

GRANT SELECT ON public.invoice_payment_links TO authenticated;
GRANT ALL ON public.invoice_payment_links TO service_role;

ALTER TABLE public.invoice_payment_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read own payment links"
  ON public.invoice_payment_links FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE TRIGGER trg_ipl_updated_at
  BEFORE UPDATE ON public.invoice_payment_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. companies.online_payments_enabled
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS online_payments_enabled boolean NOT NULL DEFAULT false;
