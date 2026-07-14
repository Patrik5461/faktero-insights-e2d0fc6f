
CREATE TABLE public.delivery_parse_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_delivery_parse_jobs_company ON public.delivery_parse_jobs(company_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.delivery_parse_jobs TO authenticated;
GRANT ALL ON public.delivery_parse_jobs TO service_role;

ALTER TABLE public.delivery_parse_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read delivery_parse_jobs"
ON public.delivery_parse_jobs FOR SELECT
TO authenticated
USING (public.is_company_member(company_id, auth.uid()));

CREATE POLICY "members insert delivery_parse_jobs"
ON public.delivery_parse_jobs FOR INSERT
TO authenticated
WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE TRIGGER trg_delivery_parse_jobs_updated_at
BEFORE UPDATE ON public.delivery_parse_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
