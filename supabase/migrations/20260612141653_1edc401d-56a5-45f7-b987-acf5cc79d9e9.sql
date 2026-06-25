
DROP POLICY IF EXISTS "ai_act_update" ON public.ai_actions;
CREATE POLICY "ai_act_update" ON public.ai_actions FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()) AND public.is_company_member(company_id, auth.uid()))
  WITH CHECK ((user_id = auth.uid()) AND public.is_company_member(company_id, auth.uid()));

DROP POLICY IF EXISTS "ai_conv_update" ON public.ai_conversations;
CREATE POLICY "ai_conv_update" ON public.ai_conversations FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "bank_connections admin select" ON public.bank_connections;
CREATE POLICY "bank_connections admin select" ON public.bank_connections FOR SELECT TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()));

DROP POLICY IF EXISTS "members read export_jobs" ON public.export_jobs;
CREATE POLICY "admins read export_jobs" ON public.export_jobs FOR SELECT TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()));
