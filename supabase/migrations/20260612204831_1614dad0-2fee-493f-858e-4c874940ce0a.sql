-- Platform admin role + audit log + company suspension + subscription extensions

-- 1. platform_admins
CREATE TABLE public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- 2. is_platform_admin security-definer
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = _user_id
  )
$$;

CREATE POLICY "Platform admins read admin list"
  ON public.platform_admins FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- 3. platform_audit_logs
CREATE TABLE public.platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_platform_audit_logs_created_at ON public.platform_audit_logs(created_at DESC);
CREATE INDEX idx_platform_audit_logs_admin ON public.platform_audit_logs(admin_user_id);
GRANT SELECT ON public.platform_audit_logs TO authenticated;
GRANT ALL ON public.platform_audit_logs TO service_role;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins read audit log"
  ON public.platform_audit_logs FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- 4. Add suspension columns to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text;

-- 5. Extend subscriptions for GoPay readiness (only missing columns)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS next_billing_at timestamptz,
  ADD COLUMN IF NOT EXISTS monthly_price_cents integer,
  ADD COLUMN IF NOT EXISTS payment_provider text DEFAULT 'gopay',
  ADD COLUMN IF NOT EXISTS external_subscription_id text;

-- To grant the first platform admin, run via Insert tool after deciding which user:
--   INSERT INTO public.platform_admins (user_id, role)
--   VALUES ((SELECT id FROM auth.users WHERE email = 'YOU@example.com'), 'superadmin');
