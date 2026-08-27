import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Car, ChevronRight, Pause, Play, Plus, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { poslednaCenaPaliva } from "@/lib/faktero/cena-paliva";
import {
  getCurrentDistanceKm,
  isPaused,
  isTracking,
  pauseTracking,
  resumeTracking,
  startTracking,
  stopTracking,
  trackingStartedAt,
} from "@/lib/mobile/gps-tracker";
import {
  nacitajRozpoznaneJazdy,
  beziacaJazda,
  ukonciBeziacuJazdu,
  type BeziacaJazda,
  prepniDetekciu,
  stavDetekcie,
  ulozRozpoznanuJazdu,
  zahodRozpoznanuJazdu,
  vozidlaSCommanderom,
  nastavVozidloVNotifikacii,
  zosuladNastavenie,
} from "@/lib/mobile/auto-jazdy-sync";
import type { BufferedTrip, Classification } from "@faktero/drive-detector";
import { trasaDoPolyline } from "@/lib/faktero/polyline";
import {
  mojeVozidlo,
  zapamatajVozidlo,
  vozidloPreRozpoznanuJazdu,
} from "@/lib/mobile/moje-vozidlo";
import {
  ulozVozidla,
  vozidlaZPamate,
  pridajCakajucuJazdu,
  odosliCakajuceZapisy,
} from "@/lib/mobile/jazdy-lokalne";
import { MapaTrasy } from "@/components/faktero/MapaTrasy";
import { friendlyError } from "@/lib/faktero/plan-error";
import { HlavneTlacidlo, MobilObrazovka, Pracujem } from "./MobilChrome";
import { PrebiehaJazda } from "./PrebiehaJazda";
import { HistoriaJazd } from "./HistoriaJazd";

import { usePreklad } from "@/lib/mobile/preklady/hook";
/**
 * Záznam jazdy v telefóne.
 *
 * Kniha jázd je jediná agenda, ktorá naozaj patrí do auta — na webe ju nikto
 * v aute otvárať nebude. Preto je tu len to podstatné: vozidlo, účel a jedno
 * veľké tlačidlo štart/stop.
 *
 * Meria natívny plugin, ktorý vlastní polohu v celej appke. S povolením
 * „Vždy" beží meranie aj po zhasnutí displeja, bez neho ho iOS zastaví —
 * preto to stojí priamo na obrazovke a nie je to prekvapenie až po príchode.
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
  const { t, locale: loc } = usePreklad();
  const [vozidla, setVozidla] = useState<Vozidlo[] | null>(null);
  /** Zoznam vozidiel sa nedal zistiť — nie je signál a v telefóne nič nie je. */
  const [nezistene, setNezistene] = useState(false);
  const [vozidloId, setVozidloId] = useState("");
  const [ucel, setUcel] = useState("");
  const [bezi, setBezi] = useState(false);
  const [pauza, setPauza] = useState(false);
  const [typJazdy, setTypJazdy] = useState<Classification>("business");
  const [km, setKm] = useState(0);
  const [odkedy, setOdkedy] = useState<number | null>(null);
  const [ukladam, setUkladam] = useState(false);
  const [pridavam, setPridavam] = useState(false);
  const [historia, setHistoria] = useState<Vozidlo | null>(null);
  const [detekcia, setDetekcia] = useState<{
    dostupna: boolean;
    zapnuta: boolean;
    /** Prečo detekcia nemôže bežať, hoci je zapnutá. */
    prekazka?: string | null;
  }>({ dostupna: false, zapnuta: false, prekazka: null });
  /** Rozbalené vysvetlenie pod „?" pri prepínači detekcie. */
  const [popisDetekcie, setPopisDetekcie] = useState(false);
  // Autá, ktorých jazdy ťahá Commander — tie telefón merať nemá, prišli by dvakrát.
  const [commander, setCommander] = useState<Set<string>>(new Set());
  const [cakajuce, setCakajuce] = useState<BufferedTrip[]>([]);
  /*
    Jazda, ktorú spustila detekcia sama. Obrazovka dovtedy čítala len stav
    ručného merania, takže rozpoznanú jazdu tu nebolo ani vidieť — nedala sa
    ukončiť ani zahodiť a človeku ostávalo čakať, kým ju motor po piatich
    minútach státia zastaví sám.
  */
  const [rozpoznana, setRozpoznana] = useState<BeziacaJazda | null>(null);
  const [ukoncujem, setUkoncujem] = useState(false);
  const [vyberAuta, setVyberAuta] = useState<Record<string, string>>({});
  const [vybavujem, setVybavujem] = useState<string | null>(null);
  const [trasaOtvorena, setTrasaOtvorena] = useState<string | null>(null);
  const cenaPaliva = useRef<number | null>(null);

  async function nacitajVozidla(vyberId?: string) {
    // Bez siete dotaz nevráti chybu, ale vyhodí výnimku — a nezachytená by
    // nechala obrazovku navždy na „Načítavam vozidlá…".
    const { data, error } = await supabase
      .from("vehicles")
      .select("id, name, license_plate")
      .eq("company_id", firma.id)
      .eq("active", true)
      .order("name")
      .then(
        (r) => r,
        (e) => ({ data: null, error: e as any }),
      );

    // Bez signálu sa siahne po poslednom známom zozname — inak by kniha jázd
    // v aute, teda presne tam, kde je potrebná, ostala prázdna.
    const zoznam = error || !data ? await vozidlaZPamate(firma.id) : data;
    // Keď ani v telefóne nič nie je, nevieme, či firma vozidlá má — a tvrdiť,
    // že nemá, by človeka v aute poslalo zakladať auto, ktoré už existuje.
    if ((error || !data) && !zoznam.length) {
      const { isOnline } = await import("@/lib/mobile/offline-queue");
      setNezistene(!(await isOnline()));
    } else {
      setNezistene(false);
    }
    if (!error && data)
      void ulozVozidla(
        firma.id,
        data.map((v) => ({ ...v, company_id: firma.id })),
      );
    setVozidla(zoznam as Vozidlo[]);
    // Predvolí sa auto, ktorým sa z tohto telefónu jazdí; až potom prvé v zozname.
    const zapamatane = mojeVozidlo(firma.id);
    const vyber =
      vyberId ??
      (zapamatane && zoznam.some((v) => v.id === zapamatane) ? zapamatane : zoznam[0]?.id);
    if (vyber) setVozidloId(vyber);
  }

  useEffect(() => {
    nacitajVozidla();
    // eslint-disable-next-line
  }, [firma.id]);

  /*
    Z obrazovky sa dá odísť aj počas jazdy a meranie beží ďalej — vlastní ho
    modul, nie táto obrazovka. Po návrate sa preto stav prevezme od neho; inak
    by tu stálo „meranie zatiaľ nebeží", hoci telefón práve nahráva.
  */
  useEffect(() => {
    const merania = isTracking();
    const pozastavene = isPaused();
    if (!merania && !pozastavene) return;
    setBezi(merania);
    setPauza(pozastavene);
    setKm(getCurrentDistanceKm());
    setOdkedy(trackingStartedAt());
  }, []);

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

  /*
    Prahy detekcie si telefón pamätá od posledného zapnutia. Zmena v appke by
    sa preto k zapnutej detekcii nedostala a v telefóne by ticho platilo staré
    číslo — pošleme ich pri otvorení obrazovky znova.
  */
  useEffect(() => {
    void zosuladNastavenie(vozidla?.find((v) => v.id === vozidloId)?.name ?? null);
  }, [vozidla, vozidloId]);

  useEffect(() => {
    let zrusene = false;
    const pozri = () => {
      beziacaJazda()
        .then((j) => !zrusene && setRozpoznana(j))
        .catch(() => {});
    };
    pozri();
    const t = setInterval(pozri, 10_000);
    // Po návrate do appky sa nečaká na ďalší tik — človek pozerá práve teraz.
    const naNavrat = () => document.visibilityState === "visible" && pozri();
    document.addEventListener("visibilitychange", naNavrat);
    return () => {
      zrusene = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", naNavrat);
    };
  }, []);

  useEffect(() => {
    stavDetekcie().then(setDetekcia);
    /*
      Povolenie sa mení v systémových nastaveniach, teda mimo appky. Bez
      prečítania pri návrate by varovanie o chýbajúcom „Vždy" svietilo ďalej
      aj potom, čo ho človek práve prepol — a vyzeralo by to, že to nepomohlo.
    */
    let odhlas: (() => void) | null = null;
    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      const { App } = await import("@capacitor/app");
      const h = await App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) void stavDetekcie().then(setDetekcia);
      });
      odhlas = () => void h.remove();
    })();
    return () => odhlas?.();
  }, []);

  useEffect(() => {
    vozidlaSCommanderom(firma.id)
      .then(setCommander)
      .catch(() => {});
  }, [firma.id]);

  /* Jazdy zapísané bez pripojenia — pri otvorení sa skúsia odoslať. */
  useEffect(() => {
    odosliCakajuceZapisy(firma.id)
      .then((pocet) => {
        if (pocet > 0) {
          toast.success(
            pocet === 1
              ? t("jz.bezSignaluOdoslana")
              : t("jz.odoslanychJazd", { pocet }),
          );
        }
      })
      .catch(() => {});
  }, [firma.id]);

  /*
   * Jazdy, ktoré appka nahrala, kým bola zavretá. Tie, pri ktorých už človek
   * odpovedal na notifikáciu, sa uložia rovno — pýtať sa druhýkrát na to isté
   * je otravné. Zvyšok sa ponúkne na obrazovke.
   */
  useEffect(() => {
    if (!vozidla || vozidla.length === 0) return;
    let zrusene = false;
    (async () => {
      const jazdy = await nacitajRozpoznaneJazdy();
      const zvysne: BufferedTrip[] = [];
      for (const jazda of jazdy) {
        // Uloží sa samo len vtedy, keď sa niet čoho pýtať: zaradenie prišlo
        // z notifikácie a auto je jednoznačné — firma ho má jediné, alebo si
        // telefón pamätá, ktorým sa z neho jazdí. Inak sa spýtame človeka,
        // hádať medzi autami nemá zmysel.
        const auto = vozidloPreRozpoznanuJazdu({
          companyId: firma.id,
          dostupne: vozidla.map((v) => v.id).filter((id) => !commander.has(id)),
        });
        if (jazda.classification && auto) {
          const r = await ulozRozpoznanuJazdu({
            jazda,
            companyId: firma.id,
            vehicleId: auto,
            classification: jazda.classification,
          });
          if (r.ok) {
            toast.success(
              t("jz.rozpoznanaUlozena", {
                km: (jazda.distanceMeters / 1000).toFixed(1),
                auto: vozidla.find((v) => v.id === auto)?.name ?? "",
              }),
            );
            continue;
          }
        }
        zvysne.push(jazda);
      }
      if (!zrusene) setCakajuce(zvysne);
    })();
    return () => {
      zrusene = true;
    };
  }, [firma.id, vozidla, commander]);

  /** Auto pre konkrétnu rozpoznanú jazdu; predvolené je to vybrané hore. */
  function autoPre(jazda: BufferedTrip): string {
    return vyberAuta[jazda.id] ?? vozidloId;
  }

  async function vybav(jazda: BufferedTrip, classification: Classification) {
    const vehicleId = autoPre(jazda);
    if (!vehicleId) return toast.error(t("jz.vyberteVozidlo"));
    setVybavujem(jazda.id);
    const r = await ulozRozpoznanuJazdu({
      jazda,
      companyId: firma.id,
      vehicleId,
      classification,
    });
    setVybavujem(null);
    if (!r.ok) return toast.error(r.chyba ?? t("jz.chybaUlozenia"));
    setCakajuce((z) => z.filter((j) => j.id !== jazda.id));
    const vozidlo = vozidla?.find((v) => v.id === vehicleId);
    toast.success(
      `${classification === "business" ? t("jz.ulozeneSluzobna") : t("jz.ulozeneSukromna")}${
        vozidlo ? ` — ${vozidlo.name}` : ""
      }`,
    );
  }

  async function zahod(jazda: BufferedTrip) {
    setVybavujem(jazda.id);
    await zahodRozpoznanuJazdu(jazda.id);
    setVybavujem(null);
    setCakajuce((z) => z.filter((j) => j.id !== jazda.id));
  }

  /* Kilometre naživo — inak nie je vidieť, či sa vôbec niečo meria. */
  useEffect(() => {
    if (!bezi) return;
    const t = setInterval(() => setKm(getCurrentDistanceKm()), 2000);
    return () => clearInterval(t);
  }, [bezi]);

  async function start() {
    if (!vozidloId) return toast.error(t("jz.vyberteVozidlo"));
    const r = await startTracking();
    if (!r.ok) return toast.error(r.error ?? t("jz.chybaGps"));
    setKm(0);
    setOdkedy(Date.now());
    setBezi(true);
    setPauza(false);
  }

  /**
   * Pauza a pokračovanie.
   *
   * Meranie sa naozaj zastaví — státie v kolóne či obed sa do trasy nezapíše.
   * Namerané kilometre ostávajú a po pokračovaní sa pripočítavajú ďalej.
   */
  async function prepniPauzu() {
    if (pauza) {
      const r = await resumeTracking();
      if (!r.ok) return toast.error(r.error ?? t("jz.chybaPokracovania"));
      setPauza(false);
      setBezi(true);
      return;
    }
    setKm(await pauseTracking());
    setBezi(false);
    setPauza(true);
  }

  async function stop() {
    setUkladam(true);
    const vysledok = await stopTracking();
    setBezi(false);
    setPauza(false);

    // Jazda bez jediného použiteľného merania nie je jazda. Predtým sa taká
    // uložila ako 0 km bez trasy a v knihe jázd ostal riadok, ktorý nič
    // nehovorí — a človek ani nevedel, že sa nič nenameralo.
    if (vysledok.points.length < 2 && vysledok.distance_km <= 0) {
      setUkladam(false);
      setKm(0);
      setOdkedy(null);
      toast.error(
        t("jz.bezPolohy"),
        { duration: 8000 },
      );
      return;
    }

    try {
      const vozidlo = vozidla?.find((v) => v.id === vozidloId);
      // Bez siete dotaz **vyhodí** a zhodil by celé uloženie — jazda by sa
      // nedostala ani do fronty, hoci práve to je zmysel offline záznamu.
      const { data: plne } = await supabase
        .from("vehicles")
        .select("consumption_l_100km")
        .eq("id", vozidloId)
        .maybeSingle()
        .then(
          (r) => r,
          () => ({ data: null }),
        );
      const spotreba = plne?.consumption_l_100km
        ? (vysledok.distance_km * Number(plne.consumption_l_100km)) / 100
        : null;

      const dnes = new Date().toISOString().slice(0, 10);
      const zapis = {
        company_id: firma.id,
        vehicle_id: vozidloId,
        trip_date: dnes,
        classification: typJazdy,
        purpose: ucel.trim() || "GPS jazda",
        start_odometer: 0,
        end_odometer: vysledok.distance_km,
        distance_km: vysledok.distance_km,
        fuel_consumption: spotreba,
        fuel_price: cenaPaliva.current,
        route: trasaDoPolyline(vysledok.points),
        /*
          Čas a rýchlosti sem appka dosiaľ nedávala vôbec, takže jazda z telefónu
          bola v knihe jázd bez trvania aj bez rýchlosti — a web ich má kde
          ukazovať. Priemer je za čas jazdy bez páuz; státie by ho inak zrazilo.
        */
        start_time: vysledok.start ? new Date(vysledok.start.ts).toISOString() : null,
        end_time: vysledok.end ? new Date(vysledok.end.ts).toISOString() : null,
        duration_seconds: vysledok.duration_sec,
        average_speed_kmh: vysledok.avg_speed_kmh,
        max_speed_kmh: vysledok.max_speed_kmh,
        note: `GPS: ${vysledok.duration_min} min, ${vysledok.points.length} bodov`,
      };

      // Bez signálu nemá zmysel čakať na vypršanie spojenia — človek stojí nad
      // telefónom a jazda sa aj tak odloží.
      const { isOnline } = await import("@/lib/mobile/offline-queue");
      const { error } = (await isOnline())
        ? await supabase.from("trips").insert(zapis)
        : { error: { message: "bez pripojenia" } as { message: string } };

      if (error) {
        // Bez pripojenia sa jazda nezahodí — odloží sa v telefóne a odošle sa
        // po pripojení. Kniha jázd je záznam z cesty, nie z kancelárie.
        await pridajCakajucuJazdu({
          id: crypto.randomUUID(),
          company_id: firma.id,
          vehicle_id: vozidloId,
          trip_date: dnes,
          purpose: zapis.purpose,
          distance_km: vysledok.distance_km,
          classification: typJazdy,
          route: zapis.route,
          zapis,
          chyba: error.message,
        });
        toast.success(
          t("jz.ulozenaVTelefone", { km: vysledok.distance_km }),
          { duration: 6000 },
        );
      } else {
        toast.success(
          `${t("jz.ulozenaKm", { km: vysledok.distance_km })}${vozidlo ? `, ${vozidlo.name}` : ""}`,
        );
      }
      setUcel("");
      setKm(0);
      setOdkedy(null);
    } catch (e: any) {
      toast.error(e?.message ?? t("jz.chybaUlozenia"));
    } finally {
      setUkladam(false);
    }
  }

  if (vozidla === null) return <Pracujem text={t("jz.nacitavamVozidla")} />;
  if (ukladam) return <Pracujem text={t("jz.ukladamJazdu")} />;

  if (historia) {
    return <HistoriaJazd firma={firma} vozidlo={historia} onSpat={() => setHistoria(null)} />;
  }

  if (pridavam) {
    return (
      <NoveVozidlo
        firma={firma}
        onSpat={() => setPridavam(false)}
        onPridane={async (id: string) => {
          setPridavam(false);
          await nacitajVozidla(id);
        }}
      />
    );
  }

  if (vozidla.length === 0) {
    return (
      <MobilObrazovka
        title={t("jazdy.jazda")}
        subtitle={firma.name}
        onBack={onSpat}
        footer={<HlavneTlacidlo onClick={() => setPridavam(true)}>{t("jz.pridatVozidlo")}</HlavneTlacidlo>}
      >
        <div className="grid place-items-center py-16 text-center">
          <Car className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium">
            {nezistene ? t("jz.bezPripojenia") : t("jz.bezVozidla")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {nezistene
              ? t("jz.bezZoznamu")
              : t("jz.pridajteHo")}
          </p>
        </div>
      </MobilObrazovka>
    );
  }

  return (
    <MobilObrazovka
      title={bezi ? t("jz.jazdaBezi") : pauza ? t("jz.jazdaPozastavena") : t("jz.novaJazda")}
      subtitle={firma.name}
      /*
        Odísť sa dá aj počas jazdy. Meranie vlastní modul, nie táto obrazovka,
        takže beží ďalej a na domovskej obrazovke ho vidno v zelenom pruhu.
        Kým tu bolo `undefined`, človek ostal v knihe jázd zamknutý až do konca
        jazdy a nedostal sa ani do ponuky.
      */
      onBack={onSpat}
      footer={
        bezi || pauza ? (
          <HlavneTlacidlo onClick={stop}>{t("jz.ukoncitAUlozit")}</HlavneTlacidlo>
        ) : (
          <HlavneTlacidlo onClick={start}>{t("jz.zacatJazdu")}</HlavneTlacidlo>
        )
      }
    >
      {/* `space-y-3` namiesto `space-y-4`: pri šiestich blokoch pod sebou to
          na 6,1" displeji robilo celú obrazovku rolovania navyše. */}
      <div className="space-y-3">
        {/*
          Jazda rozpoznaná detekciou beží mimo tejto obrazovky — bez pruhu by
          tu stálo „meranie zatiaľ nebeží", hoci telefón práve nahráva.
        */}
        {!bezi && !pauza && <PrebiehaJazda />}

        {/*
          Karta mala 56px číslo a pod ním kruh — na jednu hodnotu zabrala takmer
          polovicu displeja a formulár pod ňou sa dal nájsť až rolovaním. Teraz
          je to jeden riadok: hodnota vľavo, stav pod ňou, ovládanie vpravo.
        */}
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-[var(--shadow-card)]">
          <div className="min-w-0">
            <div className="text-[34px] font-semibold leading-none tabular-nums">
              {km.toFixed(1)}
              <span className="ml-1.5 text-[15px] font-normal text-muted-foreground">km</span>
            </div>
            <div className="mt-1.5 text-[12px] text-muted-foreground">
              {pauza
                ? t("jz.pozastavene")
                : bezi && odkedy
                  ? `beží ${trvanie(odkedy)}`
                  : t("jz.meranieNebezi")}
            </div>
          </div>

          {/*
            Kruh je ovládanie len počas jazdy — vtedy je to jediná pauza, lebo
            tlačidlo dole už hovorí „Ukončiť a uložiť". Kým jazda nebeží, štart
            robí spodné tlačidlo a kruh by ho len zdvojoval; ostáva z neho
            statický znak stavu. Nesmie pritom vyzerať ako gombík: presne to tu
            už raz bolo a ľudia naň klikali, hoci sa nič nedialo.
          */}
          {bezi || pauza ? (
            <button
              onClick={prepniPauzu}
              aria-label={bezi ? t("jz.pozastavitMeranie") : t("jz.pokracovatVMerani")}
              className={`grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full transition active:scale-95 ${
                bezi ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
              }`}
            >
              {bezi ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
            </button>
          ) : (
            <span
              aria-hidden
              className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full border border-dashed border-border/70 text-muted-foreground/50"
            >
              <Car className="h-5 w-5" />
            </span>
          )}
        </div>
        {(bezi || pauza) && (
          <p className="text-[12px] text-muted-foreground">
            {bezi ? t("jz.tuknutimPozastavite") : t("jz.tuknutimPokracujete")}
          </p>
        )}

        {/*
          Rozpoznaná jazda, ktorá práve beží. Pozastaviť sa nedá — motor detekcie
          pauzu nepozná a predstierať ju tlačidlom, ktoré nič nespraví, by bolo
          horšie než ju neponúknuť. Ukončiť aj zahodiť sa dá.
        */}
        {rozpoznana && !rozpoznana.rucna && (
          <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-primary">{t("jz.rozpoznanaBezi")}</span>
              <span className="text-[17px] font-semibold tabular-nums">
                {rozpoznana.km.toFixed(1)} km
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("jz.odCasu", {
                cas: new Date(rozpoznana.zaciatok).toLocaleTimeString(loc, {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                disabled={ukoncujem}
                onClick={async () => {
                  setUkoncujem(true);
                  try {
                    const j = await ukonciBeziacuJazdu();
                    setRozpoznana(null);
                    // Ukončená jazda sa hneď ponúkne na zaradenie nižšie.
                    if (j) setCakajuce((xs) => (xs.some((x) => x.id === j.id) ? xs : [...xs, j]));
                    toast.success(t("jz.ukoncena"));
                  } finally {
                    setUkoncujem(false);
                  }
                }}
                className="rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground active:scale-95 disabled:opacity-60"
              >
                {ukoncujem ? t("jz.ukoncujem") : t("jz.ukoncitJazdu")}
              </button>
              <button
                disabled={ukoncujem}
                onClick={async () => {
                  if (!window.confirm(t("jz.zahoditOtazka"))) return;
                  setUkoncujem(true);
                  try {
                    await zahodRozpoznanuJazdu(rozpoznana.id);
                    setRozpoznana(null);
                    toast.success(t("jz.zahodena"));
                  } finally {
                    setUkoncujem(false);
                  }
                }}
                className="rounded-xl border border-border px-3 py-2.5 text-sm active:scale-95 disabled:opacity-60"
              >
                {t("jz.zahodit")}
              </button>
            </div>
          </div>
        )}

        {cakajuce.length > 0 && (
          <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4">
            <div className="text-sm font-medium">
              {cakajuce.length === 1
                ? t("jz.rozpoznalaJazdu")
                : t("jz.rozpoznalaJazdy", { pocet: cakajuce.length })}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("jz.telefonNevie")}
            </p>
            <div className="mt-3 space-y-2">
              {cakajuce.map((j) => (
                <div key={j.id} className="rounded-xl border border-border/70 bg-card p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[17px] font-semibold tabular-nums">
                      {(j.distanceMeters / 1000).toFixed(1)} km
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {new Date(j.startedAt).toLocaleString("sk-SK", {
                        day: "numeric",
                        month: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <select
                    value={autoPre(j)}
                    disabled={vybavujem === j.id}
                    onChange={(e) => setVyberAuta((v) => ({ ...v, [j.id]: e.target.value }))}
                    aria-label={t("jz.vozidloPreJazdu")}
                    className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[16px] disabled:opacity-60"
                  >
                    {(vozidla ?? []).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                        {v.license_plate ? ` — ${v.license_plate}` : ""}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => setTrasaOtvorena((t) => (t === j.id ? null : j.id))}
                    className="mt-2 text-[13px] text-primary underline-offset-2 hover:underline"
                  >
                    {trasaOtvorena === j.id ? t("jz.skrytTrasu") : t("jz.ukazatTrasu")}
                  </button>
                  {trasaOtvorena === j.id && (
                    <div className="mt-2">
                      <MapaTrasy route={trasaDoPolyline(j.points)} vyska={220} />
                    </div>
                  )}

                  {j.classification ? (
                    // Zaradenie prišlo z notifikácie, ostáva potvrdiť auto.
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-muted px-2 py-1 text-[13px]">
                        {t(j.classification === "business" ? "jazdy.sluzobna" : "jazdy.sukromna")}
                      </span>
                      <button
                        disabled={vybavujem === j.id}
                        onClick={() => vybav(j, j.classification!)}
                        className="rounded-lg bg-primary px-3 py-2 text-[14px] font-medium text-primary-foreground disabled:opacity-60"
                      >
                        {t("spolocne.ulozit")}
                      </button>
                      <button
                        disabled={vybavujem === j.id}
                        onClick={() => zahod(j)}
                        className="ml-auto rounded-lg px-3 py-2 text-[14px] text-muted-foreground disabled:opacity-60"
                      >
                        {t("jz.zahodit")}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        disabled={vybavujem === j.id}
                        onClick={() => vybav(j, "business")}
                        className="rounded-lg bg-primary px-3 py-2 text-[14px] font-medium text-primary-foreground disabled:opacity-60"
                      >
                        {t("jazdy.sluzobna")}
                      </button>
                      <button
                        disabled={vybavujem === j.id}
                        onClick={() => vybav(j, "private")}
                        className="rounded-lg border border-border px-3 py-2 text-[14px] disabled:opacity-60"
                      >
                        {t("jazdy.sukromna")}
                      </button>
                      <button
                        disabled={vybavujem === j.id}
                        onClick={() => zahod(j)}
                        className="ml-auto rounded-lg px-3 py-2 text-[14px] text-muted-foreground disabled:opacity-60"
                      >
                        {t("jz.zahodit")}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {detekcia.dostupna && (
          /*
            Popis mal štyri riadky a rozťahoval kartu cez štvrtinu obrazovky,
            hoci ho človek prečíta raz — pri zapínaní. Nadpis a prepínač preto
            ostávajú v riadku a zvyšok je pod „?". Varovanie o Commanderi sa
            neskrýva: keď platí, telefón by tú istú jazdu zapísal druhýkrát.
          */
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="flex items-center gap-3">
              <label htmlFor="detekcia-jazd" className="min-w-0 flex-1 text-sm font-medium">
                {t("jz.rozpoznavat")}
              </label>
              <button
                type="button"
                onClick={() => setPopisDetekcie((v) => !v)}
                aria-expanded={popisDetekcie}
                aria-label={t("jz.akoFunguje")}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border text-[12px] font-medium text-muted-foreground active:bg-secondary"
              >
                ?
              </button>
              <input
                id="detekcia-jazd"
                type="checkbox"
                checked={detekcia.zapnuta}
                disabled={bezi}
                onChange={async (e) => {
                  const chce = e.target.checked;
                  const r = await prepniDetekciu(
                    chce,
                    vozidla?.find((v) => v.id === vozidloId)?.name ?? null,
                  );
                  setDetekcia((s) => ({ ...s, zapnuta: r.zapnuta, prekazka: r.prekazka }));
                  if (r.chyba) toast.error(r.chyba);
                  // Zapnutá detekcia bez povolenia „Vždy" nič nerozpozná. Tešiť sa
                  // z toho by znamenalo, že sa človek o chybe dozvie až tým, že
                  // po týždni nemá v knihe jázd ani jednu jazdu.
                  else if (r.prekazka) toast.warning(r.prekazka, { duration: 10000 });
                  else if (r.zapnuta) toast.success(t("jz.detekciaZapnuta"));
                }}
                className="h-5 w-5 shrink-0"
              />
            </div>

            <p className="mt-1 text-xs text-muted-foreground">{t("jz.vyzadujePolohu")}</p>

            {vozidloId && commander.has(vozidloId) && (
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{t("jz.commander")}</span>
                {t("jz.commanderZvysok")}
              </p>
            )}

            {popisDetekcie && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("jz.vsimneSi")}
                {vozidla && vozidla.length > 1 && vozidloId ? (
                  <>
                    {" "}
                    Ukladá sa na{" "}
                    <span className="font-medium text-foreground">
                      {vozidla.find((v) => v.id === vozidloId)?.name}
                    </span>{" "}
                    — zmeníš výberom vozidla nižšie.
                  </>
                ) : null}
              </p>
            )}
          </div>
        )}

        {/*
          Zapnutý prepínač ešte neznamená, že detekcia beží. Bez polohy „Vždy"
          systém appku na pozadí nezobudí a bez presnej polohy sú merania
          nepoužiteľné — v oboch prípadoch sa nerozpozná ani jedna jazda a
          zvonku to vyzerá ako pokazená appka.
        */}
        {detekcia.dostupna && detekcia.zapnuta && detekcia.prekazka && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <div className="text-sm font-medium">{t("jz.detekciaNemaAkoBezat")}</div>
              <div className="mt-1 text-xs text-muted-foreground">{detekcia.prekazka}</div>
            </div>
          </div>
        )}

        <div>
          {/* Rovnaký štýl ako „Účel cesty" a „Typ jazdy" — predtým bol väčší
              a s väčším odstupom, takže sekcie pôsobili ako tri rôzne veci. */}
          <span className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
            {t("jz.vozidlo")}
          </span>
          <div className="space-y-1.5">
            {vozidla.map((v) => (
              /*
               * Dve akcie v jednom riadku: ťuknutie vyberá auto pre novú jazdu,
               * šípka otvára jeho históriu. Keby história bola na celom riadku,
               * nedalo by sa auto vybrať — a výber je to, čo človek robí v aute.
               */
              <div
                key={v.id}
                className={`flex w-full items-center rounded-2xl border transition ${
                  vozidloId === v.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/70 bg-card"
                } ${bezi ? "opacity-60" : ""}`}
              >
                <button
                  disabled={bezi}
                  onClick={() => {
                    setVozidloId(v.id);
                    // Telefón si auto pamätá, takže rozpoznané jazdy sa naň vedia
                    // uložiť samy aj vtedy, keď firma áut viac.
                    zapamatajVozidlo(firma.id, v.id);
                    void nastavVozidloVNotifikacii(v.name);
                  }}
                  className={`flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 text-left ${
                    vozidloId === v.id ? "font-semibold" : ""
                  }`}
                >
                  <Car className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-[15px]">{v.name}</span>
                  {/* Jazdy tohto auta chodia z Commanderu — telefón ich merať nemá,
                      inak by tá istá jazda bola v knihe dvakrát. */}
                  {commander.has(v.id) && (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      Commander
                    </span>
                  )}
                  {v.license_plate && (
                    <span className="shrink-0 text-[13px] text-muted-foreground">
                      {v.license_plate}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setHistoria(v)}
                  aria-label={t("jz.historiaVozidla", { auto: v.name })}
                  className="flex shrink-0 items-center gap-0.5 self-stretch rounded-r-2xl px-3 text-[13px] text-muted-foreground active:bg-secondary"
                >
                  {t("jz.historia")}
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              disabled={bezi}
              onClick={() => setPridavam(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3 text-left text-muted-foreground disabled:opacity-60"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="text-[15px]">{t("jz.pridatVozidlo")}</span>
            </button>
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
            {t("jz.ucelCesty")}
          </span>
          <input
            value={ucel}
            onChange={(e) => setUcel(e.target.value)}
            placeholder={t("jz.ucelPriklad")}
            disabled={bezi}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[16px] disabled:opacity-60"
          />
        </label>

        {/* Typ jazdy sa dal určiť len pri automaticky zachytených jazdách; ručne
            spustená sa ticho ukladala ako služobná podľa predvolenej hodnoty
            v databáze. Prepnúť sa dá aj počas jazdy — človek to často vie až cestou. */}
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
            {t("jz.typJazdy")}
          </span>
          <div className="grid grid-cols-2 gap-2">
            {(["business", "private"] as const).map((typ) => (
              <button
                key={typ}
                onClick={() => setTypJazdy(typ)}
                className={`rounded-xl border px-3 py-2.5 text-[15px] ${
                  typJazdy === typ
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "border-input bg-background text-muted-foreground"
                }`}
              >
                {t(typ === "business" ? "jazdy.sluzobna" : "jazdy.sukromna")}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {t("jz.lenPocasPouzivania")}
        </p>
      </div>
    </MobilObrazovka>
  );
}

/* ------------------------- Nové vozidlo ------------------------- */

/**
 * Pridanie auta priamo z telefónu.
 *
 * Formulár na webe má desať polí, tu stačia tri — auto sa najčastejšie
 * zakladá práve vtedy, keď doň človek sadá a chce začať merať. Zvyšok
 * (typ, palivo, počiatočný stav tachometra) sa dá doplniť na webe.
 *
 * Spotreba je zámerne súčasťou už tohto kroku: bez nej nemá jazda náklad a
 * vyhodnotenie zákaziek aj kniha jázd ukážu pri doprave nulu.
 */
function NoveVozidlo({
  firma,
  onSpat,
  onPridane,
}: {
  firma: { id: string; name: string };
  onSpat: () => void;
  onPridane: (id: string) => void;
}) {
  const { t } = usePreklad();
  const [nazov, setNazov] = useState("");
  const [spz, setSpz] = useState("");
  const [spotreba, setSpotreba] = useState("");
  const [ukladam, setUkladam] = useState(false);

  async function uloz() {
    if (!nazov.trim()) return toast.error(t("jz.zadajteNazovVozidla"));
    setUkladam(true);
    const cislo = Number(spotreba.replace(",", "."));
    // Bez siete zápis vyhodí; nezachytené by to nechalo tlačidlo navždy v
    // stave „ukladám" a človek by nevedel, čo sa deje.
    const { data, error } = await supabase
      .from("vehicles")
      .insert({
        company_id: firma.id,
        name: nazov.trim(),
        license_plate: spz.trim() || null,
        consumption_l_100km: Number.isFinite(cislo) && cislo > 0 ? cislo : null,
        active: true,
      })
      .select("id")
      .single()
      .then(
        (r) => r,
        (e) => ({ data: null, error: e as any }),
      );
    setUkladam(false);
    if (error || !data) {
      // Vozidlo smie zakladať len správca firmy — bežnému členovi to odmietne RLS.
      return toast.error(friendlyError(error, t("jz.chybaVozidla")));
    }
    toast.success(t("jz.vozidloPridane"));
    onPridane(data.id);
  }

  if (ukladam) return <Pracujem text={t("jz.ukladamVozidlo")} />;

  return (
    <MobilObrazovka
      title={t("jz.noveVozidlo")}
      subtitle={firma.name}
      onBack={onSpat}
      footer={
        <HlavneTlacidlo onClick={uloz} disabled={!nazov.trim()}>
          {t("jz.pridatVozidlo")}
        </HlavneTlacidlo>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-muted-foreground">{t("jz.nazovVozidla")}</span>
          <input
            value={nazov}
            onChange={(e) => setNazov(e.target.value)}
            placeholder={t("jz.nazovVozidlaPriklad")}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[16px]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-muted-foreground">
            {t("jz.evidencneCislo")}
          </span>
          <input
            value={spz}
            onChange={(e) => setSpz(e.target.value.toUpperCase())}
            placeholder="TT123AB"
            autoCapitalize="characters"
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[16px]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-muted-foreground">
            {t("jz.spotreba")}
          </span>
          <input
            value={spotreba}
            onChange={(e) => setSpotreba(e.target.value)}
            inputMode="decimal"
            placeholder={t("jz.spotrebaPriklad")}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[16px]"
          />
          <span className="mt-1 block text-[12px] text-muted-foreground">
            {t("jz.nepovinneCena")}
          </span>
        </label>
      </div>
    </MobilObrazovka>
  );
}
