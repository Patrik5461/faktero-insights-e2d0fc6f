-- Cache invalidation for generated invoice PDFs
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS pdf_source_hash text;

-- Cheap content fingerprint of everything that ends up on the PDF
CREATE OR REPLACE FUNCTION public.faktero_invoice_pdf_hash(_invoice_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT md5(
    coalesce((
      SELECT (to_jsonb(i) - 'pdf_url' - 'pdf_source_hash' - 'updated_at')::text
      FROM public.invoices i WHERE i.id = _invoice_id
    ), '')
    || '|' ||
    coalesce((
      SELECT string_agg((to_jsonb(it) - 'updated_at')::text, '|' ORDER BY it.position, it.id)
      FROM public.invoice_items it WHERE it.invoice_id = _invoice_id
    ), '')
    || '|' ||
    coalesce((
      SELECT (to_jsonb(c) - 'updated_at')::text
      FROM public.companies c
      WHERE c.id = (SELECT company_id FROM public.invoices WHERE id = _invoice_id)
    ), '')
  )
$$;

-- Invalidate the cached PDF whenever invoice content changes
CREATE OR REPLACE FUNCTION public.faktero_invalidate_invoice_pdf()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'pdf_url' - 'pdf_source_hash' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'pdf_url' - 'pdf_source_hash' - 'updated_at')
  THEN
    NEW.pdf_url := NULL;
    NEW.pdf_source_hash := NULL;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_invoices_invalidate_pdf ON public.invoices;
CREATE TRIGGER trg_invoices_invalidate_pdf
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.faktero_invalidate_invoice_pdf();

-- Item changes invalidate the parent invoice's cached PDF
CREATE OR REPLACE FUNCTION public.faktero_invalidate_invoice_pdf_from_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _inv uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
BEGIN
  UPDATE public.invoices
     SET pdf_url = NULL, pdf_source_hash = NULL
   WHERE id = _inv
     AND (pdf_url IS NOT NULL OR pdf_source_hash IS NOT NULL);
  RETURN COALESCE(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS trg_invoice_items_invalidate_pdf ON public.invoice_items;
CREATE TRIGGER trg_invoice_items_invalidate_pdf
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.faktero_invalidate_invoice_pdf_from_item();

-- Existing cached PDFs have no fingerprint, so treat them as stale
UPDATE public.invoices SET pdf_source_hash = NULL WHERE pdf_url IS NOT NULL;