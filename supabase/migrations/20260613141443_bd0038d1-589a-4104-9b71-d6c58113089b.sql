
-- enum for movement types
DO $$ BEGIN
  CREATE TYPE public.stock_movement_type AS ENUM ('prijem','vydaj','oprava','inventura','faktura','dobropis');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.inventory_count_status AS ENUM ('open','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- warehouses
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_warehouses_company ON public.warehouses(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warehouses_member_select" ON public.warehouses FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "warehouses_member_insert" ON public.warehouses FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "warehouses_member_update" ON public.warehouses FOR UPDATE TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "warehouses_admin_delete" ON public.warehouses FOR DELETE TO authenticated USING (public.is_company_admin(company_id, auth.uid()));
CREATE TRIGGER trg_warehouses_updated BEFORE UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- stock_items
CREATE TABLE public.stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  sku text,
  barcode text,
  purchase_price numeric(14,4) NOT NULL DEFAULT 0,
  sale_price numeric(14,4) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 20,
  unit text NOT NULL DEFAULT 'ks',
  track_stock boolean NOT NULL DEFAULT true,
  min_stock numeric(14,3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_items_company ON public.stock_items(company_id);
CREATE INDEX idx_stock_items_product ON public.stock_items(product_id);
CREATE UNIQUE INDEX uq_stock_items_company_sku ON public.stock_items(company_id, sku) WHERE sku IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_items TO authenticated;
GRANT ALL ON public.stock_items TO service_role;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_items_member_select" ON public.stock_items FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "stock_items_member_insert" ON public.stock_items FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "stock_items_member_update" ON public.stock_items FOR UPDATE TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "stock_items_admin_delete" ON public.stock_items FOR DELETE TO authenticated USING (public.is_company_admin(company_id, auth.uid()));
CREATE TRIGGER trg_stock_items_updated BEFORE UPDATE ON public.stock_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- stock_levels
CREATE TABLE public.stock_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  reserved_quantity numeric(14,3) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(warehouse_id, stock_item_id)
);
CREATE INDEX idx_stock_levels_company ON public.stock_levels(company_id);
CREATE INDEX idx_stock_levels_item ON public.stock_levels(stock_item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_levels TO authenticated;
GRANT ALL ON public.stock_levels TO service_role;
ALTER TABLE public.stock_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_levels_member_select" ON public.stock_levels FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "stock_levels_member_insert" ON public.stock_levels FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "stock_levels_member_update" ON public.stock_levels FOR UPDATE TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "stock_levels_admin_delete" ON public.stock_levels FOR DELETE TO authenticated USING (public.is_company_admin(company_id, auth.uid()));
CREATE TRIGGER trg_stock_levels_updated BEFORE UPDATE ON public.stock_levels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- stock_movements
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
  type public.stock_movement_type NOT NULL,
  quantity numeric(14,3) NOT NULL,
  unit_price numeric(14,4) NOT NULL DEFAULT 0,
  total_value numeric(14,4) NOT NULL DEFAULT 0,
  reference_type text,
  reference_id uuid,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_movements_company ON public.stock_movements(company_id);
CREATE INDEX idx_stock_movements_item ON public.stock_movements(stock_item_id);
CREATE INDEX idx_stock_movements_ref ON public.stock_movements(reference_type, reference_id);
CREATE INDEX idx_stock_movements_created ON public.stock_movements(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_movements_member_select" ON public.stock_movements FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "stock_movements_member_insert" ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "stock_movements_admin_delete" ON public.stock_movements FOR DELETE TO authenticated USING (public.is_company_admin(company_id, auth.uid()));

-- inventory_counts
CREATE TABLE public.inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  status public.inventory_count_status NOT NULL DEFAULT 'open',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inventory_counts_company ON public.inventory_counts(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_counts TO authenticated;
GRANT ALL ON public.inventory_counts TO service_role;
ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_counts_member_select" ON public.inventory_counts FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "inventory_counts_member_insert" ON public.inventory_counts FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "inventory_counts_member_update" ON public.inventory_counts FOR UPDATE TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "inventory_counts_admin_delete" ON public.inventory_counts FOR DELETE TO authenticated USING (public.is_company_admin(company_id, auth.uid()));
CREATE TRIGGER trg_inventory_counts_updated BEFORE UPDATE ON public.inventory_counts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- inventory_count_items
CREATE TABLE public.inventory_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_count_id uuid NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
  expected_quantity numeric(14,3) NOT NULL DEFAULT 0,
  counted_quantity numeric(14,3),
  difference numeric(14,3),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inventory_count_items_count ON public.inventory_count_items(inventory_count_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_count_items TO authenticated;
GRANT ALL ON public.inventory_count_items TO service_role;
ALTER TABLE public.inventory_count_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_count_items_member_all" ON public.inventory_count_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inventory_counts ic WHERE ic.id = inventory_count_id AND public.is_company_member(ic.company_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.inventory_counts ic WHERE ic.id = inventory_count_id AND public.is_company_member(ic.company_id, auth.uid())));

-- helper: apply a stock movement to stock_levels (atomic upsert)
CREATE OR REPLACE FUNCTION public.apply_stock_movement(
  _company_id uuid,
  _warehouse_id uuid,
  _stock_item_id uuid,
  _delta numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.stock_levels(company_id, warehouse_id, stock_item_id, quantity)
  VALUES (_company_id, _warehouse_id, _stock_item_id, _delta)
  ON CONFLICT (warehouse_id, stock_item_id)
  DO UPDATE SET quantity = public.stock_levels.quantity + EXCLUDED.quantity,
                updated_at = now();
END $$;

-- trigger: when movement inserted, adjust stock_levels
CREATE OR REPLACE FUNCTION public.trg_apply_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _delta numeric;
BEGIN
  -- prijem, oprava (positive qty signed), faktura (negative), vydaj (negative), dobropis (positive), inventura (signed)
  _delta := CASE NEW.type
    WHEN 'prijem'    THEN abs(NEW.quantity)
    WHEN 'vydaj'     THEN -abs(NEW.quantity)
    WHEN 'faktura'   THEN -abs(NEW.quantity)
    WHEN 'dobropis'  THEN abs(NEW.quantity)
    ELSE NEW.quantity  -- oprava / inventura: caller passes signed value
  END;

  PERFORM public.apply_stock_movement(NEW.company_id, NEW.warehouse_id, NEW.stock_item_id, _delta);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_stock_movements_apply
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.trg_apply_stock_movement();
