import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  startTracking,
  stopTracking,
  isTracking,
  getCurrentDistanceKm,
} from "@/lib/mobile/gps-tracker";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { JobPicker } from "@/components/faktero/JobPicker";
import { poslednaCenaPaliva } from "@/lib/faktero/cena-paliva";
import { trasaDoPolyline } from "@/lib/faktero/polyline";
import { Play, Square } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/jazdy/gps")({
  head: () => ({ meta: [{ title: "GPS jazda — Faktero" }] }),
  component: GpsTripPage,
});

function GpsTripPage() {
  const navigate = useNavigate();
  const [tracking, setTracking] = useState(false);
  const [distance, setDistance] = useState(0);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [jobId, setJobId] = useState("");
  // Cena z posledného tankovania; bez nej by GPS jazda nemala náklad.
  const [fuelPrice, setFuelPrice] = useState<number | null>(null);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    supabase
      .from("vehicles")
      .select("*")
      .eq("company_id", cid)
      .eq("active", true)
      .order("name")
      .then(({ data }) => {
        setVehicles(data ?? []);
        if (data?.[0]) setVehicleId(data[0].id);
      });
  }, []);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid || !vehicleId) return;
    let zrusene = false;
    poslednaCenaPaliva(cid, vehicleId).then((c) => {
      if (!zrusene) setFuelPrice(c);
    });
    return () => {
      zrusene = true;
    };
  }, [vehicleId]);

  useEffect(() => {
    if (!tracking) return;
    const i = setInterval(() => setDistance(getCurrentDistanceKm()), 2000);
    return () => clearInterval(i);
  }, [tracking]);

  async function start() {
    if (!vehicleId) return toast.error("Vyberte vozidlo");
    const r = await startTracking();
    if (!r.ok) return toast.error(r.error ?? "GPS sa nepodarilo spustiť");
    setTracking(true);
    toast.success("GPS sledovanie spustené");
  }

  async function stop() {
    const result = await stopTracking();
    setTracking(false);
    const cid = getActiveCompanyId();
    if (!cid) return;
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    const consumption = vehicle?.consumption_l_100km
      ? (result.distance_km * Number(vehicle.consumption_l_100km)) / 100
      : null;
    const { data, error } = await supabase
      .from("trips")
      .insert({
        company_id: cid,
        vehicle_id: vehicleId,
        trip_date: new Date().toISOString().slice(0, 10),
        purpose: purpose || "GPS jazda",
        start_odometer: 0,
        end_odometer: result.distance_km,
        distance_km: result.distance_km,
        fuel_consumption: consumption,
        fuel_price: fuelPrice,
        job_id: jobId || null,
        route: trasaDoPolyline(result.points),
        note: `GPS: ${result.duration_min} min, ${result.points.length} bodov`,
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    toast.success(`Jazda uložená (${result.distance_km} km)`);
    if (data) navigate({ to: "/jazdy" });
  }

  return (
    <>
      <PageHeader title="GPS jazda" description="Automatický záznam trasy" />
      <PageBody>
        <div className="mx-auto max-w-md space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <label className="block text-sm">
              Vozidlo
              <select
                disabled={tracking}
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} {v.license_plate ? `(${v.license_plate})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Účel cesty
              <input
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <JobPicker value={jobId} onChange={setJobId} disabled={tracking} />
            {fuelPrice != null && (
              <div className="text-xs text-muted-foreground">
                Cena PHM {fuelPrice.toFixed(3)} €/l z posledného tankovania.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <div className="text-5xl font-bold tabular-nums">
              {distance.toFixed(2)} <span className="text-2xl text-muted-foreground">km</span>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {tracking ? "Nahrávam…" : "Pripravené"}
            </div>
          </div>

          {!tracking ? (
            <button
              onClick={start}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-base font-medium text-primary-foreground hover:opacity-90"
            >
              <Play className="h-5 w-5" /> Spustiť sledovanie
            </button>
          ) : (
            <button
              onClick={stop}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive px-6 py-4 text-base font-medium text-destructive-foreground hover:opacity-90"
            >
              <Square className="h-5 w-5" /> Ukončiť a uložiť
            </button>
          )}
        </div>
      </PageBody>
    </>
  );
}
