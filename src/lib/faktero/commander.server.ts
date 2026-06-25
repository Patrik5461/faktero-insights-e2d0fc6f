/**
 * Commander GPS REST API v1 client.
 * Server-only — uses Basic Auth with credentials stored encrypted per company.
 */
const BASE = "https://online.commander-systems.com/api/v1";

export type CommanderVehicle = {
  vehicleId: string | number;
  vehicleName?: string;
  vehicleRegistrationPlate?: string;
  vin?: string;
  mainFuelType?: string;
  combinedKmConsumption?: number;
  theoreticalConsumption?: number;
};

export type CommanderRide = {
  rideId?: string | number;
  id?: string | number;
  vehicleId?: string | number;
  driverName?: string;
  datetimeStart?: string;
  datetimeEnd?: string;
  startAddress?: string;
  endAddress?: string;
  startLatitude?: number;
  startLongitude?: number;
  endLatitude?: number;
  endLongitude?: number;
  startTacho?: number;
  endTacho?: number;
  distance?: number;
  rideType?: string; // BUSINESS_RIDE | PRIVAT_RIDE
  [k: string]: any;
};

export class CommanderRateLimitError extends Error {
  constructor() { super("rate_limited"); }
}
export class CommanderAuthError extends Error {
  constructor(msg = "unauthorized") { super(msg); }
}

function authHeader(username: string, password: string): string {
  const b64 = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${b64}`;
}

async function call<T>(
  path: string,
  username: string,
  password: string,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(BASE + path);
  if (query) for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Authorization": authHeader(username, password),
      "Accept": "application/json",
    },
  });
  if (res.status === 401 || res.status === 403) throw new CommanderAuthError();
  if (res.status === 429) throw new CommanderRateLimitError();
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[commander] GET ${url.toString()} -> ${res.status} ${text.slice(0, 500)}`);
    throw new Error(`Commander API ${res.status}: ${text.slice(0, 300)}`);
  }
  console.log(`[commander] GET ${url.toString()} -> ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) {
    const text = await res.text();
    try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
  }
  return (await res.json()) as T;
}

export async function commanderTest(username: string, password: string): Promise<boolean> {
  await call<unknown>("/vehicles", username, password);
  return true;
}

export async function commanderListVehicles(username: string, password: string): Promise<CommanderVehicle[]> {
  const data = await call<any>("/vehicles", username, password);
  if (Array.isArray(data)) return data;
  if (data?.vehicles && Array.isArray(data.vehicles)) return data.vehicles;
  if (data?.data && Array.isArray(data.data)) return data.data;
  return [];
}

export async function commanderListRides(
  username: string,
  password: string,
  vehicleId: string,
  from: Date,
  to: Date,
  maxPages = 20,
): Promise<CommanderRide[]> {
  const out: CommanderRide[] = [];
  // Commander expects Unix epoch SECONDS for datetimeStart / datetimeEnd, not ISO 8601.
  const fromEpoch = Math.floor(from.getTime() / 1000);
  const toEpoch = Math.floor(to.getTime() / 1000);
  for (let page = 1; page <= maxPages; page++) {
    const data = await call<any>(`/rides/${encodeURIComponent(vehicleId)}`, username, password, {
      datetimeStart: fromEpoch,
      datetimeEnd: toEpoch,
      page,
    });
    const arr: CommanderRide[] = Array.isArray(data)
      ? data
      : (data?.rides ?? data?.data ?? []);
    if (!arr.length) break;
    out.push(...arr);
    if (arr.length < 100) break;
  }
  return out;
}

export function mapFuelType(s?: string | null): string | null {
  if (!s) return null;
  const v = s.toUpperCase();
  if (v.includes("DIESEL") || v.includes("NAFTA")) return "diesel";
  if (v.includes("PETROL") || v.includes("BENZIN") || v.includes("GASOLINE")) return "petrol";
  if (v.includes("LPG")) return "lpg";
  if (v.includes("CNG")) return "cng";
  if (v.includes("ELECTRIC") || v.includes("EV")) return "electric";
  if (v.includes("HYBRID")) return "hybrid";
  return null;
}

export function mapRideTypePurpose(t?: string | null): string {
  const v = (t ?? "").toUpperCase();
  if (v.startsWith("PRIVAT")) return "Súkromná jazda";
  if (v.startsWith("BUSINESS")) return "Služobná cesta";
  return "Služobná cesta";
}

export function pickRideId(r: CommanderRide): string | null {
  const id = r.rideId ?? r.id ?? null;
  return id == null ? null : String(id);
}

export function pickLocation(addr?: string, lat?: number, lng?: number): string | null {
  if (addr && addr.trim()) return addr.trim();
  if (typeof lat === "number" && typeof lng === "number") return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return null;
}

// ---------- Robust alias-based field resolvers ----------
// Commander payloads vary across accounts / API versions. Read defensively.

function readPath(obj: any, path: string): any {
  if (obj == null) return undefined;
  const parts = path.split(".");
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function firstDefined(obj: any, keys: string[]): any {
  for (const k of keys) {
    const v = readPath(obj, k);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

export function getRideId(r: any): string | null {
  const v = firstDefined(r, ["rideId", "id", "ride_id", "externalId", "external_id", "uuid"]);
  return v == null ? null : String(v);
}

export function getRideVehicleId(r: any): string | null {
  const v = firstDefined(r, ["vehicleId", "vehicle_id", "vehicle.id", "carId", "objectId", "vehicle.vehicleId"]);
  return v == null ? null : String(v);
}

export function getRideStartDate(r: any): unknown {
  return firstDefined(r, [
    "datetimeStart", "dateTimeStart", "startDateTime", "startTime", "startedAt",
    "dateFrom", "from", "begin", "timestamp",
    "start.datetime", "start.time", "start.date", "start.timestamp", "start.dateTime",
  ]);
}

export function getRideEndDate(r: any): unknown {
  return firstDefined(r, [
    "datetimeEnd", "dateTimeEnd", "endDateTime", "endTime", "endedAt",
    "dateTo", "to", "finish", "endTimestamp",
    "end.datetime", "end.time", "end.date", "end.timestamp", "end.dateTime",
  ]);
}

export function getRideDistance(r: any): number | null {
  const v = firstDefined(r, ["distance", "distanceKm", "distance_km", "length", "km", "routeLength", "totalDistance"]);
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function getRideStartOdometer(r: any): number | null {
  const v = firstDefined(r, ["startTacho", "startOdometer", "start_odometer", "odometerStart", "start.tacho", "start.odometer"]);
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function getRideEndOdometer(r: any): number | null {
  const v = firstDefined(r, ["endTacho", "endOdometer", "end_odometer", "odometerEnd", "end.tacho", "end.odometer"]);
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function getRideStartLocation(r: any): string | null {
  const addr = firstDefined(r, ["startAddress", "start_address", "start.address", "startLocation", "start.location", "fromAddress", "origin"]);
  if (addr) return String(addr).trim();
  const lat = firstDefined(r, ["startLatitude", "start.latitude", "start.lat", "startLat"]);
  const lng = firstDefined(r, ["startLongitude", "start.longitude", "start.lng", "startLng", "startLon"]);
  if (typeof lat === "number" && typeof lng === "number") return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return null;
}

export function getRideEndLocation(r: any): string | null {
  const addr = firstDefined(r, ["endAddress", "end_address", "end.address", "endLocation", "end.location", "toAddress", "destination"]);
  if (addr) return String(addr).trim();
  const lat = firstDefined(r, ["endLatitude", "end.latitude", "end.lat", "endLat"]);
  const lng = firstDefined(r, ["endLongitude", "end.longitude", "end.lng", "endLng", "endLon"]);
  if (typeof lat === "number" && typeof lng === "number") return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return null;
}

export function getRideType(r: any): string | undefined {
  const v = firstDefined(r, ["rideType", "type", "category", "kind"]);
  return v == null ? undefined : String(v);
}

export function getRideDriver(r: any): string | null {
  const v = firstDefined(r, ["driverName", "driver_name", "driver.name", "driver", "userName", "user.name"]);
  return v == null ? null : String(v);
}