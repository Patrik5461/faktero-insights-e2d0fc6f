-- Import jobs
CREATE TABLE public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source text not null default 'superfaktura',
  status text not null default 'uploaded',
  file_path text,
  file_name text,
  total_rows integer not null default 0,
  imported_customers integer not null default 0,
  imported_invoices integer not null default 0,
  failed_rows integer not null default 0,
  options jsonb not null default '{}'::jsonb,
  preview jsonb,
  mapping jsonb,
  error_message text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
CREATE INDEX idx_import_jobs_company ON public.import_jobs(company_id, created_at desc);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read company import jobs" ON public.import_jobs FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "Members write company import jobs" ON public.import_jobs FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "Members update company import jobs" ON public.import_jobs FOR UPDATE TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "Admins delete company import jobs" ON public.import_jobs FOR DELETE TO authenticated USING (public.is_company_admin(company_id, auth.uid()));

-- Import logs
CREATE TABLE public.import_logs (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  row_number integer,
  entity_type text not null,
  status text not null,
  message text,
  raw_data jsonb,
  created_at timestamptz not null default now()
);
CREATE INDEX idx_import_logs_job ON public.import_logs(import_job_id, row_number);
GRANT SELECT, INSERT ON public.import_logs TO authenticated;
GRANT ALL ON public.import_logs TO service_role;
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read company import logs" ON public.import_logs FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "Members write company import logs" ON public.import_logs FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()));

-- Invoice import provenance
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS import_source text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS imported_at timestamptz;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS original_external_id text;
CREATE INDEX IF NOT EXISTS idx_invoices_original_external_id ON public.invoices(company_id, original_external_id) WHERE original_external_id IS NOT NULL;