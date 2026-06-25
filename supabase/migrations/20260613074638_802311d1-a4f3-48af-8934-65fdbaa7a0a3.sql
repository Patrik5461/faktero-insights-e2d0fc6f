
-- 1. New flag for admin "suspend billing" action
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_suspended boolean NOT NULL DEFAULT false;

-- 2. Central capability check
CREATE OR REPLACE FUNCTION public.faktero_can_write(_company_id uuid, _kind text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  p record;
  used integer;
BEGIN
  IF _company_id IS NULL THEN
    RETURN true; -- non-company rows handled elsewhere
  END IF;

  SELECT * INTO s FROM public.subscriptions WHERE company_id = _company_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF COALESCE(s.billing_suspended, false) THEN
    RETURN false;
  END IF;

  IF s.status NOT IN ('trialing','active','past_due') THEN
    RETURN false;
  END IF;

  IF s.status = 'trialing'
     AND s.trial_ends_at IS NOT NULL
     AND s.trial_ends_at < now()
  THEN
    RETURN false;
  END IF;

  SELECT * INTO p FROM public.subscription_plans WHERE id = s.plan_id;

  IF _kind = 'invoice' AND p.invoice_limit IS NOT NULL THEN
    SELECT count(*) INTO used FROM public.invoices
      WHERE company_id = _company_id
        AND created_at >= date_trunc('month', now())
        AND deleted_at IS NULL;
    IF used >= p.invoice_limit THEN RETURN false; END IF;
  END IF;

  IF _kind = 'api_key' AND COALESCE(p.api_enabled, false) = false THEN
    RETURN false;
  END IF;

  IF _kind = 'webhook' AND COALESCE(p.webhooks_enabled, false) = false THEN
    RETURN false;
  END IF;

  IF _kind = 'recurring' AND COALESCE(p.recurring_enabled, false) = false THEN
    RETURN false;
  END IF;

  IF _kind = 'user' AND p.user_limit IS NOT NULL THEN
    SELECT count(*) INTO used FROM public.company_users WHERE company_id = _company_id;
    IF used >= p.user_limit THEN RETURN false; END IF;
  END IF;

  RETURN true;
END
$$;

-- 3. Enforcement trigger function — kind passed via TG_ARGV[0]
CREATE OR REPLACE FUNCTION public.faktero_enforce_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  kind text := TG_ARGV[0];
  cid uuid := NEW.company_id;
BEGIN
  IF NOT public.faktero_can_write(cid, kind) THEN
    RAISE EXCEPTION 'FAKTERO_PLAN_BLOCK:%', kind
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

-- 4. Attach triggers (drop+create for idempotency)
DROP TRIGGER IF EXISTS trg_enforce_invoice_write ON public.invoices;
CREATE TRIGGER trg_enforce_invoice_write
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.faktero_enforce_write('invoice');

DROP TRIGGER IF EXISTS trg_enforce_customer_write ON public.customers;
CREATE TRIGGER trg_enforce_customer_write
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.faktero_enforce_write('customer');

DROP TRIGGER IF EXISTS trg_enforce_quote_write ON public.quotes;
CREATE TRIGGER trg_enforce_quote_write
  BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.faktero_enforce_write('quote');

DROP TRIGGER IF EXISTS trg_enforce_recurring_write ON public.recurring_invoices;
CREATE TRIGGER trg_enforce_recurring_write
  BEFORE INSERT ON public.recurring_invoices
  FOR EACH ROW EXECUTE FUNCTION public.faktero_enforce_write('recurring');

DROP TRIGGER IF EXISTS trg_enforce_api_key_write ON public.api_keys;
CREATE TRIGGER trg_enforce_api_key_write
  BEFORE INSERT ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.faktero_enforce_write('api_key');

DROP TRIGGER IF EXISTS trg_enforce_webhook_write ON public.webhooks;
CREATE TRIGGER trg_enforce_webhook_write
  BEFORE INSERT ON public.webhooks
  FOR EACH ROW EXECUTE FUNCTION public.faktero_enforce_write('webhook');

DROP TRIGGER IF EXISTS trg_enforce_company_user_write ON public.company_users;
CREATE TRIGGER trg_enforce_company_user_write
  BEFORE INSERT ON public.company_users
  FOR EACH ROW EXECUTE FUNCTION public.faktero_enforce_write('user');
