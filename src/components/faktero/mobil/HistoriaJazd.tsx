import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Route as RouteIcon, Satellite } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { trasa, trvanieJazdy } from "@/lib/faktero/adresa-jazdy";
import { MobilObrazovka, Pracujem } from "./MobilChrome";

/**
 * História jázd jedného vozidla.
 *
 * Ukazuje všetko, čo o jazde vieme — vlastné merania z telefónu aj jazdy
 * natiahnuté z GPS jednotky (Commander, Tesla). Zámerne v jednom zozname:
 * pre vodiča je to tá istá kniha jázd a odkiaľ záznam prišiel je len poznámka
 * na okraji.
 *
 * Zoznam je na čítanie. Opravovať jazdu treba na webe — na telefóne sa dá
 * ľahko preklepnúť a kniha jázd je podklad pre daňový výdavok.
 */

type Jazdenka = {
  id: string;
  trip_date: string;
  start_location: string | null;
  end_location: string | null;
  purpose: string | null;
  distance_km: number | null;
  duration_seconds: number | null;
  driver_name: string | null;
  start_time: string | null;
  external_source: string | null;
};

const ZDROJE: Record<string, string> = {
  commander: "Commander",
  tesla: "Tesla",
};

function km(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 1 }).format(v)} km`;
}

function nazovMesiaca(kluc: string): string {
  const [r, m] = kluc.split("-").map(Number);
  return new Date(r, (m || 1) - 1, 1).toLocaleDateString("sk-SK", {
    month: "long",
    year: "numeric",
  });
}

function den(iso: string): string {
  const [r, m, d] = iso.split("-").map(Number);
  return new Date(r, (m || 1) - 1, d || 1).toLocaleDateString("sk-SK", {
    day: "numeric",
    month: "numeric",
  });
}

function cas(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
}

export function HistoriaJazd({
  firma,
  vozidlo,
  onSpat,
}: {
  firma: { id: string; name: string };
  vozidlo: { id: string; name: string; license_plate: string | null };
  onSpat: () => void;
}) {
  const [jazdy, setJazdy] = useState<Jazdenka[] | null>(null);

  useEffect(() => {
    let zrusene = false;
    supabase
      .from("trips")
      .select(
        "id, trip_date, start_location, end_location, purpose, distance_km, duration_seconds, driver_name, start_time, external_source",
      )
      .eq("company_id", firma.id)
      .eq("vehicle_id", vozidlo.id)
      // Dva stĺpce: GPS jednotka pošle za deň aj desať jázd a samotný dátum ich nezoradí.
      .order("trip_date", { ascending: false })
      .order("start_time", { ascending: false, nullsFirst: false })
      .limit(200)
      .then(({ data, error }) => {
        if (zrusene) return;
        if (error) toast.error(error.message);
        setJazdy(
          (data ?? []).map((t) => ({
            ...t,
            distance_km: t.distance_km === null ? null : Number(t.distance_km),
          })) as Jazdenka[],
        );
      });
    return () => {
      zrusene = true;
    };
  }, [firma.id, vozidlo.id]);

  const mesiace = useMemo(() => {
    const mapa = new Map<string, Jazdenka[]>();
    for (const j of jazdy ?? []) {
      const kluc = j.trip_date.slice(0, 7);
      if (!mapa.has(kluc)) mapa.set(kluc, []);
      mapa.get(kluc)!.push(j);
    }
    return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [jazdy]);

  const spolu = useMemo(() => (jazdy ?? []).reduce((s, j) => s + (j.distance_km ?? 0), 0), [jazdy]);

  if (jazdy === null) return <Pracujem text="Načítavam jazdy…" />;

  return (
    <MobilObrazovka
      title={vozidlo.name}
      subtitle={vozidlo.license_plate ?? firma.name}
      onBack={onSpat}
    >
      {jazdy.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <RouteIcon className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium">Zatiaľ žiadne jazdy</p>
          <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">
            Prvá pribudne po ukončení merania — alebo sa natiahne z GPS jednotky, keď je vozidlo
            prepojené.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-2xl border border-border/70 bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="text-[13px] text-muted-foreground">
              Spolu {jazdy.length === 200 ? "za posledných 200 jázd" : "za celú históriu"}
            </div>
            <div className="mt-0.5 text-[26px] font-semibold leading-none tabular-nums">
              {km(spolu)}
            </div>
          </div>

          <div className="space-y-5">
            {mesiace.map(([kluc, riadky]) => {
              const suma = riadky.reduce((s, j) => s + (j.distance_km ?? 0), 0);
              return (
                <div key={kluc}>
                  <div className="mb-2 flex items-baseline justify-between px-1">
                    <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {nazovMesiaca(kluc)}
                    </h2>
                    <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
                      {km(suma)}
                    </span>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[var(--shadow-card)]">
                    {riadky.map((j, i) => {
                      const kam = trasa(j.start_location, j.end_location);
                      const podnadpis = [
                        den(j.trip_date),
                        cas(j.start_time),
                        trvanieJazdy(j.duration_seconds),
                        j.driver_name?.trim() || null,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      return (
                        <div
                          key={j.id}
                          className={`flex items-start gap-3 px-4 py-3.5 ${
                            i > 0 ? "border-t border-border/70" : ""
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-[15px] font-medium leading-tight">
                                {kam ?? j.purpose?.trim() ?? "Jazda"}
                              </span>
                              {j.external_source && (
                                <Satellite
                                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                  aria-label={ZDROJE[j.external_source] ?? j.external_source}
                                />
                              )}
                            </div>
                            <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
                              {podnadpis}
                            </div>
                            {kam && j.purpose?.trim() && (
                              <div className="truncate text-[13px] text-muted-foreground">
                                {j.purpose.trim()}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 text-[15px] font-semibold tabular-nums">
                            {km(j.distance_km)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </MobilObrazovka>
  );
}
