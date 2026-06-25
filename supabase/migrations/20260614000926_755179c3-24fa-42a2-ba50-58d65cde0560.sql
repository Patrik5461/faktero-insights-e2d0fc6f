CREATE TABLE public.stock_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_audit_logs_company ON public.stock_audit_logs(company_id, created_at DESC);
CREATE INDEX idx_stock_audit_logs_entity ON public.stock_audit_logs(entity_type, entity_id);
GRANT SELECT, INSERT ON public.stock_audit_logs TO authenticated;
GRANT ALL ON public.stock_audit_logs TO service_role;
ALTER TABLE public.stock_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_audit_logs_member_select" ON public.stock_audit_logs
  FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "stock_audit_logs_member_insert" ON public.stock_audit_logs
  FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()));