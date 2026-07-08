CREATE TABLE IF NOT EXISTS public.company_cache (
  ico text NOT NULL,
  region text NOT NULL DEFAULT 'sk',
  status text NOT NULL,
  data jsonb,
  raw jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ico, region)
);

GRANT ALL ON public.company_cache TO service_role;

ALTER TABLE public.company_cache ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_company_cache_updated_at ON public.company_cache;
CREATE TRIGGER trg_company_cache_updated_at
  BEFORE UPDATE ON public.company_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();