
CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform admins manage settings"
ON public.platform_settings
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()));
