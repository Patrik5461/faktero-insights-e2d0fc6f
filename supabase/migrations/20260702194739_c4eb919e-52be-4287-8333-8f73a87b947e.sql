-- Revoke EXECUTE from authenticated role on internal SECURITY DEFINER functions.
-- These should only be callable via triggers or by service_role, never directly by end users.
REVOKE EXECUTE ON FUNCTION public.apply_stock_movement(uuid, uuid, uuid, numeric) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.create_trial_subscription() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.faktero_can_write(uuid, text) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.faktero_recurring_cron_status() FROM PUBLIC, authenticated, anon;