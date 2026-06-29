/**
 * Commander GPS REST API v1 client.
 * Server-only — uses HTTP Basic Auth with credentials stored encrypted per company.
 *
 * Docs: https://online.commander-systems.com/api/v1/
 * Auth: Basic base64(COMMANDER_USERNAME:COMMANDER_PASSWORD)
 * Rate limit: 300 req/window; honors X-RateLimit-* + Retry-After.
 * Time params: datetimeStart / datetimeEnd are Unix epoch SECONDS.
 */
const BASE = "https://online.commander-systems.com/api/v1";

export type CommanderVehicle = {
  vehicleId: string | number;
  vehicleName?: string;
  vehicleRegistrationPlate?: string;
  vehicleDefaultDriver?: string;
  lastCommunication?: string | number;
  vin?: string;
  deleted?: boolean;
  objectType?: string;
  isElectricCar?: boolean;
  mainFuelType?: string;
  combinedKmConsumption?: number;
  theoreticalConsumption?: number;
  [k: string]: any;
};

export type CommanderRide = {
  rideId?: string | number;
  rideType?: string; // BUSINESS_RIDE | PRIVAT_RIDE
  vehicleId?: string | number;
  vehicleRegistrationPlate?: string;
  driverId?: string | number;
  driverName?: string;
  note?: string;
  startTime?: string | number;
  stopTime?: string | number;
  latStart?: number | string | null;
  lonStart?: number | string | null;
  latStop?: number | string | null;
  lonStop?: number | string | null;
  startAddress?: string;
  stopAddress?: string;
  avgSpeed?: number | string;
  maxSpeed?: number | string;
  duration?: number | string;
  distance?: number | string;
  odometerStart?: number | string;
  odometerStop?: number | string;
  fuelConsumed?: number | string;
  averageConsumption?: number | string;
  refueling?: any[];
  waypoints?: any[];
  notes?: any[];
  contracts?: any;
  [k: string]: any;
};

export class CommanderRateLimitError extends Error {
  retryAfterSeconds?: number;
  constructor(retryAfterSeconds?: number) {
    super("rate_limited");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
export class CommanderAuthError extends Error {
  constructor(msg = "unauthorized") { super(msg); }
}

function authHeader(username: string, password: string): string {
  const b64 = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${b64}`;
}

function parseRetryAfter(h: string | null): number | undefined {
  if (!h) return undefined;
  const n = Number(h);
  if (Number.isFinite(n) && n >= 0) return n;
  const ts = Date.parse(h);
  if (Number.isFinite(ts)) return Math.max(0, Math.ceil((ts - Date.now()) / 1000));
  return undefined;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function call<T>(
  path: string,
  username: string,
  password: string,
  query?: Record<string, string | number | undefined>,
  opts: { retryOn429?: boolean } = {},
): Promise<T> {
  const url = new URL(BASE + path);
  if (query) for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const doFetch = async () => fetch(url.toString(), {
    method: "GET",
    headers: {
      "Authorization": authHeader(username, password),
      "Accept": "application/json",
    },
  });

  let res = await doFetch();

  // Honor rate-limit hint proactively if next call would hit the wall.
  const remaining = Number(res.headers.get("X-RateLimit-Remaining") ?? "");
  const reset = Number(res.headers.get("X-RateLimit-Reset") ?? "");
  if (Number.isFinite(remaining) && remaining <= 0 && Number.isFinite(reset)) {
    const waitMs = Math.max(0, reset * 1000 - Date.now());
    if (waitMs > 0 && waitMs < 60_000) await sleep(waitMs);
  }

  if (res.status === 429) {
    const retryAfter = parseRetryAfter(res.headers.get("Retry-After"))
      ?? parseRetryAfter(res.headers.get("X-RateLimit-Reset"));
    if (opts.retryOn429 !== false && retryAfter !== undefined && retryAfter <= 30) {
      await sleep((retryAfter + 1) * 1000);
      res = await doFetch();
      if (res.status === 429) throw new CommanderRateLimitError(retryAfter);
    } else {
      throw new CommanderRateLimitError(retryAfter);
    }
  }
  if (res.status === 401 || res.status === 403) throw new CommanderAuthError();
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[commander] GET ${url.toString()} -> ${res.status} ${text.slice(0, 500)}`);
    throw new Error(`Commander API ${res.status}: ${text.slice(0, 300)}`);
  }
  console.log(`[commander] GET ${url.toString()} -> ${res.status} (remaining=${res.headers.get("X-RateLimit-Remaining") ?? "?"})`);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) {
    const text = await res.text();
    try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
  }
  return (await res.json()) as T;
}

export async function commanderTest(username: string, password: string): Promise<boolean> {
  // Light endpoint; /vehicles can be heavy. Use /last-positions which always exists.
  await call<unknown>("/vehicles", username, password);
  return true;
}

/** Per docs: call MAX 1x/day. Caller is responsible for caching the result. */
export async function commanderListVehicles(username: string, password: string): Promise<CommanderVehicle[]> {
  const data = await call<any>("/vehicles", username, password);
  if (Array.isArray(data)) return data;
  if (data?.vehicles && Array.isArray(data.vehicles)) return data.vehicles;
  if (data?.data && Array.isArray(data.data)) return data.data;
  return [];
}

export async function commanderGetVehicle(username: string, password: string, vehicleId: string | number) {
  return call<any>(`/vehicles/${encodeURIComponent(String(vehicleId))}`, username, password);
}

/**
 * List rides for ONE vehicle. Docs: 100 records/page, datetimeStart/End in Unix seconds.
 * Uses totalPages from response when present; falls back to "stop when empty".
 */
export async function commanderListRides(
  username: string,
  password: string,
  vehicleId: string,
  from: Date,
  to: Date,
  maxPages = 50,
): Promise<CommanderRide[]> {
  const out: CommanderRide[] = [];
  const fromEpoch = Math.floor(from.getTime() / 1000);
  const toEpoch = Math.floor(to.getTime() / 1000);
  let totalPages = maxPages;
  for (let page = 1; page <= Math.min(totalPages, maxPages); page++) {
    const data = await call<any>(`/rides/${encodeURIComponent(vehicleId)}`, username, password, {
      datetimeStart: fromEpoch,
      datetimeEnd: toEpoch,
      page,
    });
    const arr: CommanderRide[] = Array.isArray(data)
      ? data
      : (data?.rides ?? data?.data ?? []);
    const tp = Number(data?.totalPages ?? data?.total_pages);
    if (Number.isFinite(tp) && tp > 0) totalPages = tp;
    if (!arr.length) break;
    out.push(...arr);
    if (!Number.isFinite(tp) && arr.length < 100) break;
  }
  return out;
}

/**
 * All-rides endpoint — returns every customer ride across vehicles in a window.
 * Docs: limit max 1000, datetimeStart/End in Unix seconds, paginated via page/totalPages.
 */
export async function commanderListAllRides(
  username: string,
  password: string,
  from: Date,
  to: Date,
  opts: { limit?: number; maxPages?: number } = {},
): Promise<CommanderRide[]> {
  const limit = Math.max(1, Math.min(1000, opts.limit ?? 1000));
  const maxPages = opts.maxPages ?? 50;
  const fromEpoch = Math.floor(from.getTime() / 1000);
  const toEpoch = Math.floor(to.getTime() / 1000);
  const out: CommanderRide[] = [];
  let totalPages = maxPages;
  for (let page = 1; page <= Math.min(totalPages, maxPages); page++) {
    const data = await call<any>("/all-rides", username, password, {
      datetimeStart: fromEpoch,
      datetimeEnd: toEpoch,
      page,
      limit,
    });
    const arr: CommanderRide[] = Array.isArray(data)
      ? data
      : (data?.rides ?? data?.data ?? []);
    const tp = Number(data?.totalPages ?? data?.total_pages);
    if (Number.isFinite(tp) && tp > 0) totalPages = tp;
    if (!arr.length) break;
    out.push(...arr);
    if (!Number.isFinite(tp) && arr.length < limit) break;
  }
  return out;
}

export async function commanderLastPositions(username: string, password: string) {
  const data = await call<any>("/last-positions", username, password);
  return (data?.positions ?? data?.data ?? data ?? []) as any[];
}

export async function commanderListDrivers(username: string, password: string, opts: { page?: number; limit?: number } = {}) {
  const data = await call<any>("/drivers", username, password, {
    page: opts.page ?? 1,
    limit: Math.max(1, Math.min(200, opts.limit ?? 200)),
  });
  return (data?.drivers ?? data?.data ?? []) as any[];
}

export async function commanderListWaypoints(username: string, password: string) {
  const data = await call<any>("/waypoints", username, password);
  return (data?.waypoints ?? []) as any[];
}

export async function commanderListCostCenters(username: string, password: string) {
  const data = await call<any>("/cost-centers", username, password);
  return (data?.costCenters ?? []) as any[];
}

export async function commanderListContracts(username: string, password: string) {
  const data = await call<any>("/contracts", username, password);
  return (data?.contracts ?? []) as any[];
}

export async function commanderCurrentTacho(username: string, password: string, vehicleId: string | number) {
  const data = await call<any>(`/current-tacho/${encodeURIComponent(String(vehicleId))}`, username, password);
  return data?.currentTacho ?? data;
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
  const id = r.rideId ?? (r as any).id ?? null;
  return id == null ? null : String(id);
}

export function pickLocation(addr?: string, lat?: number, lng?: number): string | null {
  if (addr && addr.trim()) return addr.trim();
  if (typeof lat === "number" && typeof lng === "number") return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return null;
}

// ---------- Robust alias-based field resolvers ----------
// Commander payloads sometimes return numbers as strings or with "," as decimal separator.

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

/** Parse a value that may be number, "5.5", or "5,5" (EU decimal). */
function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.trim().replace(/\s+/g, "").replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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
    "startTime", "datetimeStart", "dateTimeStart", "startDateTime", "startedAt",
    "dateFrom", "from", "begin", "timestamp",
    "start.datetime", "start.time", "start.date", "start.timestamp", "start.dateTime",
  ]);
}

export function getRideEndDate(r: any): unknown {
  return firstDefined(r, [
    "stopTime", "datetimeEnd", "dateTimeEnd", "endDateTime", "endTime", "endedAt",
    "dateTo", "to", "finish", "endTimestamp",
    "end.datetime", "end.time", "end.date", "end.timestamp", "end.dateTime",
  ]);
}

export function getRideDistance(r: any): number | null {
  const v = firstDefined(r, ["distance", "distanceKm", "distance_km", "length", "km", "routeLength", "totalDistance"]);
  return toNumber(v);
}

export function getRideStartOdometer(r: any): number | null {
  const v = firstDefined(r, ["odometerStart", "startTacho", "startOdometer", "start_odometer", "start.tacho", "start.odometer"]);
  return toNumber(v);
}

export function getRideEndOdometer(r: any): number | null {
  const v = firstDefined(r, ["odometerStop", "endTacho", "endOdometer", "end_odometer", "stopOdometer", "end.tacho", "end.odometer"]);
  return toNumber(v);
}

export function getRideStartLocation(r: any): string | null {
  const addr = firstDefined(r, ["startAddress", "start_address", "start.address", "startLocation", "start.location", "fromAddress", "origin"]);
  if (addr) return String(addr).trim();
  // PRIVAT_RIDE has lat/lon = null per docs — toNumber returns null and we skip.
  const lat = toNumber(firstDefined(r, ["latStart", "startLatitude", "start.latitude", "start.lat", "startLat"]));
  const lng = toNumber(firstDefined(r, ["lonStart", "startLongitude", "start.longitude", "start.lng", "startLng", "startLon"]));
  if (lat != null && lng != null) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return null;
}

export function getRideEndLocation(r: any): string | null {
  const addr = firstDefined(r, ["stopAddress", "endAddress", "end_address", "end.address", "endLocation", "end.location", "toAddress", "destination"]);
  if (addr) return String(addr).trim();
  const lat = toNumber(firstDefined(r, ["latStop", "endLatitude", "end.latitude", "end.lat", "endLat"]));
  const lng = toNumber(firstDefined(r, ["lonStop", "endLongitude", "end.longitude", "end.lng", "endLng", "endLon"]));
  if (lat != null && lng != null) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
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
