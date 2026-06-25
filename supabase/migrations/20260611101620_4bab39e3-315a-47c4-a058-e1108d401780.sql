ALTER TABLE public.api_logs
  ADD COLUMN IF NOT EXISTS request_body jsonb,
  ADD COLUMN IF NOT EXISTS response_body jsonb,
  ADD COLUMN IF NOT EXISTS user_agent text;