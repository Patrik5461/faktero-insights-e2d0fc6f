/**
 * GPS tracker pre knihu jázd. Sleduje pozíciu na pozadí (foreground na iOS bez
 * background-location capability), počíta vzdialenosť Haversinom.
 *
 * Vráti záznam použiteľný na uloženie do `trips`.
 */
type Point = { lat: number; lng: number; ts: number };

let watchId: string | null = null;
let points: Point[] = [];
let startedAt: number | null = null;

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

export async function startTracking(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    const perm = await Geolocation.requestPermissions();
    if (perm.location !== "granted") return { ok: false, error: "Bez povolenia polohy" };
    points = [];
    startedAt = Date.now();
    watchId = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 10000 }, (pos, err) => {
      if (err || !pos) return;
      points.push({ lat: pos.coords.latitude, lng: pos.coords.longitude, ts: pos.timestamp });
    });
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
  try {
    if (watchId) {
      const { Geolocation } = await import("@capacitor/geolocation");
      await Geolocation.clearWatch({ id: watchId });
    }
  } catch {}
  watchId = null;
  let distance = 0;
  for (let i = 1; i < points.length; i++) distance += haversineKm(points[i - 1], points[i]);
  const start = points[0] ?? null;
  const end = points[points.length - 1] ?? null;
  const duration_min = startedAt ? Math.round((Date.now() - startedAt) / 60000) : 0;
  const result = { distance_km: Math.round(distance * 100) / 100, duration_min, start, end, points: [...points] };
  points = [];
  startedAt = null;
  return result;
}

export function isTracking(): boolean { return watchId !== null; }
export function getCurrentDistanceKm(): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversineKm(points[i - 1], points[i]);
  return Math.round(d * 100) / 100;
}
