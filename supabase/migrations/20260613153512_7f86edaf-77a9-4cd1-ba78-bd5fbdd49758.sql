
-- 1) ai_conversations: tighten DELETE and UPDATE
DROP POLICY IF EXISTS "ai_conv_delete" ON public.ai_conversations;
CREATE POLICY "ai_conv_delete" ON public.ai_conversations
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND is_company_member(company_id, auth.uid()));

DROP POLICY IF EXISTS "ai_conv_update" ON public.ai_conversations;
CREATE POLICY "ai_conv_update" ON public.ai_conversations
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND is_company_member(company_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() AND is_company_member(company_id, auth.uid()));

-- 2) export_jobs: only admins can update
DROP POLICY IF EXISTS "members update export_jobs" ON public.export_jobs;
CREATE POLICY "admins update export_jobs" ON public.export_jobs
  FOR UPDATE TO authenticated
  USING (is_company_admin(company_id, auth.uid()))
  WITH CHECK (is_company_admin(company_id, auth.uid()));

-- 3) Revoke EXECUTE from anon/public on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.apply_stock_movement(uuid, uuid, uuid, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_trial_subscription() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.faktero_can_write(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.faktero_enforce_invoice_status_update() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.faktero_enforce_write() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_apply_stock_movement() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_invoice_stock_sync() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_validate_stock_movement() FROM PUBLIC, anon;
