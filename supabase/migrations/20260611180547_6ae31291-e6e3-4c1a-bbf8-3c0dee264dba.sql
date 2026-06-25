ALTER TABLE public.company_lookup_logs
  ADD COLUMN IF NOT EXISTS mapped_company_name text,
  ADD COLUMN IF NOT EXISTS mapped_dic text,
  ADD COLUMN IF NOT EXISTS mapped_ic_dph text,
  ADD COLUMN IF NOT EXISTS raw_response jsonb;