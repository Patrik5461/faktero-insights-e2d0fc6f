/**
 * Napojenie automaticky rozpoznaných jázd na knihu jázd.
 *
 * Plugin `@faktero/drive-detector` je zámerne lokálny — nahrá trasu a ďalej ju
 * nikam neposiela. Tento súbor je tá druhá polovica: rozpoznanú jazdu vezme
 * z buffra, spraví z nej riadok v `trips` a povie pluginu, že ju už nemá komu
 * ponúkať.
 *
 * Prevzatie musí zniesť opakovanie. Preto sa píše s `external_source` +
 * `external_id`, na ktorých je v databáze jedinečný index — keď sa uloženie
 * podarí a označenie v pluginu už nie, druhý pokus nevyrobí duplicitu.
 */
import type { BufferedTrip, Classification, TripPoint } from "@faktero/drive-detector";
import type { TablesInsert } from "@/integrations/supabase/types";
import { trasaDoPolyline } from "@/lib/faktero/polyline";

export const ZDROJ = "drive_detector";

/** Kratší presun do knihy jázd nepatrí — je to prechádzka po parkovisku. */
export const MIN_VZDIALENOST_M = 500;

/** Dátum jazdy v miestnom čase. `toISOString()` by v noci posunul deň o jeden. */
export function miestnyDatum(cas: number): string {
  const d = new Date(cas);
  const mesiac = String(d.getMonth() + 1).padStart(2, "0");
  const den = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mesiac}-${den}`;
}

/**
 * Nad touto rýchlosťou to už nie je jazda, ale skok polohy. Tá istá hranica
 * je v `gps-tracker.ts` aj v jadre pluginu (iOS aj Android).
 */
export const MAX_ROZUMNA_KMH = 250;

function metre(a: TripPoint, b: TripPoint): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Vzdialenosť trasy v metroch bez úsekov, ktoré by auto nemohlo prejsť,
 * a či sa v trase nejaký taký skok vôbec našiel.
 */
export function vzdialenostBezSkokov(body: TripPoint[]): { metre: number; skoky: number } {
  let spolu = 0;
  let skoky = 0;
  for (let i = 1; i < body.length; i++) {
    const d = metre(body[i - 1], body[i]);
    const sekundy = (body[i].timestamp - body[i - 1].timestamp) / 1000;
    // Bez času sa úsek posúdiť nedá — radšej sa započíta.
    if (sekundy <= 0 || (d / sekundy) * 3.6 <= MAX_ROZUMNA_KMH) spolu += d;
    else skoky++;
  }
  return { metre: spolu, skoky };
}

/**
 * Jazda z pluginu očistená od skokov polohy.
 *
 * GPS v meste, v tuneli alebo pri chytaní signálu občas hodí polohu o stovky
 * metrov vedľa a plugin (v buildoch pred 31. 10. 2026) taký úsek pripočítal
 * do kilometrov — kniha jázd potom tvrdila cestu, ktorú auto nešlo. Kilometre
 * sa preto prepočítajú z bodov trasy znova, a to aj pre jazdy zo starších
 * buildov, ktoré v telefónoch ešte bežia. Body trasy ostávajú, zahadzuje sa
 * len ich započítanie.
 */
export function ocistiJazdu(jazda: BufferedTrip): BufferedTrip {
  const body = jazda.points ?? [];
  // Bez skoku v trase sa hodnota pluginu nechá — prepočet by ju len posunul
  // o rozdiel v zaokrúhľovaní. So skokom sa prepočíta z bodov; nový plugin
  // skok vynechal tiež, takže vyjde to isté číslo (prepočet je opakovateľný).
  const { metre: bezSkokov, skoky } = vzdialenostBezSkokov(body);
  const distanceMeters =
    skoky > 0 ? Math.min(jazda.distanceMeters, bezSkokov) : jazda.distanceMeters;
  const zBodov = body.reduce(
    (m, b) => (b.speedKmh >= 0 && b.speedKmh <= MAX_ROZUMNA_KMH ? Math.max(m, b.speedKmh) : m),
    0,
  );
  const maxSpeedKmh =
    jazda.maxSpeedKmh <= MAX_ROZUMNA_KMH ? jazda.maxSpeedKmh : body.length ? zBodov : 0;
  // Priemer rovnako ako v pluginu: vzdialenosť cez čas od začiatku po koniec.
  const koniec = jazda.endedAt ?? body[body.length - 1]?.timestamp ?? jazda.startedAt;
  const trvanie = (koniec - jazda.startedAt) / 1000;
  const avgSpeedKmh = trvanie > 0 ? (distanceMeters / trvanie) * 3.6 : 0;
  return { ...jazda, distanceMeters, maxSpeedKmh, avgSpeedKmh };
}

function zaokruhli(hodnota: number, desatinne = 2): number {
  const n = 10 ** desatinne;
  return Math.round(hodnota * n) / n;
}

/**
 * Z nahranej trasy spraví riadok knihy jázd.
 *
 * Tachometer sa nastavuje rovnako ako pri ručnej GPS jazde (0 → počet km) —
 * telefón skutočný stav tachometra nevie a vymyslené číslo by bolo horšie než
 * žiadne.
 */
export function riadokZJazdy(args: {
  jazda: BufferedTrip;
  companyId: string;
  vehicleId: string;
  classification: Classification;
  spotrebaL100?: number | null;
  cenaPaliva?: number | null;
  userId?: string | null;
  /** Odberateľ, za ktorým sa išlo. Nepovinné — súkromná jazda ho nemá vôbec. */
  odberatel?: { id: string; name: string } | null;
}): TablesInsert<"trips"> {
  const jazda = ocistiJazdu(args.jazda);
  const km = zaokruhli(jazda.distanceMeters / 1000);
  const koniec = jazda.endedAt ?? jazda.startedAt;
  const trvanieSekundy = Math.max(0, Math.round((koniec - jazda.startedAt) / 1000));
  const spotreba =
    args.spotrebaL100 != null && args.spotrebaL100 > 0
      ? zaokruhli((km * Number(args.spotrebaL100)) / 100)
      : null;

  return {
    company_id: args.companyId,
    vehicle_id: args.vehicleId,
    trip_date: miestnyDatum(jazda.startedAt),
    /*
      Účel sa nevypĺňa. Kedysi tu stálo „Automaticky rozpoznaná jazda", resp.
      „Súkromná jazda" — lenže charakter jazdy nesie `classification` a v knihe
      to potom stálo dvakrát vedľa seba. Účel je miesto pre to, čo appka nevie:
      za čím sa išlo. Nechá sa prázdny, nech je vidieť, že tam nič nie je.
    */
    purpose: null,
    classification: args.classification,
    start_odometer: 0,
    end_odometer: km,
    distance_km: km,
    fuel_consumption: spotreba,
    fuel_price: args.cenaPaliva ?? null,
    start_time: new Date(jazda.startedAt).toISOString(),
    end_time: jazda.endedAt ? new Date(jazda.endedAt).toISOString() : null,
    duration_seconds: trvanieSekundy,
    average_speed_kmh: zaokruhli(jazda.avgSpeedKmh, 1),
    // Najvyššia rýchlosť má odteraz vlastný stĺpec; v poznámke ostáva pre ľudí,
    // ktorí si jazdu čítajú, ale hľadať a exportovať sa dá až takto.
    max_speed_kmh: zaokruhli(jazda.maxSpeedKmh, 1),
    route: trasaDoPolyline(jazda.points),
    // Meno sa ukladá vedľa odkazu zámerne — odberateľa možno premenovať aj
    // zmazať, kniha jázd má ostať čitateľná aj potom.
    customer_id: args.odberatel?.id ?? null,
    customer_name: args.odberatel?.name ?? null,
    external_source: ZDROJ,
    external_id: jazda.id,
    created_by: args.userId ?? null,
    note: `Automatická detekcia: ${jazda.points.length} bodov, max ${Math.round(jazda.maxSpeedKmh)} km/h`,
  };
}

/** Najkratší spoločný čas, ktorý ešte považujeme za tú istú jazdu. */
const MIN_PREKRYV_MS = 60_000;

/**
 * Jazda toho istého auta, ktorá sa s touto prekrýva v čase.
 *
 * Jedno auto nemôže ísť dve jazdy naraz, takže prekryv znamená, že tú istú
 * cestu už niekto zapísal: druhá appka na tom istom telefóne, druhý účet nad
 * tým istým autom alebo import z Commandera. Dve nezávislé merania nikdy
 * nevyjdú rovnako — líšia sa o stovky metrov aj o minúty — takže porovnávať
 * kilometre nemá zmysel; spoločný čas je jediné spoľahlivé znamenie.
 *
 * Dotyk koncom prekryv nie je: jazda, ktorá začína presne tam, kde predošlá
 * skončila, je bežná vec. Preto sa žiada aspoň minúta spoločného času —
 * a jazda bez konca sa tým pádom posúdiť nedá a prejde. Radšej duplicita,
 * ktorú človek v knihe vidí, než ticho zahodená jazda.
 */
export function prekryvajucaSaJazda(
  jazda: { startedAt: number; endedAt?: number | null },
  existujuce: Array<{ id: string; start_time: string | null; end_time: string | null }>,
): string | null {
  const zaciatok = jazda.startedAt;
  const koniec = jazda.endedAt ?? jazda.startedAt;

  for (const iny of existujuce) {
    if (!iny.start_time || !iny.end_time) continue;
    const od = Date.parse(iny.start_time);
    const do_ = Date.parse(iny.end_time);
    if (Number.isNaN(od) || Number.isNaN(do_)) continue;
    if (Math.min(koniec, do_) - Math.max(zaciatok, od) >= MIN_PREKRYV_MS) return iny.id;
  }
  return null;
}

/** Jazda, ktorú bez človeka uložiť nevieme — chýba jej zaradenie. */
export function cakaNaCloveka(jazda: BufferedTrip): boolean {
  return jazda.classification == null;
}

/** Príliš krátky záznam, ktorý nemá zmysel nikomu ukazovať. */
export function jePrikratka(jazda: BufferedTrip): boolean {
  return ocistiJazdu(jazda).distanceMeters < MIN_VZDIALENOST_M;
}

/**
 * Prečo detekcia nemôže fungovať, hoci je zapnutá.
 *
 * Toto je tá časť, ktorá v appke chýbala: iOS na žiadosť o polohu „Vždy" hneď
 * po „Počas používania" spravidla nezobrazí nič a odpoveď odloží. Prepínač sa
 * potom zapol, appka poďakovala — a detekcia nemala ako bežať, lebo významnú
 * zmenu polohy systém na pozadí doručuje len s „Vždy". To isté platí pre
 * zníženú presnosť: merania vtedy chodia s odchýlkou v kilometroch, všetky sa
 * zahodia a jazda sa nepotvrdí nikdy.
 *
 * Vracia prvú prekážku, nie zoznam — človek aj tak vie naraz prepnúť jednu vec.
 */
export type ProblemPovolenia = "poloha" | "pozadie" | "presnost" | "obnovovanie" | "uspora";

export function prekazkaDetekcie(povolenia: {
  location?: string;
  background?: string;
  /** Chýba v starších binárkach — vtedy sa presnosť neposudzuje. */
  precise?: string;
  /** Obnovovanie na pozadí. Chýba v starších binárkach. */
  backgroundRefresh?: string;
  /** Režim nízkej spotreby. Nie je to povolenie, ale bráni rovnako. */
  lowPower?: string;
}): ProblemPovolenia | null {
  if (povolenia.location !== "granted") return "poloha";
  if (povolenia.background !== "granted") return "pozadie";
  if (povolenia.precise != null && povolenia.precise !== "granted") return "presnost";
  if (povolenia.backgroundRefresh != null && povolenia.backgroundRefresh !== "granted")
    return "obnovovanie";
  if (povolenia.lowPower === "on") return "uspora";
  return null;
}

/** Čo s tým má človek spraviť. Cesta je iOS-ová, appka je zatiaľ len tam. */
export const TEXT_PREKAZKY: Record<ProblemPovolenia, string> = {
  poloha: "Poloha je zakázaná — bez nej detekcia nefunguje. Nastavenia → Faktero → Poloha.",
  pozadie:
    "Poloha je povolená len „Počas používania“. So zamknutým telefónom sa nemeria nič — " +
    "prepnite ju v Nastavenia → Faktero → Poloha na „Vždy“.",
  presnost:
    "Presná poloha je vypnutá. Merania sú vtedy mimo o stovky metrov a jazda sa nerozpozná — " +
    "zapnite ju v Nastavenia → Faktero → Poloha.",
  obnovovanie:
    "Obnovovanie na pozadí je vypnuté. Systém vtedy appku pri presune nezobudí a jazda sa " +
    "nezačne nahrávať — zapnite ho v Nastavenia → Faktero → Obnovovanie obsahu na pozadí.",
  uspora:
    "Zapnutý je Režim nízkej spotreby. Ten prácu na pozadí obmedzuje a jazda sa nemusí " +
    "zaznamenať — na cestu ho vypnite v Nastavenia → Batéria.",
};
