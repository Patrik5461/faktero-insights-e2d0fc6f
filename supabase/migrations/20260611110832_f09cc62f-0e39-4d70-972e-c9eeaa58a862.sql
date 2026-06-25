
CREATE TABLE public.efaktura_interest_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX efaktura_interest_signups_company_idx ON public.efaktura_interest_signups(company_id);

GRANT INSERT ON public.efaktura_interest_signups TO anon, authenticated;
GRANT SELECT ON public.efaktura_interest_signups TO authenticated;
GRANT ALL ON public.efaktura_interest_signups TO service_role;

ALTER TABLE public.efaktura_interest_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can sign up for efaktura news"
ON public.efaktura_interest_signups
FOR INSERT
TO anon, authenticated
WITH CHECK (
  email IS NOT NULL
  AND length(btrim(email)) BETWEEN 3 AND 320
  AND (company_id IS NULL OR public.is_company_member(company_id, auth.uid()))
);

CREATE POLICY "Members read company signups"
ON public.efaktura_interest_signups
FOR SELECT
TO authenticated
USING (company_id IS NOT NULL AND public.is_company_member(company_id, auth.uid()));
