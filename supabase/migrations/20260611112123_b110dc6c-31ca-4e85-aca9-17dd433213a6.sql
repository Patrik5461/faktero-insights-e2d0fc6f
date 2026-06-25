
-- 1. Add preferred accounting system to companies
DO $$ BEGIN
  CREATE TYPE public.accounting_system AS ENUM ('pohoda','omega','money','alfa_plus','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS preferred_accounting_system public.accounting_system NOT NULL DEFAULT 'pohoda';

-- 2. export_jobs
CREATE TABLE IF NOT EXISTS public.export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  format text NOT NULL,                  -- e.g. 'pohoda_xml'
  target_system public.accounting_system NOT NULL DEFAULT 'pohoda',
  status text NOT NULL DEFAULT 'completed', -- pending|completed|failed
  invoice_count int NOT NULL DEFAULT 0,
  date_from date,
  date_to date,
  file_name text,
  file_content text,                     -- raw XML content (kept inline for v1)
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS export_jobs_company_idx ON public.export_jobs(company_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.export_jobs TO authenticated;
GRANT ALL ON public.export_jobs TO service_role;
ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read export_jobs" ON public.export_jobs
  FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "members insert export_jobs" ON public.export_jobs
  FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "members update export_jobs" ON public.export_jobs
  FOR UPDATE TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "admins delete export_jobs" ON public.export_jobs
  FOR DELETE TO authenticated USING (public.is_company_admin(company_id, auth.uid()));

-- 3. export_logs
CREATE TABLE IF NOT EXISTS public.export_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_job_id uuid NOT NULL REFERENCES public.export_jobs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  invoice_number text,
  status text NOT NULL DEFAULT 'ok',     -- ok|failed
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS export_logs_job_idx ON public.export_logs(export_job_id);
CREATE INDEX IF NOT EXISTS export_logs_company_idx ON public.export_logs(company_id, created_at DESC);

GRANT SELECT, INSERT ON public.export_logs TO authenticated;
GRANT ALL ON public.export_logs TO service_role;
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read export_logs" ON public.export_logs
  FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "members insert export_logs" ON public.export_logs
  FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()));
