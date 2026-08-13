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

/** Na „vždy" sa pýtame až po prvom skutočnom meraní, nie pri štarte appky. */
const KLUC_ESKALACIE = "faktero.gps.background_asked";

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

export async function stopTracking(): Promise<{
  distance_km: number;
  duration_min: number;
  start: Point | null;
  end: Point | null;
  points: Point[];
}> {
  if (nativeTripId) return stopNative();

  try {
    if (webWatchId !== null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(webWatchId);
    }
  } catch {
    // watch už mohol byť zrušený systémom — cieľom je len uvoľniť ho
  }
  webWatchId = null;
  let distance = 0;
  for (let i = 1; i < points.length; i++) distance += haversineKm(points[i - 1], points[i]);
  const start = points[0] ?? null;
  const end = points[points.length - 1] ?? null;
  const duration_min = startedAt ? Math.round((Date.now() - startedAt) / 60000) : 0;
  const result = {
    distance_km: Math.round(distance * 100) / 100,
    duration_min,
    start,
    end,
    points: [...points],
  };
  points = [];
  startedAt = null;
  return result;
}

async function stopNative() {
  if (nativePoll) clearInterval(nativePoll);
  nativePoll = null;

  let vzdialenostKm = nativeDistanceKm;
  let trasa: Point[] = [];
  let od = startedAt ?? Date.now();
  let doKedy = Date.now();

  try {
    const { DriveDetector } = await import("@faktero/drive-detector");
    const jazda = await DriveDetector.endTrip();
    if (jazda) {
      vzdialenostKm = jazda.distanceMeters / 1000;
      trasa = jazda.points.map((b) => ({ lat: b.lat, lng: b.lng, ts: b.timestamp }));
      od = jazda.startedAt;
      doKedy = jazda.endedAt ?? Date.now();
      // Jazda ide do knihy jázd ako služobná, takže je vybavená. Zamietnuť sa
      // nesmie — to by na pol hodiny umlčalo aj automatickú detekciu.
      await DriveDetector.confirmTrip({ tripId: jazda.id, classification: "business" });
    }
    await eskalujNaPozadie();
  } catch {
    // Jazdu už máme spočítanú z priebežného stavu; keď sa ukončenie nepodarí,
    // radšej uložíme, čo vieme, než by sa stratila celá.
  }

  nativeTripId = null;
  nativeDistanceKm = 0;
  startedAt = null;

  return {
    distance_km: Math.round(vzdialenostKm * 100) / 100,
    duration_min: Math.round((doKedy - od) / 60000),
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
  if (nativeTripId) return Math.round(nativeDistanceKm * 100) / 100;
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversineKm(points[i - 1], points[i]);
  return Math.round(d * 100) / 100;
}
