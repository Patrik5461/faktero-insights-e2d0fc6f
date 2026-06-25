/**
 * Tesla Fleet API client (server-only).
 * OAuth 2.0 authorization code flow + Fleet API v1.
 * Region: EU. Docs: https://developer.tesla.com/docs/fleet-api
 */
const AUTH_BASE = "https://auth.tesla.com/oauth2/v3";
// EU Fleet API host (Slovakia/Europe accounts). Change to NA host for US accounts.
export const FLEET_API_BASE = "https://fleet-api.prod.eu.vn.cloud.tesla.com";

export const TESLA_SCOPES = [
  "openid",
  "offline_access",
  "vehicle_device_data",
  "vehicle_location",
];

export class TeslaAuthError extends Error {
  constructor(msg = "unauthorized") { super(msg); }
}

function clientCreds() {
  const id = process.env.TESLA_CLIENT_ID;
  const secret = process.env.TESLA_CLIENT_SECRET;
  const redirect = process.env.TESLA_REDIRECT_URI;
  if (!id || !secret || !redirect) {
    throw new Error("Tesla integrácia nie je nakonfigurovaná. Chýbajú TESLA_CLIENT_ID / TESLA_CLIENT_SECRET / TESLA_REDIRECT_URI.");
  }
  return { id, secret, redirect };
}

export function getTeslaAuthUrl(state: string): string {
  const { id, redirect } = clientCreds();
  const u = new URL(AUTH_BASE + "/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", id);
  u.searchParams.set("redirect_uri", redirect);
  u.searchParams.set("scope", TESLA_SCOPES.join(" "));
  u.searchParams.set("state", state);
  u.searchParams.set("prompt", "login");
  return u.toString();
}

export type TeslaTokenResponse = {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
};

export async function exchangeTeslaCode(code: string): Promise<TeslaTokenResponse> {
  const { id, secret, redirect } = clientCreds();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: id,
    client_secret: secret,
    code,
    redirect_uri: redirect,
    audience: FLEET_API_BASE,
  });
  const res = await fetch(AUTH_BASE + "/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Tesla token exchange ${res.status}: ${t.slice(0, 300)}`);
  }
  return (await res.json()) as TeslaTokenResponse;
}

export async function refreshTeslaToken(refreshToken: string): Promise<TeslaTokenResponse> {
  const { id } = clientCreds();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: id,
    refresh_token: refreshToken,
    scope: TESLA_SCOPES.join(" "),
  });
  const res = await fetch(AUTH_BASE + "/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (res.status === 401 || res.status === 400) throw new TeslaAuthError("refresh_failed");
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Tesla refresh ${res.status}: ${t.slice(0, 300)}`);
  }
  return (await res.json()) as TeslaTokenResponse;
}

async function fleetCall<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(FLEET_API_BASE + path, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (res.status === 401 || res.status === 403) throw new TeslaAuthError();
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Tesla Fleet ${res.status}: ${t.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export type TeslaVehicle = {
  id: number | string;
  vehicle_id?: number | string;
  vin?: string;
  display_name?: string;
  state?: string;
  [k: string]: any;
};

export async function listTeslaVehicles(accessToken: string): Promise<TeslaVehicle[]> {
  const data = await fleetCall<any>(accessToken, "/api/1/vehicles");
  return data?.response ?? [];
}

export async function getTeslaVehicleData(accessToken: string, vehicleTag: string): Promise<any> {
  // vehicleTag is the Tesla vehicle id (or VIN). Endpoints attempt to wake-on-demand for some fields.
  const data = await fleetCall<any>(
    accessToken,
    `/api/1/vehicles/${encodeURIComponent(vehicleTag)}/vehicle_data?endpoints=${encodeURIComponent("location_data;vehicle_state;drive_state")}`,
  );
  return data?.response ?? null;
}

export function extractOdometerKm(vehicleData: any): number | null {
  const miles = vehicleData?.vehicle_state?.odometer;
  if (typeof miles !== "number" || !Number.isFinite(miles)) return null;
  return Math.round(miles * 1.609344 * 100) / 100;
}

export function extractLatLng(vehicleData: any): { lat: number | null; lng: number | null } {
  const lat = vehicleData?.drive_state?.latitude ?? vehicleData?.drive_state?.native_latitude;
  const lng = vehicleData?.drive_state?.longitude ?? vehicleData?.drive_state?.native_longitude;
  return {
    lat: typeof lat === "number" ? lat : null,
    lng: typeof lng === "number" ? lng : null,
  };
}

export function extractShiftState(vehicleData: any): string | null {
  return vehicleData?.drive_state?.shift_state ?? null;
}