
CREATE TYPE public.stock_transfer_status AS ENUM ('draft', 'completed', 'cancelled');

CREATE TABLE public.stock_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  target_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  warehouse_from_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  warehouse_to_id UUID REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  status public.stock_transfer_status NOT NULL DEFAULT 'draft',
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_transfers_company ON public.stock_transfers(company_id);
CREATE INDEX idx_stock_transfers_target_company ON public.stock_transfers(target_company_id);

CREATE TABLE public.stock_transfer_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  source_stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
  target_stock_item_id UUID REFERENCES public.stock_items(id) ON DELETE SET NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_transfer_items_transfer ON public.stock_transfer_items(transfer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transfers TO authenticated;
GRANT ALL ON public.stock_transfers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transfer_items TO authenticated;
GRANT ALL ON public.stock_transfer_items TO service_role;

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members of source or target company can read transfers"
ON public.stock_transfers FOR SELECT TO authenticated
USING (
  public.is_company_member(company_id, auth.uid())
  OR (target_company_id IS NOT NULL AND public.is_company_member(target_company_id, auth.uid()))
);

CREATE POLICY "Source company members can create transfers"
ON public.stock_transfers FOR INSERT TO authenticated
WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE POLICY "Source or target company members can update transfers"
ON public.stock_transfers FOR UPDATE TO authenticated
USING (
  public.is_company_member(company_id, auth.uid())
  OR (target_company_id IS NOT NULL AND public.is_company_member(target_company_id, auth.uid()))
)
WITH CHECK (
  public.is_company_member(company_id, auth.uid())
  OR (target_company_id IS NOT NULL AND public.is_company_member(target_company_id, auth.uid()))
);

CREATE POLICY "Source company members can delete draft transfers"
ON public.stock_transfers FOR DELETE TO authenticated
USING (public.is_company_member(company_id, auth.uid()) AND status = 'draft');

CREATE POLICY "Members can read transfer items"
ON public.stock_transfer_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.stock_transfers t
  WHERE t.id = transfer_id
    AND (public.is_company_member(t.company_id, auth.uid())
         OR (t.target_company_id IS NOT NULL AND public.is_company_member(t.target_company_id, auth.uid())))
));

CREATE POLICY "Members can write transfer items"
ON public.stock_transfer_items FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.stock_transfers t
  WHERE t.id = transfer_id
    AND public.is_company_member(t.company_id, auth.uid())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.stock_transfers t
  WHERE t.id = transfer_id
    AND public.is_company_member(t.company_id, auth.uid())
));

CREATE TRIGGER stock_transfers_set_updated_at
BEFORE UPDATE ON public.stock_transfers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
