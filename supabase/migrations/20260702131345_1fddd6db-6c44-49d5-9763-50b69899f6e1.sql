
-- ============ Purchase invoices (evidencia prijatých faktúr) ============

CREATE TABLE IF NOT EXISTS public.purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  supplier_ico text,
  supplier_dic text,
  supplier_ic_dph text,
  invoice_number text NOT NULL,
  issue_date date NOT NULL,
  received_date date NOT NULL DEFAULT (now()::date),
  due_date date NOT NULL,
  payment_date date,
  payment_method text,
  amount_without_vat numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount numeric(14,2) NOT NULL DEFAULT 0,
  amount_total numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','received','booked','paid','cancelled')),
  note text,
  pdf_url text,
  file_path text,
  file_mime text,
  file_size integer,
  created_by uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_invoices TO authenticated;
GRANT ALL ON public.purchase_invoices TO service_role;

ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_invoices_select_members"
  ON public.purchase_invoices FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE POLICY "purchase_invoices_insert_members"
  ON public.purchase_invoices FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE POLICY "purchase_invoices_update_members"
  ON public.purchase_invoices FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE POLICY "purchase_invoices_delete_members"
  ON public.purchase_invoices FOR DELETE TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE INDEX IF NOT EXISTS purchase_invoices_company_idx
  ON public.purchase_invoices(company_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS purchase_invoices_status_idx
  ON public.purchase_invoices(company_id, status);

CREATE TRIGGER purchase_invoices_set_updated_at
  BEFORE UPDATE ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Storage RLS for bucket 'purchase-invoices' ============
-- Path convention: <company_id>/<uuid>.<ext>

CREATE POLICY "purchase-invoices read members"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'purchase-invoices'
    AND public.is_company_member(
      NULLIF(split_part(name, '/', 1), '')::uuid,
      auth.uid()
    )
  );

CREATE POLICY "purchase-invoices insert members"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'purchase-invoices'
    AND public.is_company_member(
      NULLIF(split_part(name, '/', 1), '')::uuid,
      auth.uid()
    )
  );

CREATE POLICY "purchase-invoices delete members"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'purchase-invoices'
    AND public.is_company_member(
      NULLIF(split_part(name, '/', 1), '')::uuid,
      auth.uid()
    )
  );
