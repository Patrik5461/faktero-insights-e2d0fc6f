import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Plus, Trash2, Car } from "lucide-react";
import { toast } from "sonner";
import { formatDuration, formatSpeed, sourceLabel } from "@/lib/faktero/trip-format";

export const Route = createFileRoute("/_authenticated/jazdy/")({
  head: () => ({ meta: [{ title: "Kniha jázd — Faktero" }] }),
  validateSearch: (s: Record<string, unknown>): { vehicle_id?: string } => ({
    vehicle_id: typeof s.vehicle_id === "string" && s.vehicle_id ? s.vehicle_id : undefined,
  }),
  component: TripsPage,
});

type Trip = {
  id: string;
  trip_date: string;
  driver_name: string | null;
  start_location: string | null;
  end_location: string | null;
  purpose: string | null;
  distance_km: number;
  vehicle_id: string;
  note: string | null;
  duration_seconds: number | null;
  average_speed_kmh: number | null;
  external_source: string | null;
};

/** Koľko jázd sa načíta naraz. */
const DAVKA = 500;

function TripsPage() {
  const { vehicle_id } = Route.useSearch();
  const navigate = useNavigate({ from: "/jazdy/" });
  const [rows, setRows] = useState<Trip[]>([]);
  const [vehicleList, setVehicleList] = useState<
    Array<{ id: string; name: string; license_plate: string | null }>
  >([]);
  const [loading, setLoading] = useState(true);
  // Kniha jázd je účtovný záznam, takže sa nesmie ticho končiť na strope. Načítava
  // sa po dávkach a vedľa nich je vidno, koľko jázd firma naozaj má.
  const [limit, setLimit] = useState(DAVKA);
  const [spolu, setSpolu] = useState<number | null>(null);

  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let q = supabase
      .from("trips")
      .select("*", { count: "exact" })
      .eq("company_id", cid)
      .order("trip_date", { ascending: false })
      .limit(limit);
    if (vehicle_id) q = q.eq("vehicle_id", vehicle_id);
    const [{ data: t, count }, { data: v }] = await Promise.all([
      q,
      supabase
        .from("vehicles")
        .select("id, name, license_plate")
        .eq("company_id", cid)
        .order("name"),
    ]);
    setRows((t ?? []) as any);
    setSpolu(count ?? null);
    setVehicleList((v ?? []) as any);
    setLoading(false);
  }
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [vehicle_id, limit]);

  // Pri prepnutí vozidla začíname zase od prvej dávky.
  useEffect(() => {
    setLimit(DAVKA);
  }, [vehicle_id]);

  const vehicles = useMemo(() => {
    const m: Record<string, { name: string; license_plate: string | null }> = {};
    vehicleList.forEach((x) => {
      m[x.id] = { name: x.name, license_plate: x.license_plate };
    });
    return m;
  }, [vehicleList]);

  async function del(id: string) {
    if (!confirm("Vymazať túto jazdu?")) return;
    const { error } = await supabase.from("trips").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Vymazané");
    load();
  }

  return (
    <>
      <PageHeader
        title="Kniha jázd"
        description="Záznamy služobných ciest s automatickým výpočtom km."
        action={
          <Link
            to="/jazdy/nova"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nová jazda
          </Link>
        }
      />
      <PageBody>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium">Vozidlo</label>
          <select
            value={vehicle_id ?? ""}
            onChange={(e) => {
              const v = e.target.value || undefined;
              navigate({ search: { vehicle_id: v } as any });
            }}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="">Všetky vozidlá</option>
            {vehicleList.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.license_plate ? ` — ${v.license_plate}` : ""}
              </option>
            ))}
          </select>
        </div>
        {loading && rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">Načítavam…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <Car className="mx-auto h-10 w-10 text-muted-foreground" />
            <div className="mt-3 text-sm text-muted-foreground">Zatiaľ žiadne jazdy.</div>
            <Link
              to="/jazdy/nova"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Pridať prvú jazdu
            </Link>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3">Dátum jazdy</th>
                    <th className="p-3">Vozidlo</th>
                    <th className="p-3">Vodič</th>
                    <th className="p-3">Odkiaľ</th>
                    <th className="p-3">Kam</th>
                    <th className="p-3 text-right">Počet km</th>
                    <th className="p-3 text-right">Priemerná rýchlosť</th>
                    <th className="p-3 text-right">Trvanie jazdy</th>
                    <th className="p-3">Typ jazdy</th>
                    <th className="p-3">Zdroj</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="p-3 whitespace-nowrap">{r.trip_date}</td>
                      <td className="p-3">
                        {vehicles[r.vehicle_id]?.name ?? "—"}{" "}
                        <span className="text-xs text-muted-foreground">
                          {vehicles[r.vehicle_id]?.license_plate}
                        </span>
                      </td>
                      <td className="p-3">{r.driver_name ?? "—"}</td>
                      <td className="p-3">{r.start_location ?? "—"}</td>
                      <td className="p-3">{r.end_location ?? "—"}</td>
                      <td className="p-3 text-right tabular-nums font-medium">
                        {Number(r.distance_km).toFixed(1)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatSpeed(r.distance_km, r.duration_seconds, r.average_speed_kmh)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatDuration(r.duration_seconds)}
                      </td>
                      <td className="p-3">{r.purpose ?? "—"}</td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {sourceLabel(r.external_source)}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => del(r.id)}
                          className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-2 md:hidden">
              {rows.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">
                        {r.trip_date} · {vehicles[r.vehicle_id]?.name ?? "—"}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground truncate">
                        {r.start_location ?? "—"} → {r.end_location ?? "—"}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>Trvanie: {formatDuration(r.duration_seconds)}</span>
                        <span>
                          Ø {formatSpeed(r.distance_km, r.duration_seconds, r.average_speed_kmh)}
                        </span>
                        {r.purpose && <span>{r.purpose}</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-bold tabular-nums">
                        {Number(r.distance_km).toFixed(1)} km
                      </div>
                      <button
                        onClick={() => del(r.id)}
                        className="mt-1 rounded p-1 text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
              <span>
                Zobrazených {rows.length}
                {spolu !== null && spolu > rows.length ? ` z ${spolu}` : ""} jázd
              </span>
              {spolu !== null && spolu > rows.length && (
                <button
                  onClick={() => setLimit((l) => l + DAVKA)}
                  disabled={loading}
                  className="rounded-md border border-border bg-card px-3 py-1.5 font-medium text-foreground hover:bg-secondary disabled:opacity-60"
                >
                  {loading ? "Načítavam…" : `Načítať ďalších ${Math.min(DAVKA, spolu - rows.length)}`}
                </button>
              )}
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
