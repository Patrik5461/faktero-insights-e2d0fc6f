-- Complete reservation lifecycle: handle quote 'converted' status with proportional per-line fulfillment.
CREATE OR REPLACE FUNCTION public.trg_quote_reservations_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  invoiced_qty numeric;
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
    -- Cancel path: any terminal non-fulfilling status cancels remaining active reservations.
    IF NEW.status IN ('cancelled','rejected','expired') THEN
      UPDATE public.stock_reservations
         SET status = 'cancelled', updated_at = now()
       WHERE source_document_type = 'quote'
         AND source_document_id = NEW.id
         AND status = 'active';

    -- Fulfillment path: quote turned into an invoice (converted) OR accepted with an invoice link.
    -- Proportionally fulfill each active reservation against invoice_items matched by stock_item_id.
    ELSIF NEW.status IN ('converted','accepted') AND NEW.converted_invoice_id IS NOT NULL THEN
      FOR r IN
        SELECT id, stock_item_id, quantity
          FROM public.stock_reservations
         WHERE source_document_type = 'quote'
           AND source_document_id = NEW.id
           AND status = 'active'
      LOOP
        SELECT COALESCE(SUM(ii.quantity), 0)
          INTO invoiced_qty
          FROM public.invoice_items ii
         WHERE ii.invoice_id = NEW.converted_invoice_id
           AND ii.stock_item_id = r.stock_item_id;

        IF invoiced_qty >= r.quantity THEN
          UPDATE public.stock_reservations
             SET status = 'fulfilled', updated_at = now()
           WHERE id = r.id;
        ELSIF invoiced_qty > 0 THEN
          -- Partial invoice: reduce reservation to remaining (still-active) quantity.
          UPDATE public.stock_reservations
             SET quantity = r.quantity - invoiced_qty, updated_at = now()
           WHERE id = r.id;
        END IF;
        -- If invoiced_qty = 0, leave reservation active (item was not on the invoice).
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END $function$;