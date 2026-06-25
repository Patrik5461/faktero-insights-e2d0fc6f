
DROP POLICY IF EXISTS "members read own provider" ON public.company_payment_providers;
CREATE POLICY "admins read own provider"
  ON public.company_payment_providers FOR SELECT TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()));

DROP POLICY IF EXISTS "Users read their own lookup logs" ON public.company_lookup_logs;
CREATE POLICY "Users read their own lookup logs"
  ON public.company_lookup_logs FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND (company_id IS NULL OR public.is_company_member(company_id, auth.uid()))
  );
