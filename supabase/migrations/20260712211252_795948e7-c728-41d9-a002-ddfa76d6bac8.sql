CREATE TABLE public.platform_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  billing_payment_id uuid REFERENCES public.billing_payments(id) ON DELETE SET NULL,
  invoice_number text NOT NULL UNIQUE,
  plan_slug text NOT NULL,
  plan_name text NOT NULL,
  issue_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Bratislava')::date,
  taxable_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Bratislava')::date,
  due_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Bratislava')::date,
  currency text NOT NULL DEFAULT 'EUR',
  vat_rate numeric(5,2) NOT NULL DEFAULT 23.00,
  subtotal_cents integer NOT NULL,
  vat_cents integer NOT NULL,
  total_cents integer NOT NULL,
  provider text NOT NULL DEFAULT 'gopay',
  provider_payment_id text,
  buyer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  public_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_invoices TO authenticated;
GRANT ALL ON public.platform_invoices TO service_role;

ALTER TABLE public.platform_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view their platform invoices"
  ON public.platform_invoices FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE POLICY "Platform admins can view all"
  ON public.platform_invoices FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE INDEX idx_platform_invoices_company ON public.platform_invoices(company_id, created_at DESC);
CREATE INDEX idx_platform_invoices_payment ON public.platform_invoices(billing_payment_id);

CREATE TRIGGER trg_platform_invoices_updated
  BEFORE UPDATE ON public.platform_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Sequential numbering: TOB{YYYY}{NNNN}
CREATE SEQUENCE IF NOT EXISTS public.platform_invoice_seq;

CREATE OR REPLACE FUNCTION public.next_platform_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n bigint;
  _y text;
BEGIN
  _n := nextval('public.platform_invoice_seq');
  _y := to_char(now() AT TIME ZONE 'Europe/Bratislava', 'YYYY');
  RETURN 'TOB' || _y || lpad(_n::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_platform_invoice_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_platform_invoice_number() TO service_role;