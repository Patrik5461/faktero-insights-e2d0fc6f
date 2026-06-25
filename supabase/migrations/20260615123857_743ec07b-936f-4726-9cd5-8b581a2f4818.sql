-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_payments_company ON public.payments(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_actions_company ON public.ai_actions(company_id);
CREATE INDEX IF NOT EXISTS idx_company_lookup_logs_company ON public.company_lookup_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_company ON public.import_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_company_created ON public.stock_movements(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_apikey_created ON public.api_logs(api_key_id, created_at DESC);

-- Lock down internal trigger / helper SECURITY DEFINER functions.
-- These are only invoked by triggers or by service_role via supabaseAdmin;
-- regular roles must not be able to call them via PostgREST RPC.
REVOKE EXECUTE ON FUNCTION public.apply_stock_movement(uuid,uuid,uuid,numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_apply_stock_movement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_validate_stock_movement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_stock_movements_immutable() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_lock_invoice_items_stock() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_invoice_stock_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.faktero_enforce_write() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.faktero_enforce_invoice_status_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_trial_subscription() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.default_warehouse_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.faktero_can_write(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.faktero_recurring_cron_status() FROM PUBLIC, anon, authenticated;

-- RLS helper functions stay callable by authenticated (used directly from RPC checks)
-- is_platform_admin, is_company_admin, is_company_member, get_company_role,
-- create_company_with_owner — left untouched (used as RPC from the client).