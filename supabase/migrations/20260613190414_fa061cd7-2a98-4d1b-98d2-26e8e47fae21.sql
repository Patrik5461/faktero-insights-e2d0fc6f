
-- ============== commander_connections ==============
CREATE TABLE public.commander_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  username text NOT NULL,
  encrypted_password text NOT NULL,
  auto_sync_daily boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  sync_status text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commander_connections TO authenticated;
GRANT ALL ON public.commander_connections TO service_role;
ALTER TABLE public.commander_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage commander connection"
  ON public.commander_connections FOR ALL TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()))
  WITH CHECK (public.is_company_admin(company_id, auth.uid()));
CREATE TRIGGER trg_commander_connections_updated_at
  BEFORE UPDATE ON public.commander_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== commander_vehicle_links ==============
CREATE TABLE public.commander_vehicle_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  commander_vehicle_id text NOT NULL,
  commander_vehicle_name text,
  commander_license_plate text,
  faktero_vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, commander_vehicle_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commander_vehicle_links TO authenticated;
GRANT ALL ON public.commander_vehicle_links TO service_role;
ALTER TABLE public.commander_vehicle_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read commander vehicle links"
  ON public.commander_vehicle_links FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "admins manage commander vehicle links"
  ON public.commander_vehicle_links FOR ALL TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()))
  WITH CHECK (public.is_company_admin(company_id, auth.uid()));
CREATE TRIGGER trg_commander_vehicle_links_updated_at
  BEFORE UPDATE ON public.commander_vehicle_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== commander_sync_logs ==============
CREATE TABLE public.commander_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sync_type text NOT NULL,
  status text NOT NULL,
  message text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.commander_sync_logs TO authenticated;
GRANT ALL ON public.commander_sync_logs TO service_role;
ALTER TABLE public.commander_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read commander sync logs"
  ON public.commander_sync_logs FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE INDEX idx_commander_sync_logs_company_created ON public.commander_sync_logs (company_id, created_at DESC);

-- ============== trips: external source fields ==============
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS raw_provider_data jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_external_unique
  ON public.trips (company_id, external_source, external_id)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
