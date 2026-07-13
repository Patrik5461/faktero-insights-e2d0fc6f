
CREATE TABLE IF NOT EXISTS public.company_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.company_role NOT NULL DEFAULT 'employee',
  token text NOT NULL UNIQUE,
  invited_by uuid,
  accepted_at timestamptz,
  accepted_user_id uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_invitations_company ON public.company_invitations(company_id);
CREATE INDEX IF NOT EXISTS idx_company_invitations_token ON public.company_invitations(token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_invitations TO authenticated;
GRANT ALL ON public.company_invitations TO service_role;

ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage invitations"
  ON public.company_invitations FOR ALL TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()))
  WITH CHECK (public.is_company_admin(company_id, auth.uid()));

CREATE POLICY "Company members can view invitations"
  ON public.company_invitations FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
