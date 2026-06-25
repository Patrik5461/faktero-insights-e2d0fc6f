CREATE TABLE public.company_lookup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ico text NOT NULL,
  provider text NOT NULL,
  status text NOT NULL,
  cached boolean NOT NULL DEFAULT false,
  error_message text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.company_lookup_logs TO authenticated;
GRANT ALL ON public.company_lookup_logs TO service_role;

ALTER TABLE public.company_lookup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert their own lookup logs"
  ON public.company_lookup_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users read their own lookup logs"
  ON public.company_lookup_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX company_lookup_logs_ico_idx ON public.company_lookup_logs (ico, created_at DESC);
CREATE INDEX company_lookup_logs_user_idx ON public.company_lookup_logs (user_id, created_at DESC);