import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Car, Play, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { poslednaCenaPaliva } from "@/lib/faktero/cena-paliva";
import { getCurrentDistanceKm, startTracking, stopTracking } from "@/lib/mobile/gps-tracker";
import { HlavneTlacidlo, MobilObrazovka, Pracujem } from "./MobilChrome";

/**
 * Záznam jazdy v telefóne.
 *
 * Kniha jázd je jediná agenda, ktorá naozaj patrí do auta — na webe ju nikto
 * v aute otvárať nebude. Preto je tu len to podstatné: vozidlo, účel a jedno
 * veľké tlačidlo štart/stop.
 *
 * Meranie beží, kým je appka na obrazovke. iOS bez povolenia polohy na pozadí
 * sledovanie po zhasnutí displeja zastaví — preto to stojí priamo na
 * obrazovke a nie je to prekvapenie až po príchode.
 */

type Vozidlo = { id: string; name: string; license_plate: string | null };

function trvanie(od: number): string {
  const minuty = Math.floor((Date.now() - od) / 60000);
  if (minuty < 60) return `${minuty} min`;
  return `${Math.floor(minuty / 60)} h ${minuty % 60} min`;
}

export function Jazda({
  firma,
  onSpat,
}: {
  firma: { id: string; name: string };
  onSpat: () => void;
}) {
  const [vozidla, setVozidla] = useState<Vozidlo[] | null>(null);
  const [vozidloId, setVozidloId] = useState("");
  const [ucel, setUcel] = useState("");
  const [bezi, setBezi] = useState(false);
  const [km, setKm] = useState(0);
  const [odkedy, setOdkedy] = useState<number | null>(null);
  const [ukladam, setUkladam] = useState(false);
  const cenaPaliva = useRef<number | null>(null);

  useEffect(() => {
    supabase
      .from("vehicles")
      .select("id, name, license_plate")
      .eq("company_id", firma.id)
      .eq("active", true)
      .order("name")
      .then(({ data }) => {
        setVozidla(data ?? []);
        if (data?.[0]) setVozidloId(data[0].id);
      });
  }, [firma.id]);

  /* Cena z posledného tankovania — bez nej nemá jazda náklad. */
  useEffect(() => {
    if (!vozidloId) return;
    let zrusene = false;
    poslednaCenaPaliva(firma.id, vozidloId).then((c) => {
      if (!zrusene) cenaPaliva.current = c;
    });
    return () => {
      zrusene = true;
    };
  }, [firma.id, vozidloId]);

  /* Kilometre naživo — inak nie je vidieť, či sa vôbec niečo meria. */
  useEffect(() => {
    if (!bezi) return;
    const t = setInterval(() => setKm(getCurrentDistanceKm()), 2000);
    return () => clearInterval(t);
  }, [bezi]);

  async function start() {
    if (!vozidloId) return toast.error("Vyberte vozidlo.");
    const r = await startTracking();
    if (!r.ok) return toast.error(r.error ?? "GPS sa nepodarilo spustiť.");
    setKm(0);
    setOdkedy(Date.now());
    setBezi(true);
  }

  async function stop() {
    setUkladam(true);
    const vysledok = await stopTracking();
    setBezi(false);
    try {
      const vozidlo = vozidla?.find((v) => v.id === vozidloId);
      const { data: plne } = await supabase
        .from("vehicles")
        .select("consumption_l_100km")
        .eq("id", vozidloId)
        .maybeSingle();
      const spotreba = plne?.consumption_l_100km
        ? (vysledok.distance_km * Number(plne.consumption_l_100km)) / 100
        : null;

      const { error } = await supabase.from("trips").insert({
        company_id: firma.id,
        vehicle_id: vozidloId,
        trip_date: new Date().toISOString().slice(0, 10),
        purpose: ucel.trim() || "GPS jazda",
        start_odometer: 0,
        end_odometer: vysledok.distance_km,
        distance_km: vysledok.distance_km,
        fuel_consumption: spotreba,
        fuel_price: cenaPaliva.current,
        note: `GPS: ${vysledok.duration_min} min, ${vysledok.points.length} bodov`,
      });
      if (error) throw new Error(error.message);
      toast.success(
        `Jazda uložená — ${vysledok.distance_km} km${vozidlo ? `, ${vozidlo.name}` : ""}`,
      );
      setUcel("");
      setKm(0);
      setOdkedy(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Jazdu sa nepodarilo uložiť.");
    } finally {
      setUkladam(false);
    }
  }

  if (vozidla === null) return <Pracujem text="Načítavam vozidlá…" />;
  if (ukladam) return <Pracujem text="Ukladám jazdu…" />;

  if (vozidla.length === 0) {
    return (
      <MobilObrazovka title="Jazda" subtitle={firma.name} onBack={onSpat}>
        <div className="grid place-items-center py-16 text-center">
          <Car className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium">Firma nemá žiadne vozidlo</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Vozidlo sa pridáva na webe v sekcii Vozidlá a tankovanie.
          </p>
        </div>
      </MobilObrazovka>
    );
  }

  return (
    <MobilObrazovka
      title={bezi ? "Jazda beží" : "Nová jazda"}
      subtitle={firma.name}
      onBack={bezi ? undefined : onSpat}
      footer={
        bezi ? (
          <HlavneTlacidlo onClick={stop}>Ukončiť a uložiť jazdu</HlavneTlacidlo>
        ) : (
          <HlavneTlacidlo onClick={start}>Začať jazdu</HlavneTlacidlo>
        )
      }
    >
      <div className="space-y-4">
        <div className="grid place-items-center rounded-2xl border border-border/70 bg-card px-4 py-8 shadow-[var(--shadow-card)]">
          <div className="text-[56px] font-semibold leading-none tabular-nums">
            {km.toFixed(1)}
            <span className="ml-2 text-[20px] font-normal text-muted-foreground">km</span>
          </div>
          <div className="mt-2 text-[14px] text-muted-foreground">
            {bezi && odkedy ? `beží ${trvanie(odkedy)}` : "meranie zatiaľ nebeží"}
          </div>
          <div
            className={`mt-4 grid h-16 w-16 place-items-center rounded-full ${
              bezi ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
            }`}
          >
            {bezi ? <Square className="h-7 w-7" /> : <Play className="h-7 w-7" />}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">Vozidlo</div>
          <div className="space-y-2">
            {vozidla.map((v) => (
              <button
                key={v.id}
                disabled={bezi}
                onClick={() => setVozidloId(v.id)}
                className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition disabled:opacity-60 ${
                  vozidloId === v.id
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "border-border/70 bg-card"
                }`}
              >
                <Car className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-[15px]">{v.name}</span>
                {v.license_plate && (
                  <span className="shrink-0 text-[13px] text-muted-foreground">
                    {v.license_plate}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-muted-foreground">
            Účel cesty
          </span>
          <input
            value={ucel}
            onChange={(e) => setUcel(e.target.value)}
            placeholder="napr. servis u odberateľa"
            disabled={bezi}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[16px] disabled:opacity-60"
          />
        </label>

        <p className="text-xs text-muted-foreground">
          Počas jazdy nechajte appku otvorenú — po zhasnutí displeja telefón meranie polohy zastaví
          a kilometre by sa doratali nesprávne.
        </p>
      </div>
    </MobilObrazovka>
  );
}
