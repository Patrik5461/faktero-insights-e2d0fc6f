
-- 1. Defensive unique index on subscriptions(company_id). Table already has UNIQUE
-- via column constraint; this just makes the invariant explicit and idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_company_id_unique
  ON public.subscriptions(company_id);

-- 2. Trigger function that blocks mutating status transitions on invoices
-- when the company subscription is not in a writable state.
-- Allowed in read-only mode: deleted_at, pdf_url, paid_at backfill from webhooks, etc.
CREATE OR REPLACE FUNCTION public.faktero_enforce_invoice_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('sent','paid','cancelled')
     AND NOT public.faktero_can_write(NEW.company_id, 'invoice_mutate')
  THEN
    RAISE EXCEPTION 'FAKTERO_PLAN_BLOCK:invoice_mutate'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_enforce_invoice_status_update ON public.invoices;
CREATE TRIGGER trg_enforce_invoice_status_update
  BEFORE UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.faktero_enforce_invoice_status_update();
