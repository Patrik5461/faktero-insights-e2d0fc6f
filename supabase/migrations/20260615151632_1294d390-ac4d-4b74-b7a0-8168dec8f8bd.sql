
-- Tesla Fleet API integration tables

CREATE TABLE public.tesla_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  tesla_account_email text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  sync_status text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tesla_connections TO authenticated;
GRANT ALL ON public.tesla_connections TO service_role;
ALTER TABLE public.tesla_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tesla_connections_select" ON public.tesla_connections FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "tesla_connections_admin_write" ON public.tesla_connections FOR ALL TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()))
  WITH CHECK (public.is_company_admin(company_id, auth.uid()));
CREATE TRIGGER tesla_connections_updated_at BEFORE UPDATE ON public.tesla_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.tesla_vehicle_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tesla_vehicle_id text NOT NULL,
  tesla_vin text,
  tesla_display_name text,
  tesla_license_plate text,
  faktero_vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, tesla_vehicle_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tesla_vehicle_links TO authenticated;
GRANT ALL ON public.tesla_vehicle_links TO service_role;
ALTER TABLE public.tesla_vehicle_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tesla_vehicle_links_select" ON public.tesla_vehicle_links FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "tesla_vehicle_links_admin_write" ON public.tesla_vehicle_links FOR ALL TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()))
  WITH CHECK (public.is_company_admin(company_id, auth.uid()));
CREATE TRIGGER tesla_vehicle_links_updated_at BEFORE UPDATE ON public.tesla_vehicle_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.tesla_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sync_type text NOT NULL,
  status text NOT NULL,
  message text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.tesla_sync_logs TO authenticated;
GRANT ALL ON public.tesla_sync_logs TO service_role;
ALTER TABLE public.tesla_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tesla_sync_logs_select" ON public.tesla_sync_logs FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE TABLE public.tesla_vehicle_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tesla_connection_id uuid REFERENCES public.tesla_connections(id) ON DELETE CASCADE,
  tesla_vehicle_id text NOT NULL,
  faktero_vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  odometer_km numeric,
  latitude numeric,
  longitude numeric,
  shift_state text,
  drive_state jsonb,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.tesla_vehicle_snapshots TO authenticated;
GRANT ALL ON public.tesla_vehicle_snapshots TO service_role;
ALTER TABLE public.tesla_vehicle_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tesla_snapshots_select" ON public.tesla_vehicle_snapshots FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE INDEX tesla_snapshots_company_vehicle_idx ON public.tesla_vehicle_snapshots(company_id, tesla_vehicle_id, captured_at DESC);

-- Extend trips for tesla external source (only add if columns don't exist)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='trips' AND column_name='external_source') THEN
    ALTER TABLE public.trips ADD COLUMN external_source text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='trips' AND column_name='external_id') THEN
    ALTER TABLE public.trips ADD COLUMN external_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='trips' AND column_name='imported_at') THEN
    ALTER TABLE public.trips ADD COLUMN imported_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='trips' AND column_name='raw_provider_data') THEN
    ALTER TABLE public.trips ADD COLUMN raw_provider_data jsonb;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS trips_company_external_unique
  ON public.trips(company_id, external_source, external_id)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
