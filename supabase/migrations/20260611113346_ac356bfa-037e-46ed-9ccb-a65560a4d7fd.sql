
-- quote_email_logs: tracks each email sent for a quote
CREATE TABLE public.quote_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  subject text,
  message text,
  status text NOT NULL DEFAULT 'sent',
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_quote_email_logs_quote ON public.quote_email_logs(quote_id);
CREATE INDEX idx_quote_email_logs_company ON public.quote_email_logs(company_id, created_at DESC);
GRANT SELECT, INSERT ON public.quote_email_logs TO authenticated;
GRANT ALL ON public.quote_email_logs TO service_role;
ALTER TABLE public.quote_email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read quote email logs" ON public.quote_email_logs
  FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "service role manages quote email logs" ON public.quote_email_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- recurring_invoice_logs: activity log for recurring runs
CREATE TABLE public.recurring_invoice_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_invoice_id uuid NOT NULL REFERENCES public.recurring_invoices(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  run_type text NOT NULL DEFAULT 'automatic',
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_recurring_logs_rec ON public.recurring_invoice_logs(recurring_invoice_id, created_at DESC);
CREATE INDEX idx_recurring_logs_company ON public.recurring_invoice_logs(company_id, created_at DESC);
GRANT SELECT ON public.recurring_invoice_logs TO authenticated;
GRANT ALL ON public.recurring_invoice_logs TO service_role;
ALTER TABLE public.recurring_invoice_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read recurring logs" ON public.recurring_invoice_logs
  FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "service role manages recurring logs" ON public.recurring_invoice_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
