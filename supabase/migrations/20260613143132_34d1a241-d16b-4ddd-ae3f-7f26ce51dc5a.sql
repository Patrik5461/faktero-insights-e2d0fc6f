
-- 1) Reject zero-quantity movements
CREATE OR REPLACE FUNCTION public.trg_validate_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tracks boolean;
  _current numeric;
  _delta numeric;
  _item_company uuid;
  _wh_company uuid;
BEGIN
  IF NEW.quantity = 0 THEN
    RAISE EXCEPTION 'FAKTERO_STOCK:zero_quantity' USING ERRCODE = 'P0001';
  END IF;

  -- Cross-company safety (defence in depth — RLS should prevent this already)
  SELECT company_id INTO _item_company FROM public.stock_items WHERE id = NEW.stock_item_id;
  SELECT company_id INTO _wh_company FROM public.warehouses WHERE id = NEW.warehouse_id;
  IF _item_company IS DISTINCT FROM NEW.company_id OR _wh_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'FAKTERO_STOCK:cross_company' USING ERRCODE = 'P0001';
  END IF;

  -- Negative-stock guard (only for tracked items)
  SELECT track_stock INTO _tracks FROM public.stock_items WHERE id = NEW.stock_item_id;
  IF COALESCE(_tracks, false) THEN
    _delta := CASE NEW.type
      WHEN 'prijem'    THEN abs(NEW.quantity)
      WHEN 'vydaj'     THEN -abs(NEW.quantity)
      WHEN 'faktura'   THEN -abs(NEW.quantity)
      WHEN 'dobropis'  THEN abs(NEW.quantity)
      ELSE NEW.quantity
    END;
    IF _delta < 0 THEN
      SELECT COALESCE(quantity, 0) INTO _current
      FROM public.stock_levels
      WHERE warehouse_id = NEW.warehouse_id AND stock_item_id = NEW.stock_item_id;
      IF COALESCE(_current, 0) + _delta < 0 THEN
        RAISE EXCEPTION 'FAKTERO_STOCK:negative_stock' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_stock_movements_validate ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_validate
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_stock_movement();

-- 2) Helpful index for audit-trail reverse lookup (no-op if exists)
CREATE INDEX IF NOT EXISTS idx_stock_movements_ref_id ON public.stock_movements(reference_id);
