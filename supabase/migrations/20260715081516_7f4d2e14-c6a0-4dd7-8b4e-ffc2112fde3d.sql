
-- 1. stock_items: avg + last purchase price
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS avg_purchase_price numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_purchase_price numeric(12,4);

-- 2. stock_movements: costing + source doc
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS unit_cost numeric(12,4),
  ADD COLUMN IF NOT EXISTS source_document_type text,
  ADD COLUMN IF NOT EXISTS source_document_id uuid,
  ADD COLUMN IF NOT EXISTS side_costs_total numeric(12,2);

CREATE INDEX IF NOT EXISTS stock_movements_source_doc_idx
  ON public.stock_movements (source_document_type, source_document_id);

-- 3. invoices: deferred stock issue
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS deferred_stock_issue boolean NOT NULL DEFAULT false;

-- 4. BEFORE INSERT: snapshot avg cost onto issues + default unit_cost on receipts
CREATE OR REPLACE FUNCTION public.trg_stock_movement_cost_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _avg numeric;
BEGIN
  IF NEW.type IN ('vydaj','faktura') AND NEW.unit_cost IS NULL THEN
    SELECT avg_purchase_price INTO _avg FROM public.stock_items WHERE id = NEW.stock_item_id;
    NEW.unit_cost := COALESCE(_avg, 0);
  ELSIF NEW.type = 'prijem' AND NEW.unit_cost IS NULL THEN
    NEW.unit_cost := NEW.unit_price;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS stock_movement_cost_snapshot ON public.stock_movements;
CREATE TRIGGER stock_movement_cost_snapshot
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.trg_stock_movement_cost_snapshot();

-- 5. AFTER INSERT: recompute weighted average on receipts (Pohoda rule)
CREATE OR REPLACE FUNCTION public.trg_stock_movement_recalc_avg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _post_qty numeric;
  _pre_qty numeric;
  _delta numeric;
  _current_avg numeric;
  _cost numeric;
  _new_avg numeric;
BEGIN
  IF NEW.type <> 'prijem' THEN
    RETURN NEW;
  END IF;

  _delta := abs(NEW.quantity);
  _cost := COALESCE(NEW.unit_cost, NEW.unit_price);

  -- total qty across all warehouses AFTER the movement (trg_apply already ran)
  SELECT COALESCE(SUM(quantity),0) INTO _post_qty
  FROM public.stock_levels WHERE stock_item_id = NEW.stock_item_id;
  _pre_qty := _post_qty - _delta;

  SELECT avg_purchase_price INTO _current_avg
  FROM public.stock_items WHERE id = NEW.stock_item_id;

  IF _pre_qty <= 0 THEN
    _new_avg := _cost;
  ELSE
    _new_avg := round(
      ((_pre_qty * COALESCE(_current_avg,0) + _delta * _cost) / (_pre_qty + _delta))::numeric,
      4
    );
  END IF;

  UPDATE public.stock_items
     SET avg_purchase_price = round(_new_avg::numeric, 4),
         last_purchase_price = _cost
   WHERE id = NEW.stock_item_id;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS stock_movement_recalc_avg ON public.stock_movements;
CREATE TRIGGER stock_movement_recalc_avg
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.trg_stock_movement_recalc_avg();

-- 6. Manual recompute (replay all movements chronologically)
CREATE OR REPLACE FUNCTION public.recompute_stock_avg_cost(_stock_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cid uuid;
  m record;
  _qty numeric := 0;
  _avg numeric := 0;
  _last numeric;
  _delta numeric;
  _cost numeric;
BEGIN
  SELECT company_id INTO _cid FROM public.stock_items WHERE id = _stock_item_id;
  IF _cid IS NULL THEN
    RAISE EXCEPTION 'stock_item not found';
  END IF;
  IF _uid IS NOT NULL AND NOT public.is_company_member(_cid, _uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR m IN
    SELECT type, quantity, COALESCE(unit_cost, unit_price) AS cost, created_at, id
    FROM public.stock_movements
    WHERE stock_item_id = _stock_item_id
    ORDER BY created_at ASC, id ASC
  LOOP
    _cost := m.cost;
    IF m.type = 'prijem' THEN
      _delta := abs(m.quantity);
      IF _qty <= 0 THEN
        _avg := _cost;
      ELSE
        _avg := round(((_qty * _avg + _delta * _cost) / (_qty + _delta))::numeric, 4);
      END IF;
      _last := _cost;
      _qty := _qty + _delta;
    ELSIF m.type = 'dobropis' THEN
      _qty := _qty + abs(m.quantity);
    ELSIF m.type IN ('vydaj','faktura') THEN
      _qty := _qty - abs(m.quantity);
    ELSE  -- oprava, inventura: signed quantity
      _qty := _qty + m.quantity;
    END IF;
  END LOOP;

  UPDATE public.stock_items
     SET avg_purchase_price = round(COALESCE(_avg,0)::numeric, 4),
         last_purchase_price = _last
   WHERE id = _stock_item_id;

  RETURN jsonb_build_object('avg_purchase_price', _avg, 'last_purchase_price', _last, 'final_qty', _qty);
END
$$;

GRANT EXECUTE ON FUNCTION public.recompute_stock_avg_cost(uuid) TO authenticated;

-- 7. Extend invoice → stock sync: skip when deferred, stamp source_document
CREATE OR REPLACE FUNCTION public.trg_invoice_stock_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wh uuid;
  _item record;
  _moved_out boolean;
  _moved_back boolean;
  _existing_out uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF COALESCE(NEW.deferred_stock_issue, false) THEN RETURN NEW; END IF;

  _wh := public.default_warehouse_id(NEW.company_id);
  IF _wh IS NULL THEN RETURN NEW; END IF;

  _moved_out := NEW.status IN ('sent','paid') AND COALESCE(OLD.status::text,'') NOT IN ('sent','paid');
  _moved_back := NEW.status IN ('cancelled','draft') AND COALESCE(OLD.status::text,'') IN ('sent','paid');

  IF NOT (_moved_out OR _moved_back) THEN RETURN NEW; END IF;

  FOR _item IN
    SELECT ii.id AS item_id, ii.stock_item_id, ii.quantity, ii.unit_price
    FROM public.invoice_items ii
    WHERE ii.invoice_id = NEW.id AND ii.stock_item_id IS NOT NULL
  LOOP
    IF _moved_out THEN
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
          reference_type, reference_id, reference_item_id,
          source_document_type, source_document_id, note)
        VALUES (NEW.company_id, _wh, _item.stock_item_id, 'faktura', _item.quantity, _item.unit_price,
          _item.quantity * _item.unit_price, 'invoice', NEW.id, _item.item_id,
          'invoice', NEW.id,
          'Auto: faktúra ' || NEW.invoice_number);
      END IF;
    ELSIF _moved_back THEN
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
          reference_type, reference_id, reference_item_id, reversed_movement_id,
          source_document_type, source_document_id, note)
        VALUES (NEW.company_id, _wh, _item.stock_item_id, 'dobropis', _item.quantity, _item.unit_price,
          _item.quantity * _item.unit_price, 'invoice', NEW.id, _item.item_id, _existing_out,
          'invoice', NEW.id,
          'Auto: storno faktúry ' || NEW.invoice_number);
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END
$$;
