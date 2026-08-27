import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Map as MapIcon, Route as RouteIcon, Satellite } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { trasa, trvanieJazdy } from "@/lib/faktero/adresa-jazdy";
import { MapaTrasy } from "@/components/faktero/MapaTrasy";
import { MobilObrazovka, Pracujem } from "./MobilChrome";

import { jeSukromna } from "@/lib/faktero/trip-format";
/**
 * História jázd jedného vozidla.
 *
 * Ukazuje všetko, čo o jazde vieme — vlastné merania z telefónu aj jazdy
 * natiahnuté z GPS jednotky (Commander, Tesla). Zámerne v jednom zozname:
 * pre vodiča je to tá istá kniha jázd a odkiaľ záznam prišiel je len poznámka
 * na okraji.
 *
 * Opravovať čísla jazdy treba na webe — na telefóne sa dá ľahko preklepnúť a
 * kniha jázd je podklad pre daňový výdavok. **Služobná/súkromná** je výnimka:
 * nie je to prepis čísla, ale voľba z dvoch možností, a človek si na ňu
 * spomenie práve vtedy, keď vystúpi z auta. Preto sa mení priamo tu.
 */

type Jazdenka = {
  id: string;
  trip_date: string;
  start_location: string | null;
  end_location: string | null;
  purpose: string | null;
  distance_km: number | null;
  duration_seconds: number | null;
  average_speed_kmh: number | null;
  max_speed_kmh: number | null;
  driver_name: string | null;
  start_time: string | null;
  external_source: string | null;
  route: string | null;
  classification: string | null;
};

/*
  Koľko jázd sa naťahuje naraz. Vozidlo s GPS jednotkou ich má aj dvetisíc a
  všetky by sa do telefónu ťahali dlho — staršie si človek dopýta tlačidlom.
*/
const STRANA = 200;

function dotazJazd(companyId: string, vehicleId: string, od: number) {
  return (
    supabase
      .from("trips")
      .select(
        "id, trip_date, start_location, end_location, purpose, distance_km, duration_seconds, average_speed_kmh, max_speed_kmh, driver_name, start_time, external_source, route, classification",
      )
      .eq("company_id", companyId)
      .eq("vehicle_id", vehicleId)
      // Tri stĺpce: GPS jednotka pošle za deň aj desať jázd, samotný dátum ich
      // nezoradí — a bez poslednej istoty by sa pri dopytovaní staršej strany
      // mohli rovnaké dvojice preskupiť a jazda vypadnúť alebo prísť dvakrát.
      .order("trip_date", { ascending: false })
      .order("start_time", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .range(od, od + STRANA - 1)
  );
}

function naJazdenky(data: { distance_km: number | string | null }[]): Jazdenka[] {
  return data.map((t) => ({
    ...t,
    distance_km: t.distance_km === null ? null : Number(t.distance_km),
  })) as Jazdenka[];
}

const ZDROJE: Record<string, string> = {
  commander: "Commander",
  tesla: "Tesla",
};

function km(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 1 }).format(v)} km`;
}

/**
 * Rýchlosť do riadku jazdy — priemer a v zátvorke maximum.
 *
 * Ručne zapísaná jazda rýchlosť nemá a nikdy mať nebude; vtedy sa nepíše nič,
 * aby v knihe jázd nestálo „0 km/h" pri ceste, ktorá sa naozaj šla.
 */
function rychlost(priemer: number | null, max: number | null): string | null {
  const p = priemer === null ? null : Number(priemer);
  const m = max === null ? null : Number(max);
  if (!p && !m) return null;
  if (p && m) return `Ø ${Math.round(p)} km/h (max ${Math.round(m)})`;
  return p ? `Ø ${Math.round(p)} km/h` : `max ${Math.round(m!)} km/h`;
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
  /* Či je na serveri ešte niečo staršie, než čo držíme v ruke. */
  const [jeVsetko, setJeVsetko] = useState(true);
  const [nacitavamStarsie, setNacitavamStarsie] = useState(false);
  /* Mapa sa otvára ťuknutím na jazdu — na malej obrazovke sa nezmestia obe naraz. */
  const [otvorena, setOtvorena] = useState<string | null>(null);
  /** Ktorej jazde sa práve prepisuje charakter — nech sa nedá ťuknúť dvakrát. */
  const [meni, setMeni] = useState<string | null>(null);

  /*
    Zmena charakteru jazdy. Zapisuje sa hneď a zoznam sa prekreslí bez
    načítania — človek stojí pri aute a čakať na odpoveď servera, aby videl,
    čo si klikol, nemá dôvod. Keď zápis zlyhá, hodnota sa vráti späť; tichá
    zmena, ktorá sa neuložila, je pri podklade pre daňový výdavok horšia než
    hlásenie o chybe.
  */
  async function zmenCharakter(id: string, na: "business" | "private") {
    const povodne = (jazdy ?? []).find((j) => j.id === id)?.classification ?? "business";
    if (povodne === na) return;
    setMeni(id);
    setJazdy((xs) => (xs ?? []).map((j) => (j.id === id ? { ...j, classification: na } : j)));
    const { error } = await supabase
      .from("trips")
      .update({ classification: na })
      .eq("id", id)
      .eq("company_id", firma.id);
    setMeni(null);
    if (error) {
      setJazdy((xs) =>
        (xs ?? []).map((j) => (j.id === id ? { ...j, classification: povodne } : j)),
      );
      toast.error(error.message);
      return;
    }
    toast.success(na === "private" ? "Označená ako súkromná." : "Označená ako služobná.");
  }

  useEffect(() => {
    let zrusene = false;
    dotazJazd(firma.id, vozidlo.id, 0)
      // Bez siete dotaz vyhodí výnimku; bez tohto by sa história nikdy nedočkala.
      .then(
        (r) => r,
        (e) => ({ data: null, error: e as any }),
      )
      .then(async ({ data, error }) => {
        if (zrusene) return;
        const { ulozJazdy, jazdyZPamate, zoradJazdy, ulozDoPamate, zPamate } =
          await import("@/lib/mobile/jazdy-lokalne");
        const kluc = `jazdy:${vozidlo.id}`;

        if (error || !data) {
          // Bez pripojenia sa história vezme z telefónu. Prázdna kniha jázd v
          // aute je horšia než mierne zastaraná.
          const zIndexedDb = (await jazdyZPamate(firma.id)).filter(
            (j) => j.vehicle_id === vozidlo.id,
          );
          const zalozne = zIndexedDb.length
            ? zIndexedDb
            : ((await zPamate<any[]>(kluc))?.hodnota ?? []);
          if (zrusene) return;
          if (zalozne.length === 0 && error) toast.error(error.message);
          setJazdy(zoradJazdy(zalozne as any) as unknown as Jazdenka[]);
          // Z telefónu je to všetko, čo máme; dopytovať sa nie je kde.
          setJeVsetko(true);
          return;
        }

        const jazdenky = naJazdenky(data);
        setJazdy(jazdenky);
        setJeVsetko(jazdenky.length < STRANA);
        // Do natívneho úložiska ide skrátený zoznam — prehliadačové úložiská
        // vo WebView reštart appky neprežili.
        void ulozDoPamate(
          kluc,
          jazdenky.slice(0, STRANA).map((j: any) => ({
            ...j,
            company_id: firma.id,
            vehicle_id: vozidlo.id,
          })),
        );
        void ulozJazdy(
          firma.id,
          jazdenky.map((j: any) => ({
            ...j,
            company_id: firma.id,
            vehicle_id: vozidlo.id,
            distance_km: Number(j.distance_km ?? 0),
          })),
        );
      });
    return () => {
      zrusene = true;
    };
  }, [firma.id, vozidlo.id]);

  async function nacitajStarsie() {
    if (nacitavamStarsie || !jazdy) return;
    setNacitavamStarsie(true);
    const { data, error } = await dotazJazd(firma.id, vozidlo.id, jazdy.length).then(
      (r) => r,
      (e) => ({ data: null, error: e as { message?: string } }),
    );
    setNacitavamStarsie(false);
    if (error || !data) {
      toast.error(error?.message ?? "Staršie jazdy sa nepodarilo načítať.");
      return;
    }
    const dalsie = naJazdenky(data);
    setJeVsetko(dalsie.length < STRANA);
    /* Zhoda podľa `id`: keď medzitým pribudne jazda, strany sa o riadok posunú. */
    setJazdy((s) => {
      const uz = new Set((s ?? []).map((j) => j.id));
      return [...(s ?? []), ...dalsie.filter((j) => !uz.has(j.id))];
    });
    const { ulozJazdy } = await import("@/lib/mobile/jazdy-lokalne");
    void ulozJazdy(
      firma.id,
      dalsie.map((j: any) => ({
        ...j,
        company_id: firma.id,
        vehicle_id: vozidlo.id,
        distance_km: Number(j.distance_km ?? 0),
      })),
    );
  }

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
              Spolu {jeVsetko ? "za celú históriu" : `za posledných ${jazdy.length} jázd`}
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
                        // Rýchlosť len keď ju jazda naozaj má — dopisovať „0 km/h"
                        // k ručne zapísanej jazde by bola nepravda.
                        rychlost(j.average_speed_kmh, j.max_speed_kmh),
                        j.driver_name?.trim() || null,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      return (
                        <div key={j.id} className={i > 0 ? "border-t border-border/70" : ""}>
                          <div
                            role="button"
                            aria-expanded={otvorena === j.id}
                            onClick={() => setOtvorena((o) => (o === j.id ? null : j.id))}
                            className="flex items-start gap-3 px-4 py-3.5"
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
                                {/* Označuje sa len súkromná — služobná je bežný
                                    stav a odznak pri každej jazde by nič nepovedal. */}
                                {jeSukromna(j.classification) && (
                                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    Súkromná
                                  </span>
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
                            <div className="shrink-0 text-right">
                              <div className="text-[15px] font-semibold tabular-nums">
                                {km(j.distance_km)}
                              </div>
                              {j.route && (
                                <MapIcon className="ml-auto mt-1 h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                          {otvorena === j.id && (
                            <div className="space-y-3 px-4 pb-3.5">
                              <div>
                                <div className="mb-1.5 text-[12px] text-muted-foreground">
                                  Charakter jazdy
                                </div>
                                <div className="inline-flex rounded-xl border border-border p-0.5">
                                  {(
                                    [
                                      ["business", "Služobná"],
                                      ["private", "Súkromná"],
                                    ] as const
                                  ).map(([kod, popis]) => {
                                    const je = jeSukromna(j.classification)
                                      ? kod === "private"
                                      : kod === "business";
                                    return (
                                      <button
                                        key={kod}
                                        disabled={meni === j.id}
                                        onClick={(e) => {
                                          // Bez toho by klik zložil práve otvorený riadok.
                                          e.stopPropagation();
                                          void zmenCharakter(j.id, kod);
                                        }}
                                        className={`min-h-[36px] rounded-lg px-3 text-[13px] disabled:opacity-60 ${
                                          je
                                            ? "bg-primary text-primary-foreground font-medium"
                                            : "text-muted-foreground"
                                        }`}
                                      >
                                        {popis}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              {j.route && <MapaTrasy route={j.route} vyska={220} />}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Kým je na serveri ešte niečo staršie, treba to vedieť dopýtať —
              inak sa zoznam tvári úplný a pritom končí na dvestej jazde. */}
          {!jeVsetko && (
            <button
              type="button"
              onClick={nacitajStarsie}
              disabled={nacitavamStarsie}
              className="mt-5 w-full select-none rounded-2xl border border-border/70 bg-card py-3 text-[14px] font-medium text-primary shadow-[var(--shadow-card)] disabled:opacity-60"
            >
              {nacitavamStarsie ? "Načítavam…" : "Načítať staršie jazdy"}
            </button>
          )}
        </>
      )}
    </MobilObrazovka>
  );
}
