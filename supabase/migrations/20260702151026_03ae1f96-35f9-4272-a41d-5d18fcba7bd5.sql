
-- Add reminder settings to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_days_1 integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS reminder_days_2 integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS reminder_days_3 integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS reminder_subject_1 text,
  ADD COLUMN IF NOT EXISTS reminder_subject_2 text,
  ADD COLUMN IF NOT EXISTS reminder_subject_3 text,
  ADD COLUMN IF NOT EXISTS reminder_message_1 text,
  ADD COLUMN IF NOT EXISTS reminder_message_2 text,
  ADD COLUMN IF NOT EXISTS reminder_message_3 text;

-- Per-invoice toggle
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT true;

-- Reminder log
CREATE TABLE IF NOT EXISTS public.invoice_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reminder_number smallint NOT NULL CHECK (reminder_number BETWEEN 1 AND 3),
  sent_at timestamptz NOT NULL DEFAULT now(),
  email_to text NOT NULL,
  subject text,
  message text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed')),
  error_message text,
  triggered_by text NOT NULL DEFAULT 'auto' CHECK (triggered_by IN ('auto','manual')),
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_reminders_invoice ON public.invoice_reminders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_company ON public.invoice_reminders(company_id);

GRANT SELECT, INSERT ON public.invoice_reminders TO authenticated;
GRANT ALL ON public.invoice_reminders TO service_role;

ALTER TABLE public.invoice_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view reminders"
  ON public.invoice_reminders FOR SELECT
  TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE POLICY "Members can insert reminders"
  ON public.invoice_reminders FOR INSERT
  TO authenticated
  WITH CHECK (public.is_company_member(company_id, auth.uid()));
