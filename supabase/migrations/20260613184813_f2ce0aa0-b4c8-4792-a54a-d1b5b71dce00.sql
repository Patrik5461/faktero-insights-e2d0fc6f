
-- Vehicles
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  license_plate text,
  vehicle_type text,
  fuel_type text,
  consumption_l_100km numeric(6,2),
  initial_odometer numeric(12,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicles_member_select" ON public.vehicles FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "vehicles_admin_insert" ON public.vehicles FOR INSERT TO authenticated
  WITH CHECK (public.is_company_admin(company_id, auth.uid()));
CREATE POLICY "vehicles_admin_update" ON public.vehicles FOR UPDATE TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()))
  WITH CHECK (public.is_company_admin(company_id, auth.uid()));
CREATE POLICY "vehicles_admin_delete" ON public.vehicles FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()));
CREATE TRIGGER vehicles_set_updated_at BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX vehicles_company_idx ON public.vehicles(company_id);

-- Trips
CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  driver_name text,
  trip_date date NOT NULL,
  start_location text,
  end_location text,
  purpose text,
  start_odometer numeric(12,2) NOT NULL,
  end_odometer numeric(12,2) NOT NULL,
  distance_km numeric(12,2) NOT NULL,
  fuel_price numeric(10,4),
  fuel_consumption numeric(8,2),
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trips_odo_chk CHECK (end_odometer >= start_odometer)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trips_member_select" ON public.trips FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "trips_member_insert" ON public.trips FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "trips_admin_update" ON public.trips FOR UPDATE TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()))
  WITH CHECK (public.is_company_admin(company_id, auth.uid()));
CREATE POLICY "trips_admin_delete" ON public.trips FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()));
CREATE TRIGGER trips_set_updated_at BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX trips_company_date_idx ON public.trips(company_id, trip_date DESC);
CREATE INDEX trips_vehicle_idx ON public.trips(vehicle_id);

-- Fuel records
CREATE TABLE public.fuel_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  fuel_date date NOT NULL,
  liters numeric(10,3) NOT NULL,
  price_per_liter numeric(10,4) NOT NULL,
  total_amount numeric(12,2) NOT NULL,
  station_name text,
  receipt_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_records TO authenticated;
GRANT ALL ON public.fuel_records TO service_role;
ALTER TABLE public.fuel_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fuel_member_select" ON public.fuel_records FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "fuel_member_insert" ON public.fuel_records FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "fuel_admin_update" ON public.fuel_records FOR UPDATE TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()))
  WITH CHECK (public.is_company_admin(company_id, auth.uid()));
CREATE POLICY "fuel_admin_delete" ON public.fuel_records FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()));
CREATE INDEX fuel_company_date_idx ON public.fuel_records(company_id, fuel_date DESC);
CREATE INDEX fuel_vehicle_idx ON public.fuel_records(vehicle_id);
