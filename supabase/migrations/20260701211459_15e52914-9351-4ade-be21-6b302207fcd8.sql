
CREATE TABLE public.expense_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','processed','exported')),
  source TEXT NOT NULL DEFAULT 'photo' CHECK (source IN ('photo','qr','upload','web')),
  supplier_name TEXT,
  supplier_ico TEXT,
  supplier_ic_dph TEXT,
  document_number TEXT,
  issue_date DATE,
  total_amount NUMERIC(14,2),
  vat_amount NUMERIC(14,2),
  net_amount NUMERIC(14,2),
  vat_rate NUMERIC(5,2),
  currency TEXT NOT NULL DEFAULT 'EUR',
  category TEXT,
  note TEXT,
  file_path TEXT,
  file_mime TEXT,
  file_size INTEGER,
  qr_raw TEXT,
  ai_raw JSONB,
  exported_at TIMESTAMPTZ,
  export_job_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_documents TO authenticated;
GRANT ALL ON public.expense_documents TO service_role;

ALTER TABLE public.expense_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view expenses" ON public.expense_documents
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE POLICY "members insert expenses" ON public.expense_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE POLICY "members update expenses" ON public.expense_documents
  FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE POLICY "admins delete expenses" ON public.expense_documents
  FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()));

CREATE INDEX idx_expense_documents_company_date ON public.expense_documents(company_id, issue_date DESC);
CREATE INDEX idx_expense_documents_status ON public.expense_documents(company_id, status);

CREATE TRIGGER expense_documents_updated_at
  BEFORE UPDATE ON public.expense_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage RLS (bucket vytvorený cez storage tool)
CREATE POLICY "members read expense receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND public.is_company_member((split_part(name, '/', 1))::uuid, auth.uid())
  );

CREATE POLICY "members upload expense receipts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND public.is_company_member((split_part(name, '/', 1))::uuid, auth.uid())
  );

CREATE POLICY "members delete expense receipts" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND public.is_company_member((split_part(name, '/', 1))::uuid, auth.uid())
  );
