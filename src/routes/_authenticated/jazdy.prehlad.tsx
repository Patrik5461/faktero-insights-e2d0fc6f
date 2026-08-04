import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Car, Route as RouteIcon, Fuel, Wallet, Gauge, Briefcase, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/jazdy/prehlad")({
  head: () => ({ meta: [{ title: "Prehľad jázd — Faktero" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    vehicle_id: typeof s.vehicle_id === "string" && s.vehicle_id ? s.vehicle_id : undefined,
  }),
  component: OverviewPage,
});

function OverviewPage() {
  const { vehicle_id } = Route.useSearch();
  const navigate = useNavigate({ from: "/jazdy/prehlad" });
  const [trips, setTrips] = useState<any[]>([]);
  const [fuel, setFuel] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const from = `${year}-01-01`;
    const to = `${year + 1}-01-01`;
    let tQ = supabase
      .from("trips")
      .select("*")
      .eq("company_id", cid)
      .gte("trip_date", from)
      .lt("trip_date", to);
    let fQ = supabase
      .from("fuel_records")
      .select("*")
      .eq("company_id", cid)
      .gte("fuel_date", from)
      .lt("fuel_date", to);
    if (vehicle_id) {
      tQ = tQ.eq("vehicle_id", vehicle_id);
      fQ = fQ.eq("vehicle_id", vehicle_id);
    }
    Promise.all([
      tQ,
      fQ,
      supabase
        .from("vehicles")
        .select("id, name, license_plate")
        .eq("company_id", cid)
        .order("name"),
    ]).then(([t, f, v]) => {
      setTrips(t.data ?? []);
      setFuel(f.data ?? []);
      setVehicles(v.data ?? []);
    });
  }, [year, vehicle_id]);

  const vehicleMap = useMemo(() => {
    const m: any = {};
    vehicles.forEach((v) => {
      m[v.id] = v;
    });
    return m;
  }, [vehicles]);

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const thisMonth = trips.filter((t) => t.trip_date >= monthStart);
  const kmMonth = thisMonth.reduce((a, t) => a + Number(t.distance_km), 0);
  const kmYear = trips.reduce((a, t) => a + Number(t.distance_km), 0);
  const fuelLiters = fuel.reduce((a, f) => a + Number(f.liters), 0);
  const fuelCost = fuel.reduce((a, f) => a + Number(f.total_amount), 0);

  // Avg speed across trips that have duration
  const withDur = trips.filter((t) => Number(t.duration_seconds) > 0);
  const avgSpeed = withDur.length
    ? withDur.reduce((a, t) => a + Number(t.distance_km), 0) /
      (withDur.reduce((a, t) => a + Number(t.duration_seconds), 0) / 3600)
    : 0;
  // Business vs private (purpose containing "súkrom" = private)
  const privKm = trips
    .filter((t) => /súkrom/i.test(String(t.purpose ?? "")))
    .reduce((a, t) => a + Number(t.distance_km), 0);
  const bizKm = kmYear - privKm;
  const tripCount = trips.length;

  // Per-vehicle
  const byVehicle = useMemo(() => {
    const m: Record<string, { trips: number; km: number; cost: number; liters: number }> = {};
    trips.forEach((t) => {
      const k = t.vehicle_id;
      m[k] = m[k] ?? { trips: 0, km: 0, cost: 0, liters: 0 };
      m[k].trips += 1;
      m[k].km += Number(t.distance_km);
    });
    fuel.forEach((f) => {
      const k = f.vehicle_id;
      m[k] = m[k] ?? { trips: 0, km: 0, cost: 0, liters: 0 };
      m[k].cost += Number(f.total_amount);
      m[k].liters += Number(f.liters);
    });
    return m;
  }, [trips, fuel]);

  // Monthly
  const byMonth = useMemo(() => {
    const m: Record<string, { km: number; trips: number; cost: number; liters: number }> = {};
    for (let i = 1; i <= 12; i++) {
      const k = String(i).padStart(2, "0");
      m[k] = { km: 0, trips: 0, cost: 0, liters: 0 };
    }
    trips.forEach((t) => {
      const k = t.trip_date.slice(5, 7);
      if (m[k]) {
        m[k].km += Number(t.distance_km);
        m[k].trips += 1;
      }
    });
    fuel.forEach((f) => {
      const k = f.fuel_date.slice(5, 7);
      if (m[k]) {
        m[k].cost += Number(f.total_amount);
        m[k].liters += Number(f.liters);
      }
    });
    return m;
  }, [trips, fuel]);

  return (
    <>
      <PageHeader
        title="Prehľad a reporty"
        description="Mesačné a ročné súhrny jázd, spotreby a nákladov."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={vehicle_id ?? ""}
              onChange={(e) =>
                navigate({
                  search: (prev: any) => ({ ...prev, vehicle_id: e.target.value || undefined }),
                })
              }
              className="rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="">Všetky vozidlá</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.license_plate ? ` — ${v.license_plate}` : ""}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              {[0, 1, 2].map((d) => {
                const y = new Date().getFullYear() - d;
                return (
                  <option key={y} value={y}>
                    {y}
                  </option>
                );
              })}
            </select>
          </div>
        }
      />
      <PageBody>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={RouteIcon} label={`Celkové km ${year}`} value={`${kmYear.toFixed(1)} km`} />
          <Stat icon={Car} label="Počet jázd" value={`${tripCount}`} />
          <Stat
            icon={Gauge}
            label="Priemerná rýchlosť"
            value={avgSpeed > 0 ? `${avgSpeed.toFixed(0)} km/h` : "—"}
          />
          <Stat icon={RouteIcon} label="Km tento mesiac" value={`${kmMonth.toFixed(1)} km`} />
          <Stat icon={Briefcase} label="Služobné km" value={`${bizKm.toFixed(1)} km`} />
          <Stat icon={User} label="Súkromné km" value={`${privKm.toFixed(1)} km`} />
          <Stat icon={Fuel} label={`Spotreba ${year}`} value={`${fuelLiters.toFixed(1)} l`} />
          <Stat icon={Wallet} label={`Náklady PHM ${year}`} value={`${fuelCost.toFixed(2)} €`} />
        </div>

        <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide">
          Mesačný report {year}
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Mesiac</th>
                <th className="p-3 text-right">Jazdy</th>
                <th className="p-3 text-right">Km</th>
                <th className="p-3 text-right">PHM (l)</th>
                <th className="p-3 text-right">Náklady (€)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Object.entries(byMonth).map(([m, v]) => (
                <tr key={m}>
                  <td className="p-3">
                    {m}/{year}
                  </td>
                  <td className="p-3 text-right tabular-nums">{v.trips}</td>
                  <td className="p-3 text-right tabular-nums">{v.km.toFixed(1)}</td>
                  <td className="p-3 text-right tabular-nums">{v.liters.toFixed(1)}</td>
                  <td className="p-3 text-right tabular-nums">{v.cost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide">Podľa vozidla</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Vozidlo</th>
                <th className="p-3 text-right">Jazdy</th>
                <th className="p-3 text-right">Km</th>
                <th className="p-3 text-right">PHM (l)</th>
                <th className="p-3 text-right">Náklady (€)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Object.entries(byVehicle).map(([id, v]) => (
                <tr key={id}>
                  <td className="p-3">
                    {vehicleMap[id]?.name ?? "—"}{" "}
                    <span className="text-xs text-muted-foreground">
                      {vehicleMap[id]?.license_plate}
                    </span>
                  </td>
                  <td className="p-3 text-right tabular-nums">{v.trips}</td>
                  <td className="p-3 text-right tabular-nums">{v.km.toFixed(1)}</td>
                  <td className="p-3 text-right tabular-nums">{v.liters.toFixed(1)}</td>
                  <td className="p-3 text-right tabular-nums">{v.cost.toFixed(2)}</td>
                </tr>
              ))}
              {Object.keys(byVehicle).length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    Žiadne dáta.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageBody>
    </>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
