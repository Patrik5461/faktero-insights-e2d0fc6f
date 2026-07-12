
CREATE TABLE public.google_seo_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('gsc','ga4')),
  access_token_enc text,
  refresh_token_enc text NOT NULL,
  property_id text,
  scope text,
  connected_by uuid REFERENCES auth.users(id),
  connected_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_seo_connections TO authenticated;
GRANT ALL ON public.google_seo_connections TO service_role;

ALTER TABLE public.google_seo_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage google_seo_connections"
  ON public.google_seo_connections FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER trg_google_seo_connections_updated_at
  BEFORE UPDATE ON public.google_seo_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.seo_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  data jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_cache TO authenticated;
GRANT ALL ON public.seo_cache TO service_role;

ALTER TABLE public.seo_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins read seo_cache"
  ON public.seo_cache FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins write seo_cache"
  ON public.seo_cache FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE INDEX idx_seo_cache_expires_at ON public.seo_cache (expires_at);
