
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS email_sender_name text,
  ADD COLUMN IF NOT EXISTS email_reply_to text,
  ADD COLUMN IF NOT EXISTS email_default_subject text DEFAULT 'Faktúra {invoice_number}',
  ADD COLUMN IF NOT EXISTS email_default_message text DEFAULT 'Dobrý deň,

v prílohe Vám posielame faktúru {invoice_number} so splatnosťou {due_date}.

Ďakujeme za spoluprácu.';

CREATE TABLE IF NOT EXISTS public.invoice_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_email_logs_company ON public.invoice_email_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_email_logs_invoice ON public.invoice_email_logs(invoice_id, created_at DESC);

GRANT SELECT ON public.invoice_email_logs TO authenticated;
GRANT ALL ON public.invoice_email_logs TO service_role;
ALTER TABLE public.invoice_email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read invoice email logs" ON public.invoice_email_logs
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.webhook_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  webhook_id uuid NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb,
  response_status int,
  response_body text,
  attempt_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_company ON public.webhook_delivery_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_webhook ON public.webhook_delivery_logs(webhook_id, created_at DESC);

GRANT SELECT ON public.webhook_delivery_logs TO authenticated;
GRANT ALL ON public.webhook_delivery_logs TO service_role;
ALTER TABLE public.webhook_delivery_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read webhook delivery logs" ON public.webhook_delivery_logs
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
