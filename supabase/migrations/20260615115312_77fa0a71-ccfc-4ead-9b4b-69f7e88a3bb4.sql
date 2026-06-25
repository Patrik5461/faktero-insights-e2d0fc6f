-- Blocker 1-3 + hardening for Sklad

-- 1. Schema additions for idempotent invoice movements
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS reference_item_id uuid,
  ADD COLUMN IF NOT EXISTS reversed_movement_id uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_ref_item
  ON public.stock_movements(company_id, reference_type, reference_id, reference_item_id, type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reversed
  ON public.stock_movements(reversed_movement_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_company_created
  ON public.stock_movements(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_count_items_stock_item
  ON public.inventory_count_items(stock_item_id);

-- 2. Warehouse name uniqueness per company
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouses_company_name_unique') THEN
    ALTER TABLE public.warehouses ADD CONSTRAINT warehouses_company_name_unique UNIQUE (company_id, name);
  END IF;
END $$;

-- 3. stock_levels CHECK quantity >= 0 (NOT VALID to avoid breaking edge cases)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_levels_quantity_nonneg') THEN
    ALTER TABLE public.stock_levels ADD CONSTRAINT stock_levels_quantity_nonneg CHECK (quantity >= 0) NOT VALID;
  END IF;
END $$;

-- 4. Validate trigger: block inactive warehouses for manual movements
CREATE OR REPLACE FUNCTION public.trg_validate_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _tracks boolean;
  _current numeric;
  _delta numeric;
  _item_company uuid;
  _wh_company uuid;
  _wh_active boolean;
BEGIN
  IF NEW.quantity = 0 THEN
    RAISE EXCEPTION 'FAKTERO_STOCK:zero_quantity' USING ERRCODE = 'P0001';
  END IF;

  SELECT company_id INTO _item_company FROM public.stock_items WHERE id = NEW.stock_item_id;
  SELECT company_id, active INTO _wh_company, _wh_active FROM public.warehouses WHERE id = NEW.warehouse_id;
  IF _item_company IS DISTINCT FROM NEW.company_id OR _wh_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'FAKTERO_STOCK:cross_company' USING ERRCODE = 'P0001';
  END IF;

  -- Block manual movements on inactive warehouses (allow auto invoice movements)
  IF COALESCE(_wh_active, false) = false AND NEW.type IN ('prijem','vydaj','oprava','inventura') THEN
    RAISE EXCEPTION 'FAKTERO_STOCK:warehouse_inactive' USING ERRCODE = 'P0001';
  END IF;

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
$function$;

-- 5. Idempotent invoice stock sync
CREATE OR REPLACE FUNCTION public.trg_invoice_stock_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _wh uuid;
  _item record;
  _moved_out boolean;
  _moved_back boolean;
  _existing_out uuid;
  _existing_return uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  _wh := public.default_warehouse_id(NEW.company_id);
  IF _wh IS NULL THEN RETURN NEW; END IF;

  _moved_out := NEW.status IN ('sent','paid') AND COALESCE(OLD.status,'') NOT IN ('sent','paid');
  _moved_back := NEW.status IN ('cancelled','draft') AND COALESCE(OLD.status,'') IN ('sent','paid');

  IF NOT (_moved_out OR _moved_back) THEN RETURN NEW; END IF;

  FOR _item IN
    SELECT ii.id AS item_id, ii.stock_item_id, ii.quantity, ii.unit_price
    FROM public.invoice_items ii
    WHERE ii.invoice_id = NEW.id AND ii.stock_item_id IS NOT NULL
  LOOP
    IF _moved_out THEN
      -- Find latest outgoing faktura movement for this invoice item that is NOT reversed
      SELECT m.id INTO _existing_out
      FROM public.stock_movements m
      WHERE m.company_id = NEW.company_id
        AND m.reference_type = 'invoice'
        AND m.reference_id = NEW.id
        AND m.reference_item_id = _item.item_id
        AND m.type = 'faktura'
        AND NOT EXISTS (
          SELECT 1 FROM public.stock_movements r
          WHERE r.reversed_movement_id = m.id AND r.type = 'dobropis'
        )
      ORDER BY m.created_at DESC LIMIT 1;

      IF _existing_out IS NULL THEN
        INSERT INTO public.stock_movements(
          company_id, warehouse_id, stock_item_id, type, quantity, unit_price, total_value,
          reference_type, reference_id, reference_item_id, note)
        VALUES (NEW.company_id, _wh, _item.stock_item_id, 'faktura', _item.quantity, _item.unit_price,
          _item.quantity * _item.unit_price, 'invoice', NEW.id, _item.item_id,
          'Auto: faktúra ' || NEW.invoice_number);
      END IF;
    ELSIF _moved_back THEN
      -- Find latest outgoing faktura movement for this item that has NOT been reversed
      SELECT m.id INTO _existing_out
      FROM public.stock_movements m
      WHERE m.company_id = NEW.company_id
        AND m.reference_type = 'invoice'
        AND m.reference_id = NEW.id
        AND m.reference_item_id = _item.item_id
        AND m.type = 'faktura'
        AND NOT EXISTS (
          SELECT 1 FROM public.stock_movements r
          WHERE r.reversed_movement_id = m.id AND r.type = 'dobropis'
        )
      ORDER BY m.created_at DESC LIMIT 1;

      IF _existing_out IS NOT NULL THEN
        INSERT INTO public.stock_movements(
          company_id, warehouse_id, stock_item_id, type, quantity, unit_price, total_value,
          reference_type, reference_id, reference_item_id, reversed_movement_id, note)
        VALUES (NEW.company_id, _wh, _item.stock_item_id, 'dobropis', _item.quantity, _item.unit_price,
          _item.quantity * _item.unit_price, 'invoice', NEW.id, _item.item_id, _existing_out,
          'Auto: storno faktúry ' || NEW.invoice_number);
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END
$function$;

-- 6. Lock invoice_items edits when parent invoice is sent/paid (stock-affecting rows)
CREATE OR REPLACE FUNCTION public.trg_lock_invoice_items_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _status text;
  _inv_id uuid;
  _has_stock boolean;
BEGIN
  -- Service role bypass for admin repair
  IF current_user = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    _inv_id := OLD.invoice_id;
    _has_stock := OLD.stock_item_id IS NOT NULL;
  ELSE
    _inv_id := NEW.invoice_id;
    _has_stock := NEW.stock_item_id IS NOT NULL OR (TG_OP = 'UPDATE' AND OLD.stock_item_id IS NOT NULL);
  END IF;

  IF NOT _has_stock THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT status INTO _status FROM public.invoices WHERE id = _inv_id;
  IF _status NOT IN ('sent','paid') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'FAKTERO_STOCK:invoice_item_locked' USING ERRCODE = 'P0001';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'FAKTERO_STOCK:invoice_item_locked' USING ERRCODE = 'P0001';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.quantity IS DISTINCT FROM OLD.quantity
       OR NEW.product_id IS DISTINCT FROM OLD.product_id
       OR NEW.stock_item_id IS DISTINCT FROM OLD.stock_item_id THEN
      RAISE EXCEPTION 'FAKTERO_STOCK:invoice_item_locked' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END
$function$;

DROP TRIGGER IF EXISTS trg_invoice_items_lock_stock ON public.invoice_items;
CREATE TRIGGER trg_invoice_items_lock_stock
BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.trg_lock_invoice_items_stock();

-- 7. Immutable stock_movements (except service_role)
CREATE OR REPLACE FUNCTION public.trg_stock_movements_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF current_user = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'FAKTERO_STOCK:movement_immutable' USING ERRCODE = 'P0001';
END
$function$;

DROP TRIGGER IF EXISTS trg_stock_movements_no_update ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_no_update
BEFORE UPDATE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.trg_stock_movements_immutable();

DROP TRIGGER IF EXISTS trg_stock_movements_no_delete ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_no_delete
BEFORE DELETE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.trg_stock_movements_immutable();

-- 8. Ensure the invoice status trigger is wired (in case missing)
DROP TRIGGER IF EXISTS trg_invoices_stock_sync ON public.invoices;
CREATE TRIGGER trg_invoices_stock_sync
AFTER UPDATE OF status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_invoice_stock_sync();