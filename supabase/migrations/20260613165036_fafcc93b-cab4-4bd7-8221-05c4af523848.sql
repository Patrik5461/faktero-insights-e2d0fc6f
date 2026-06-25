
-- Legal document versions
CREATE TABLE public.legal_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL CHECK (document_type IN ('obchodne-podmienky','gdpr','reklamacny-poriadok','gopay-podmienky','cookies')),
  version text NOT NULL,
  content_md text,
  published_at timestamptz NOT NULL DEFAULT now(),
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_type, version)
);

GRANT SELECT ON public.legal_document_versions TO anon, authenticated;
GRANT ALL ON public.legal_document_versions TO service_role;
ALTER TABLE public.legal_document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read legal versions"
  ON public.legal_document_versions FOR SELECT
  USING (true);

CREATE POLICY "Platform admins manage legal versions"
  ON public.legal_document_versions FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER trg_legal_document_versions_updated_at
  BEFORE UPDATE ON public.legal_document_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Legal acceptances
CREATE TABLE public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('obchodne-podmienky','gdpr','reklamacny-poriadok','gopay-podmienky','cookies')),
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_legal_acceptances_user ON public.legal_acceptances(user_id);

GRANT SELECT, INSERT ON public.legal_acceptances TO authenticated;
GRANT ALL ON public.legal_acceptances TO service_role;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own acceptances"
  ON public.legal_acceptances FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own acceptances"
  ON public.legal_acceptances FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Platform admins view all acceptances"
  ON public.legal_acceptances FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Seed initial v1.0
INSERT INTO public.legal_document_versions (document_type, version, is_current, published_at) VALUES
  ('obchodne-podmienky','1.0',true, now()),
  ('gdpr','1.0',true, now()),
  ('reklamacny-poriadok','1.0',true, now()),
  ('gopay-podmienky','1.0',true, now()),
  ('cookies','1.0',true, now());
