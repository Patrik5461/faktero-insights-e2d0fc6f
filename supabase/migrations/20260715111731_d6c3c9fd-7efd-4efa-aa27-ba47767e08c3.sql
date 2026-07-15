-- 1. Add reserve_stock toggle to quotes
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS reserve_stock boolean NOT NULL DEFAULT false;

-- 2. stock_reservations table
CREATE TABLE IF NOT EXISTS public.stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  source_document_type text NOT NULL CHECK (source_document_type IN ('quote','order','invoice_deferred','manual')),
  source_document_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','fulfilled','cancelled')),
  expires_at timestamptz,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_reservations TO authenticated;
GRANT ALL ON public.stock_reservations TO service_role;

ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reservations_select_members" ON public.stock_reservations
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "reservations_insert_members" ON public.stock_reservations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "reservations_update_members" ON public.stock_reservations
  FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "reservations_delete_members" ON public.stock_reservations
  FOR DELETE TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE INDEX IF NOT EXISTS ix_stock_reservations_item_status ON public.stock_reservations(stock_item_id, status);
CREATE INDEX IF NOT EXISTS ix_stock_reservations_source ON public.stock_reservations(source_document_type, source_document_id);
CREATE INDEX IF NOT EXISTS ix_stock_reservations_company ON public.stock_reservations(company_id);

-- Prevent duplicate active reservation for same (doc_type, doc_id, stock_item)
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_reservations_active_doc_item
  ON public.stock_reservations(source_document_type, source_document_id, stock_item_id)
  WHERE status = 'active' AND source_document_id IS NOT NULL;

CREATE TRIGGER stock_reservations_set_updated_at
  BEFORE UPDATE ON public.stock_reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. View: stock items with aggregated reservation info
CREATE OR REPLACE VIEW public.stock_items_with_availability AS
SELECT
  si.*,
  COALESCE(lvl.on_hand, 0)::numeric AS on_hand_qty,
  COALESCE(res.reserved, 0)::numeric AS reserved_qty,
  (COALESCE(lvl.on_hand, 0) - COALESCE(res.reserved, 0))::numeric AS available_qty
FROM public.stock_items si
LEFT JOIN (
  SELECT stock_item_id, SUM(quantity) AS on_hand
  FROM public.stock_levels
  GROUP BY stock_item_id
) lvl ON lvl.stock_item_id = si.id
LEFT JOIN (
  SELECT stock_item_id, SUM(quantity) AS reserved
  FROM public.stock_reservations
  WHERE status = 'active'
  GROUP BY stock_item_id
) res ON res.stock_item_id = si.id;

GRANT SELECT ON public.stock_items_with_availability TO authenticated, service_role;

-- 4. Expiry function
CREATE OR REPLACE FUNCTION public.expire_stale_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _count integer;
BEGIN
  WITH upd AS (
    UPDATE public.stock_reservations
       SET status = 'cancelled', updated_at = now()
     WHERE status = 'active'
       AND expires_at IS NOT NULL
       AND expires_at < now()
     RETURNING 1
  ) SELECT COUNT(*) INTO _count FROM upd;
  RETURN COALESCE(_count, 0);
END $$;

-- 5. Cancel reservations on quote cancellation/deletion (fulfill on convert)
CREATE OR REPLACE FUNCTION public.trg_quote_reservations_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.stock_reservations
       SET status = 'cancelled', updated_at = now()
     WHERE source_document_type = 'quote'
       AND source_document_id = OLD.id
       AND status = 'active';
    RETURN OLD;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('cancelled','rejected','expired') THEN
      UPDATE public.stock_reservations
         SET status = 'cancelled', updated_at = now()
       WHERE source_document_type = 'quote'
         AND source_document_id = NEW.id
         AND status = 'active';
    ELSIF NEW.status = 'accepted' AND NEW.converted_at IS NOT NULL THEN
      UPDATE public.stock_reservations
         SET status = 'fulfilled', updated_at = now()
       WHERE source_document_type = 'quote'
         AND source_document_id = NEW.id
         AND status = 'active';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS quote_reservations_sync ON public.quotes;
CREATE TRIGGER quote_reservations_sync
  AFTER UPDATE OR DELETE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.trg_quote_reservations_sync();
