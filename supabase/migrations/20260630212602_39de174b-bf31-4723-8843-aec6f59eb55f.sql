
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_token text,
  ADD COLUMN IF NOT EXISTS push_platform text CHECK (push_platform IN ('ios','android')),
  ADD COLUMN IF NOT EXISTS push_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_push_token ON public.profiles(push_token) WHERE push_token IS NOT NULL;
