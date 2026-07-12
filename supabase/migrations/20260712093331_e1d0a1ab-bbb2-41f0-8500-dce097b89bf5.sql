
CREATE TABLE public.seo_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  title TEXT,
  description TEXT,
  og_title TEXT,
  og_description TEXT,
  og_image TEXT,
  canonical TEXT,
  robots TEXT DEFAULT 'index,follow',
  google_verification TEXT,
  ga_measurement_id TEXT,
  priority NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.seo_pages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_pages TO authenticated;
GRANT ALL ON public.seo_pages TO service_role;

ALTER TABLE public.seo_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read seo_pages"
  ON public.seo_pages FOR SELECT USING (true);

CREATE POLICY "Platform admins can insert seo_pages"
  ON public.seo_pages FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can update seo_pages"
  ON public.seo_pages FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can delete seo_pages"
  ON public.seo_pages FOR DELETE TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE TRIGGER seo_pages_set_updated_at
  BEFORE UPDATE ON public.seo_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.seo_pages (path, title, description, priority) VALUES
  ('_global', NULL, NULL, NULL),
  ('/', 'Faktero — Moderná fakturácia pre SK a CZ firmy', 'API-first fakturačný program pre slovenské firmy. eFaktúra 2027 zadarmo, faktúry online, bankové párovanie, mobilná appka.', 1.0),
  ('/cennik', 'Cenník — Faktero fakturačný program', 'Prehľadný cenník Faktero. Starter 9 € a Premium 19 € s DPH. 60 dní zadarmo skúšobné obdobie.', 0.9),
  ('/kontakt', 'Kontakt — Faktero', 'Kontaktujte tím Faktero. Podpora pre fakturačný program, eFaktúru a integrácie.', 0.7),
  ('/funkcie', 'Funkcie Faktero — fakturácia, eFaktúra, sklad', 'Všetky funkcie fakturačného programu Faktero: online faktúry, eFaktúra 2027, sklad, kniha jázd, API.', 0.7)
ON CONFLICT (path) DO NOTHING;
