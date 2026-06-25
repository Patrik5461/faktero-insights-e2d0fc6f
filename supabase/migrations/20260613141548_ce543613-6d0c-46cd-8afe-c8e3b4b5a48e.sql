
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_items_stock_item ON public.invoice_items(stock_item_id);

-- Helper: pick the default warehouse for a company (first active, or any)
CREATE OR REPLACE FUNCTION public.default_warehouse_id(_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.warehouses
  WHERE company_id = _company_id
  ORDER BY active DESC, created_at ASC
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.default_warehouse_id(uuid) FROM PUBLIC, anon;

-- Trigger function: on invoice status change, create stock movements
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
BEGIN
  -- Only act on real transitions
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  _wh := public.default_warehouse_id(NEW.company_id);
  IF _wh IS NULL THEN RETURN NEW; END IF;

  _moved_out := NEW.status IN ('sent','paid') AND COALESCE(OLD.status,'') NOT IN ('sent','paid');
  _moved_back := NEW.status IN ('cancelled','draft') AND COALESCE(OLD.status,'') IN ('sent','paid');

  IF NOT (_moved_out OR _moved_back) THEN RETURN NEW; END IF;

  FOR _item IN
    SELECT ii.stock_item_id, ii.quantity, ii.unit_price
    FROM public.invoice_items ii
    WHERE ii.invoice_id = NEW.id AND ii.stock_item_id IS NOT NULL
  LOOP
    IF _moved_out THEN
      INSERT INTO public.stock_movements(company_id, warehouse_id, stock_item_id, type, quantity, unit_price, total_value, reference_type, reference_id, note)
      VALUES (NEW.company_id, _wh, _item.stock_item_id, 'faktura', _item.quantity, _item.unit_price, _item.quantity * _item.unit_price, 'invoice', NEW.id, 'Auto: faktúra ' || NEW.invoice_number);
    ELSIF _moved_back THEN
      INSERT INTO public.stock_movements(company_id, warehouse_id, stock_item_id, type, quantity, unit_price, total_value, reference_type, reference_id, note)
      VALUES (NEW.company_id, _wh, _item.stock_item_id, 'dobropis', _item.quantity, _item.unit_price, _item.quantity * _item.unit_price, 'invoice', NEW.id, 'Auto: storno faktúry ' || NEW.invoice_number);
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_stock_sync ON public.invoices;
CREATE TRIGGER trg_invoice_stock_sync
AFTER UPDATE OF status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_invoice_stock_sync();
