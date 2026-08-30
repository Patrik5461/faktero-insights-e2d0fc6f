import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Map as MapIcon, Route as RouteIcon, Satellite, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { trasa, trvanieJazdy } from "@/lib/faktero/adresa-jazdy";
import { MapaTrasy } from "@/components/faktero/MapaTrasy";
import { MobilObrazovka, Pracujem } from "./MobilChrome";

import { jeSukromna, jeSukromnaJazda } from "@/lib/faktero/trip-format";
import { usePreklad } from "@/lib/mobile/preklady/hook";
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

function km(v: number | null, loc: string): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${new Intl.NumberFormat(loc, { maximumFractionDigits: 1 }).format(v)} km`;
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

function nazovMesiaca(kluc: string, loc: string): string {
  const [r, m] = kluc.split("-").map(Number);
  return new Date(r, (m || 1) - 1, 1).toLocaleDateString(loc, {
    month: "long",
    year: "numeric",
  });
}

function den(iso: string, loc: string): string {
  const [r, m, d] = iso.split("-").map(Number);
  return new Date(r, (m || 1) - 1, d || 1).toLocaleDateString(loc, {
    day: "numeric",
    month: "numeric",
  });
}

function cas(iso: string | null, loc: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
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
  const { t, locale: loc } = usePreklad();
  const [otvorena, setOtvorena] = useState<string | null>(null);
  /** Ktorej jazde sa práve prepisuje charakter — nech sa nedá ťuknúť dvakrát. */
  const [meni, setMeni] = useState<string | null>(null);
  /** Jazda čakajúca na potvrdenie zmazania a jazda, ktorá sa práve maže. */
  const [potvrdZmazanie, setPotvrdZmazanie] = useState<string | null>(null);
  const [mazem, setMazem] = useState<string | null>(null);

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
    const hlaska = t(na === "private" ? "jazdy.oznacenaSukromna" : "jazdy.oznacenaSluzobna");
    toast.success(hlaska);
  }

  /*
    Zmazanie jazdy.

    Do knihy jázd sa občas dostane niečo, čo tam nepatrí — appka rozpozná cestu
    autobusom alebo sa meranie spustí omylom. Označiť to za súkromné nestačí:
    v súkromných kilometroch by potom svietila cesta, ktorá sa nikdy nekonala.

    Mazať smie len správca firmy — tak to má nastavené databáza. Kontroluje sa
    počet zmazaných riadkov, lebo pri zakázanom riadku Postgres chybu nevráti,
    len nezmaže nič — a appka by tvrdila, že jazda je preč, hoci tam ostala.
  */
  async function zmazJazdu(id: string) {
    setMazem(id);
    const { data, error } = await supabase
      .from("trips")
      .delete()
      .eq("id", id)
      .eq("company_id", firma.id)
      .select("id");
    setMazem(null);
    if (error) return toast.error(error.message);
    if (!data?.length) return toast.error(t("jazdy.mazeLenSpravca"));

    setJazdy((xs) => (xs ?? []).filter((j) => j.id !== id));
    setOtvorena(null);
    setPotvrdZmazanie(null);
    // Aj z telefónu — inak sa jazda vráti pri prvom otvorení bez signálu.
    try {
      const { zmazJazdu: zmazLokalne } = await import("@/lib/mobile/jazdy-lokalne");
      await zmazLokalne(id);
    } catch {
      /* lokálna kópia je len vyrovnávacia pamäť, chyba tu nič nemení */
    }
    toast.success(t("jazdy.zmazana"));
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
      toast.error(error?.message ?? t("jazdy.chybaStarsich"));
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

  /*
    Súkromné kilometre sa z celkového súčtu nevyberajú — kniha jázd je kniha
    celého vozidla a tachometer nerozlišuje. Musí však byť vidieť, koľko
    z toho do daňového výdavku nepatrí. Riadok sa kreslí len keď súkromná
    jazda naozaj je: pri firemnom aute je to výnimka a stála nula by len
    zaberala miesto.
  */
  const sukromneKm = useMemo(
    () => (jazdy ?? []).filter(jeSukromnaJazda).reduce((s, j) => s + (j.distance_km ?? 0), 0),
    [jazdy],
  );

  if (jazdy === null) return <Pracujem text={t("jazdy.nacitavam")} />;

  return (
    <MobilObrazovka
      title={vozidlo.name}
      subtitle={vozidlo.license_plate ?? firma.name}
      onBack={onSpat}
    >
      {jazdy.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <RouteIcon className="mb-3 h-10 w-10 text-app-text-2/50" />
          <p className="text-sm font-medium">{t("jazdy.ziadne")}</p>
          <p className="mt-1 max-w-xs text-[13px] text-app-text-2">
            {t("jazdy.prvaPribudne")}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-app border border-app-ramik bg-app-karta p-4 shadow-app">
            <div className="text-[13px] text-app-text-2">
              {jeVsetko
                ? t("jazdy.spoluCelaHistoria")
                : t("jazdy.spoluPoslednych", { pocet: jazdy.length })}
            </div>
            <div className="mt-0.5 text-[26px] font-semibold leading-none tabular-nums">
              {km(spolu, loc)}
            </div>
            {sukromneKm > 0 && (
              <div className="mt-1.5 text-[13px] text-app-text-2">
                {t("jazdy.ztohoSukromne")}{" "}
                <span className="font-medium tabular-nums text-app-text">
                  {km(sukromneKm, loc)}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-5">
            {mesiace.map(([kluc, riadky]) => {
              const suma = riadky.reduce((s, j) => s + (j.distance_km ?? 0), 0);
              return (
                <div key={kluc}>
                  <div className="mb-2 flex items-baseline justify-between px-1">
                    <h2 className="text-[13px] font-semibold uppercase tracking-wide text-app-text-2">
                      {nazovMesiaca(kluc, loc)}
                    </h2>
                    <span className="text-[13px] font-medium tabular-nums text-app-text-2">
                      {km(suma, loc)}
                    </span>
                  </div>
                  <div className="overflow-hidden rounded-app border border-app-ramik bg-app-karta shadow-app">
                    {riadky.map((j, i) => {
                      const kam = trasa(j.start_location, j.end_location);
                      const podnadpis = [
                        den(j.trip_date, loc),
                        cas(j.start_time, loc),
                        trvanieJazdy(j.duration_seconds),
                        // Rýchlosť len keď ju jazda naozaj má — dopisovať „0 km/h"
                        // k ručne zapísanej jazde by bola nepravda.
                        rychlost(j.average_speed_kmh, j.max_speed_kmh),
                        j.driver_name?.trim() || null,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      return (
                        <div key={j.id} className={i > 0 ? "border-t border-app-ramik" : ""}>
                          <div
                            role="button"
                            aria-expanded={otvorena === j.id}
                            onClick={() => setOtvorena((o) => (o === j.id ? null : j.id))}
                            className="flex items-start gap-3 px-4 py-3.5"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-[15px] font-medium leading-tight">
                                  {kam ?? j.purpose?.trim() ?? t("jazdy.jazda")}
                                </span>
                                {j.external_source && (
                                  <Satellite
                                    className="h-3.5 w-3.5 shrink-0 text-app-text-2"
                                    aria-label={ZDROJE[j.external_source] ?? j.external_source}
                                  />
                                )}
                                {/* Označuje sa len súkromná — služobná je bežný
                                    stav a odznak pri každej jazde by nič nepovedal. */}
                                {jeSukromna(j.classification) && (
                                  <span className="shrink-0 rounded-full bg-app-pozadie px-1.5 py-0.5 text-[10px] font-medium text-app-text-2">
                                    {t("jazdy.sukromna")}
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 truncate text-[13px] text-app-text-2">
                                {podnadpis}
                              </div>
                              {kam && j.purpose?.trim() && (
                                <div className="truncate text-[13px] text-app-text-2">
                                  {j.purpose.trim()}
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-[15px] font-semibold tabular-nums">
                                {km(j.distance_km, loc)}
                              </div>
                              {j.route && (
                                <MapIcon className="ml-auto mt-1 h-3.5 w-3.5 text-app-text-2" />
                              )}
                            </div>
                          </div>
                          {otvorena === j.id && (
                            <div className="space-y-3 px-4 pb-3.5">
                              <div>
                                <div className="mb-1.5 text-[12px] text-app-text-2">
                                  {t("jazdy.charakter")}
                                </div>
                                <div className="inline-flex rounded-app-sm border border-app-ramik p-0.5">
                                  {(
                                    [
                                      ["business", t("jazdy.sluzobna")],
                                      ["private", t("jazdy.sukromna")],
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
                                            ? "bg-app-zelena text-white font-medium"
                                            : "text-app-text-2"
                                        }`}
                                      >
                                        {popis}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              {j.route && <MapaTrasy route={j.route} vyska={220} />}

                              {/* Zmazanie je na dve ťuknutia — jedno je pri
                                  podklade pre daňový výdavok málo. */}
                              {potvrdZmazanie === j.id ? (
                                <div className="flex items-center gap-2">
                                  <button
                                    disabled={mazem === j.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void zmazJazdu(j.id);
                                    }}
                                    className="min-h-[36px] rounded-app-sm bg-red-600 px-3 text-[13px] font-medium text-white disabled:opacity-60"
                                  >
                                    {mazem === j.id ? t("jazdy.mazem") : t("jazdy.naozajZmazat")}
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPotvrdZmazanie(null);
                                    }}
                                    className="min-h-[36px] px-2 text-[13px] text-app-text-2"
                                  >
                                    {t("spolocne.zrusit")}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPotvrdZmazanie(j.id);
                                  }}
                                  className="inline-flex min-h-[36px] items-center gap-1.5 text-[13px] text-app-text-2"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  {t("jazdy.zmazatJazdu")}
                                </button>
                              )}
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
              className="mt-5 w-full select-none rounded-app border border-app-ramik bg-app-karta py-3 text-[14px] font-medium text-app-zelena shadow-app disabled:opacity-60"
            >
              {nacitavamStarsie ? t("spolocne.nacitavam") : t("jazdy.nacitatStarsie")}
            </button>
          )}
        </>
      )}
    </MobilObrazovka>
  );
}
