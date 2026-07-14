
-- Categories
CREATE TABLE public.stock_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_categories TO authenticated;
GRANT ALL ON public.stock_categories TO service_role;

ALTER TABLE public.stock_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_categories_select_member" ON public.stock_categories
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "stock_categories_insert_member" ON public.stock_categories
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "stock_categories_update_member" ON public.stock_categories
  FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "stock_categories_delete_admin" ON public.stock_categories
  FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()));

CREATE TRIGGER stock_categories_set_updated_at
  BEFORE UPDATE ON public.stock_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- New columns on stock_items
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.stock_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS name_en text;

CREATE INDEX IF NOT EXISTS idx_stock_items_category ON public.stock_items(category_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_supplier ON public.stock_items(supplier_id);
