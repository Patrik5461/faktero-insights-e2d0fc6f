
CREATE TABLE public.bank_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'tatrabanka',
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  consent_id text,
  status text NOT NULL DEFAULT 'pending',
  last_synced_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bank_connections_company_idx ON public.bank_connections(company_id);

CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bank_connection_id uuid NOT NULL REFERENCES public.bank_connections(id) ON DELETE CASCADE,
  external_account_id text,
  iban text,
  account_name text,
  currency text NOT NULL DEFAULT 'EUR',
  balance numeric(18,2) NOT NULL DEFAULT 0,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bank_accounts_company_idx ON public.bank_accounts(company_id);
CREATE INDEX bank_accounts_connection_idx ON public.bank_accounts(bank_connection_id);

CREATE TABLE public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  booking_date date NOT NULL,
  amount numeric(18,2) NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  variable_symbol text,
  counterparty text,
  description text,
  transaction_reference text,
  matched_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bank_transactions_company_idx ON public.bank_transactions(company_id);
CREATE INDEX bank_transactions_account_idx ON public.bank_transactions(bank_account_id);
CREATE UNIQUE INDEX bank_transactions_account_ref_uidx
  ON public.bank_transactions(bank_account_id, transaction_reference)
  WHERE transaction_reference IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_connections TO authenticated;
GRANT ALL ON public.bank_connections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;

ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

-- bank_connections: members can view non-token columns via server (frontend never SELECTs tokens directly).
-- RLS for member SELECT but we'll restrict frontend reads to non-token columns at the query level.
CREATE POLICY "bank_connections member select"
  ON public.bank_connections FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "bank_connections admin write"
  ON public.bank_connections FOR INSERT TO authenticated
  WITH CHECK (public.is_company_admin(company_id, auth.uid()));
CREATE POLICY "bank_connections admin update"
  ON public.bank_connections FOR UPDATE TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()))
  WITH CHECK (public.is_company_admin(company_id, auth.uid()));
CREATE POLICY "bank_connections admin delete"
  ON public.bank_connections FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()));

CREATE POLICY "bank_accounts member select"
  ON public.bank_accounts FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "bank_accounts admin write"
  ON public.bank_accounts FOR INSERT TO authenticated
  WITH CHECK (public.is_company_admin(company_id, auth.uid()));
CREATE POLICY "bank_accounts admin update"
  ON public.bank_accounts FOR UPDATE TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()))
  WITH CHECK (public.is_company_admin(company_id, auth.uid()));
CREATE POLICY "bank_accounts admin delete"
  ON public.bank_accounts FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()));

CREATE POLICY "bank_transactions member select"
  ON public.bank_transactions FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "bank_transactions admin write"
  ON public.bank_transactions FOR INSERT TO authenticated
  WITH CHECK (public.is_company_admin(company_id, auth.uid()));
CREATE POLICY "bank_transactions admin update"
  ON public.bank_transactions FOR UPDATE TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()))
  WITH CHECK (public.is_company_admin(company_id, auth.uid()));
CREATE POLICY "bank_transactions admin delete"
  ON public.bank_transactions FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()));

CREATE TRIGGER set_bank_connections_updated_at
  BEFORE UPDATE ON public.bank_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_bank_accounts_updated_at
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
