/**
 * GPS tracker pre knihu jázd. Sleduje pozíciu, počíta vzdialenosť Haversinom.
 *
 * Vráti záznam použiteľný na uloženie do `trips`.
 *
 * V mobilnej aplikácii meria natívny plugin `@faktero/drive-detector` — ten
 * istý, ktorý jazdu vie rozpoznať aj sám. Je to zámer: dve nezávislé inštancie
 * `CLLocationManager` si navzájom prebíjajú nastavenú presnosť, takže polohu
 * v celej appke vlastní jediné miesto.
 *
 * V prehliadači sa meria cez `navigator.geolocation` — detekcia na pozadí sa
 * na webe spraviť nedá a ručné meranie tam fungovať musí.
 */
type Point = { lat: number; lng: number; ts: number };

/** Sledovanie v prehliadači beží mimo Capacitora, preto vlastné číslo. */
let webWatchId: number | null = null;
let points: Point[] = [];
let startedAt: number | null = null;

/** Beží natívne meranie? Body sú vtedy v pluginu, nie tu. */
let nativeTripId: string | null = null;
let nativeDistanceKm = 0;
let nativePoll: ReturnType<typeof setInterval> | null = null;

/**
 * Dokončené úseky jednej jazdy — čo sa nameralo pred pauzami.
 *
 * Pauzu nevie ani natívny plugin, ani prehliadač: meranie sa dá len spustiť a
 * ukončiť. Pauza je preto ukončenie úseku a jeho odloženie bokom; pokračovanie
 * spustí nový úsek a na konci sa všetky sčítajú. Pre človeka je to jedna jazda,
 * pre telefón niekoľko meraní za sebou.
 */
type Usek = {
  distance_km: number;
  points: Point[];
  /** Čas skutočnej jazdy, bez páuz — z neho sa počíta priemerná rýchlosť. */
  trvanie_ms: number;
  max_kmh: number;
};
let useky: Usek[] = [];
let pauzaOd: number | null = null;
/** Kedy sa začal prvý úsek — trvanie jazdy sa počíta odtiaľ, nie od poslednej pauzy. */
let jazdaOd: number | null = null;

/** Na „vždy" sa pýtame až po prvom skutočnom meraní, nie pri štarte appky. */
const KLUC_ESKALACIE = "faktero.gps.background_asked";

/**
 * Nad touto rýchlosťou to už nie je jazda, ale skok polohy.
 *
 * GPS v meste, v tuneli alebo pri chytaní signálu občas hodí polohu o stovky
 * metrov vedľa. Taký úsek sa nesmie započítať ani do najvyššej rýchlosti, ani
 * do kilometrov — inak kniha jázd tvrdí, že auto prešlo cestu, ktorú nešlo.
 */
const MAX_ROZUMNA_KMH = 250;

/** Je úsek medzi dvoma bodmi vôbec možný? */
function verohodny(a: Point, b: Point): boolean {
  const sekundy = (b.ts - a.ts) / 1000;
  if (sekundy <= 0) return true; // bez času sa to posúdiť nedá, radšej započítať
  return (haversineKm(a, b) / sekundy) * 3600 <= MAX_ROZUMNA_KMH;
}

/** Vzdialenosť trasy bez skokov polohy. */
function vzdialenostKm(body: Point[]): number {
  let d = 0;
  for (let i = 1; i < body.length; i++) {
    if (verohodny(body[i - 1], body[i])) d += haversineKm(body[i - 1], body[i]);
  }
  return d;
}

function haversineKm(a: Point, b: Point): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Sledovanie v prehliadači.
 *
 * Natívny plugin má na webe všetky metódy nedostupné — meranie na pozadí sa
 * v karte prehliadača spraviť nedá. Prehliadač pritom vlastné sledovanie
 * polohy má, tak sa použije to.
 */
function startWeb(): { ok: boolean; error?: string } {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { ok: false, error: "Prehliadač neposkytuje polohu" };
  }
  points = [];
  startedAt = Date.now();
  jazdaOd = jazdaOd ?? startedAt;
  webWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      points.push({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        ts: pos.timestamp,
      });
    },
    () => {
      /* jednotlivá chyba merania nemá jazdu zhodiť */
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
  );
  return { ok: true };
}

export async function startTracking(): Promise<{ ok: boolean; error?: string }> {
  // Čerstvý štart, nie pokračovanie po pauze — predchádzajúce úseky sem nepatria.
  useky = [];
  pauzaOd = null;
  jazdaOd = null;
  return spustiUsek();
}

/** Spustí jeden úsek merania. Volá sa pri štarte aj pri pokračovaní po pauze. */
async function spustiUsek(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return startWeb();

    // Appka načítava živý web, takže sa nová stránka môže stretnúť so starou
    // binárkou, ktorá plugin ešte nemá.
    if (!Capacitor.isPluginAvailable("DriveDetector")) {
      return { ok: false, error: "Aktualizujte aplikáciu, meranie jázd sa zmenilo" };
    }

    const { DriveDetector } = await import("@faktero/drive-detector");
    const perm = await DriveDetector.requestPermissions();
    if (perm.location !== "granted") return { ok: false, error: "Bez povolenia polohy" };

    const jazda = await DriveDetector.startTrip();
    nativeTripId = jazda.id;
    nativeDistanceKm = 0;
    startedAt = jazda.startedAt;
    jazdaOd = jazdaOd ?? jazda.startedAt;
    points = [];

    // Priebeh z pluginu chodí najviac raz za 10 sekúnd, čo je na počítadlo
    // kilometrov na obrazovke málo — stav sa preto ešte doťahuje.
    nativePoll = setInterval(async () => {
      try {
        const stav = await DriveDetector.getState();
        if (stav.activeTrip) nativeDistanceKm = stav.activeTrip.distanceMeters / 1000;
      } catch {
        /* jedno neúspešné doťahnutie meranie nezhodí */
      }
    }, 3000);

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "GPS chyba" };
  }
}

export type VysledokMerania = {
  distance_km: number;
  duration_min: number;
  /** Presné trvanie. `duration_min` je len na text, do knihy jázd patria sekundy. */
  duration_sec: number;
  /** Priemer sa počíta z času jazdy bez páuz — inak by státie zrážalo rýchlosť. */
  avg_speed_kmh: number | null;
  max_speed_kmh: number | null;
  start: Point | null;
  end: Point | null;
  points: Point[];
};

/**
 * Najvyššia rýchlosť z bodov trasy.
 *
 * Zámerne konzervatívne: úseky kratšie než dve sekundy sa preskakujú (medzi
 * dvoma blízkymi bodmi vychádzajú nezmysly) a hodnoty nad 250 km/h sa zahodia
 * — to už nie je auto, ale skok polohy, aký GPS v meste alebo v tuneli robí.
 */
function maxRychlost(body: Point[]): number {
  let max = 0;
  for (let i = 1; i < body.length; i++) {
    const sekundy = (body[i].ts - body[i - 1].ts) / 1000;
    if (sekundy < 2) continue;
    const kmh = (haversineKm(body[i - 1], body[i]) / sekundy) * 3600;
    if (kmh > MAX_ROZUMNA_KMH) continue;
    if (kmh > max) max = kmh;
  }
  return Math.round(max * 10) / 10;
}

/**
 * Ukončí jazdu a vráti ju celú — teda aj úseky spred páuz.
 *
 * Trvanie sa počíta od začiatku prvého úseku, takže zahŕňa aj čas státia. To
 * je zámer: jazda s prestávkou trvala aj tú prestávku a ľudia si podľa času
 * kontrolujú, či sedí to, čo si pamätajú.
 */
export async function stopTracking(): Promise<VysledokMerania> {
  const posledny = await ukonciUsek();
  const vsetky = [...useky, ...(posledny ? [posledny] : [])];
  const zaciatok = jazdaOd;
  useky = [];
  pauzaOd = null;
  jazdaOd = null;

  const body = vsetky.flatMap((u) => u.points);
  const km = vsetky.reduce((s, u) => s + u.distance_km, 0);
  const jazdaMs = vsetky.reduce((s, u) => s + u.trvanie_ms, 0);
  const max = vsetky.reduce((m, u) => Math.max(m, u.max_kmh), 0);
  return {
    distance_km: Math.round(km * 100) / 100,
    duration_min: zaciatok ? Math.round((Date.now() - zaciatok) / 60000) : 0,
    duration_sec: zaciatok ? Math.round((Date.now() - zaciatok) / 1000) : 0,
    avg_speed_kmh: jazdaMs > 1000 ? Math.round((km / (jazdaMs / 3_600_000)) * 10) / 10 : null,
    max_speed_kmh: max > 0 ? max : null,
    start: body[0] ?? null,
    end: body[body.length - 1] ?? null,
    points: body,
  };
}

/**
 * Pozastaví meranie. Namerané ostáva, ďalší pohyb sa nezapočíta.
 *
 * Vracia, koľko je zatiaľ nameraných kilometrov — obrazovka nemá odkiaľ inak
 * zistiť, že sa počítadlo po pauze nemá vynulovať.
 */
export async function pauseTracking(): Promise<number> {
  if (!isTracking()) return getCurrentDistanceKm();
  const usek = await ukonciUsek();
  if (usek) useky.push(usek);
  pauzaOd = Date.now();
  return getCurrentDistanceKm();
}

/** Pokračovanie po pauze — nový úsek tej istej jazdy. */
export async function resumeTracking(): Promise<{ ok: boolean; error?: string }> {
  pauzaOd = null;
  return spustiUsek();
}

/** Je jazda rozmeraná, ale práve pozastavená? */
export function isPaused(): boolean {
  return pauzaOd !== null;
}

/** Kedy sa jazda začala — po návrate na obrazovku sa inak nedá zistiť. */
export function trackingStartedAt(): number | null {
  return jazdaOd;
}

/** Ukončí prebiehajúci úsek. `null`, keď žiadny nebežal. */
async function ukonciUsek(): Promise<Usek | null> {
  if (!isTracking()) return null;
  const od = startedAt ?? Date.now();
  const r = nativeTripId ? await stopNative() : stopWeb();
  /*
    Trvanie úseku radšej z časových značiek bodov než z hodín telefónu: keď
    appka na chvíľu zaspí alebo sa poloha prestane hlásiť, hodiny bežia ďalej
    a priemerná rýchlosť by vyšla nižšia, než sa naozaj išlo.
  */
  const zBodov = r.points.length >= 2 ? r.points[r.points.length - 1].ts - r.points[0].ts : 0;
  return {
    distance_km: r.distance_km,
    points: r.points,
    trvanie_ms: zBodov > 0 ? zBodov : Math.max(0, Date.now() - od),
    // Plugin hlási svoje maximum, prehliadač si ho spočítame z trasy sami.
    max_kmh: r.max_speed_kmh ?? maxRychlost(r.points),
  };
}

function stopWeb(): VysledokMerania {
  try {
    if (webWatchId !== null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(webWatchId);
    }
  } catch {
    // watch už mohol byť zrušený systémom — cieľom je len uvoľniť ho
  }
  webWatchId = null;
  const distance = vzdialenostKm(points);
  const start = points[0] ?? null;
  const end = points[points.length - 1] ?? null;
  const duration_min = startedAt ? Math.round((Date.now() - startedAt) / 60000) : 0;
  const result: VysledokMerania = {
    distance_km: Math.round(distance * 100) / 100,
    duration_min,
    duration_sec: startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0,
    // Priemer za celú jazdu skladá `stopTracking`; jeden úsek ho nepozná.
    avg_speed_kmh: null,
    max_speed_kmh: maxRychlost(points) || null,
    start,
    end,
    points: [...points],
  };
  points = [];
  startedAt = null;
  return result;
}

async function stopNative(): Promise<VysledokMerania> {
  if (nativePoll) clearInterval(nativePoll);
  nativePoll = null;

  let kmSpolu = nativeDistanceKm;
  let trasa: Point[] = [];
  let od = startedAt ?? Date.now();
  let doKedy = Date.now();
  let maxKmh = 0;

  try {
    const { DriveDetector } = await import("@faktero/drive-detector");
    const jazda = await DriveDetector.endTrip();
    if (jazda) {
      kmSpolu = jazda.distanceMeters / 1000;
      // Plugin meria rýchlosť priamo z GPS, nie dopočtom z bodov — je to
      // presnejšie, tak sa použije jeho hodnota, keď ju dá.
      maxKmh = Number(jazda.maxSpeedKmh) || 0;
      trasa = jazda.points.map((b) => ({ lat: b.lat, lng: b.lng, ts: b.timestamp }));
      od = jazda.startedAt;
      doKedy = jazda.endedAt ?? Date.now();
      // Jazdu ukladá do knihy jázd volajúca obrazovka, takže plugin ju už
      // nemá komu ponúkať. Zamietnuť sa nesmie — to by na pol hodiny umlčalo
      // aj automatickú detekciu.
      await DriveDetector.markSynced({ tripId: jazda.id });
    }
    await eskalujNaPozadie();
  } catch {
    // Jazdu už máme spočítanú z priebežného stavu; keď sa ukončenie nepodarí,
    // radšej uložíme, čo vieme, než by sa stratila celá.
  }

  nativeTripId = null;
  nativeDistanceKm = 0;
  startedAt = null;

  const max = maxKmh || maxRychlost(trasa);
  return {
    distance_km: Math.round(kmSpolu * 100) / 100,
    duration_min: Math.round((doKedy - od) / 60000),
    duration_sec: Math.round((doKedy - od) / 1000),
    avg_speed_kmh: null,
    max_speed_kmh: max > 0 ? Math.round(max * 10) / 10 : null,
    start: trasa[0] ?? null,
    end: trasa[trasa.length - 1] ?? null,
    points: trasa,
  };
}

/**
 * Povolenie „vždy" sa pýta až po prvej dokončenej jazde. Apple žiadosť hneď
 * pri štarte pri kontrole odmieta a používateľ v tej chvíli aj tak nevie, načo
 * to je.
 */
async function eskalujNaPozadie(): Promise<void> {
  try {
    if (typeof localStorage === "undefined") return;
    if (localStorage.getItem(KLUC_ESKALACIE) === "1") return;
    localStorage.setItem(KLUC_ESKALACIE, "1");
    const { DriveDetector } = await import("@faktero/drive-detector");
    await DriveDetector.requestBackgroundPermission();
  } catch {
    /* povolenie navyše nie je nič, čo by malo zhodiť uloženie jazdy */
  }
}

export function isTracking(): boolean {
  return nativeTripId !== null || webWatchId !== null;
}

export function getCurrentDistanceKm(): number {
  // Úseky spred páuz sa počítajú tiež — inak by počítadlo po pauze spadlo na nulu.
  const zUsekov = useky.reduce((s, u) => s + u.distance_km, 0);
  if (nativeTripId) return Math.round((zUsekov + nativeDistanceKm) * 100) / 100;
  return Math.round((zUsekov + vzdialenostKm(points)) * 100) / 100;
}
