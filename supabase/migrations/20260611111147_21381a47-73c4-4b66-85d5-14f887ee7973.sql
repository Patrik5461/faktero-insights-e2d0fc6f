
-- Enums
DO $$ BEGIN
  CREATE TYPE public.quote_status AS ENUM ('draft','sent','accepted','rejected','expired','converted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.recurring_frequency AS ENUM ('weekly','monthly','quarterly','yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================
-- QUOTES
-- =====================================================
CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  status public.quote_status NOT NULL DEFAULT 'draft',
  quote_number text NOT NULL,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date NOT NULL DEFAULT (CURRENT_DATE + 30),
  currency text NOT NULL DEFAULT 'EUR',
  notes text,
  -- customer snapshot
  customer_name text,
  customer_ico text,
  customer_dic text,
  customer_ic_dph text,
  customer_street text,
  customer_city text,
  customer_zip text,
  customer_country text,
  customer_email text,
  -- totals
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  vat_total numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  -- relations / metadata
  converted_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  converted_at timestamptz,
  sent_at timestamptz,
  pdf_url text,
  external_id text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, quote_number)
);

CREATE INDEX idx_quotes_company ON public.quotes(company_id);
CREATE INDEX idx_quotes_customer ON public.quotes(customer_id);
CREATE INDEX idx_quotes_status ON public.quotes(company_id, status);
CREATE UNIQUE INDEX idx_quotes_external ON public.quotes(company_id, external_id) WHERE external_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read quotes" ON public.quotes
  FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "Members insert quotes" ON public.quotes
  FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "Members update quotes" ON public.quotes
  FOR UPDATE TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "Admins delete quotes" ON public.quotes
  FOR DELETE TO authenticated USING (public.is_company_admin(company_id, auth.uid()));

CREATE TRIGGER trg_quotes_updated_at
BEFORE UPDATE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================
-- QUOTE ITEMS
-- =====================================================
CREATE TABLE public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  position int NOT NULL DEFAULT 0,
  name text NOT NULL,
  description text,
  quantity numeric(14,4) NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'ks',
  unit_price numeric(14,4) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 20,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quote_items_quote ON public.quote_items(quote_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_items TO authenticated;
GRANT ALL ON public.quote_items TO service_role;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read quote items" ON public.quote_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.quotes q
            WHERE q.id = quote_items.quote_id
              AND public.is_company_member(q.company_id, auth.uid()))
  );
CREATE POLICY "Members write quote items" ON public.quote_items
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.quotes q
            WHERE q.id = quote_items.quote_id
              AND public.is_company_member(q.company_id, auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.quotes q
            WHERE q.id = quote_items.quote_id
              AND public.is_company_member(q.company_id, auth.uid()))
  );

-- =====================================================
-- RECURRING INVOICES
-- =====================================================
CREATE TABLE public.recurring_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  name text NOT NULL,
  frequency public.recurring_frequency NOT NULL,
  next_run date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  currency text NOT NULL DEFAULT 'EUR',
  payment_method text NOT NULL DEFAULT 'bank_transfer',
  due_days int NOT NULL DEFAULT 14,
  notes text,
  -- customer snapshot (kept for resilience if customer is deleted)
  customer_name text,
  customer_ico text,
  customer_dic text,
  customer_ic_dph text,
  customer_street text,
  customer_city text,
  customer_zip text,
  customer_country text,
  customer_email text,
  -- template items (array of objects)
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  vat_total numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  last_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recurring_company ON public.recurring_invoices(company_id);
CREATE INDEX idx_recurring_due ON public.recurring_invoices(active, next_run);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_invoices TO authenticated;
GRANT ALL ON public.recurring_invoices TO service_role;
ALTER TABLE public.recurring_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read recurring" ON public.recurring_invoices
  FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "Members insert recurring" ON public.recurring_invoices
  FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "Members update recurring" ON public.recurring_invoices
  FOR UPDATE TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "Admins delete recurring" ON public.recurring_invoices
  FOR DELETE TO authenticated USING (public.is_company_admin(company_id, auth.uid()));

CREATE TRIGGER trg_recurring_updated_at
BEFORE UPDATE ON public.recurring_invoices
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
