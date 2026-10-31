/**
 * Demo účty a náhrada Supabase Auth (`/auth/v1`).
 *
 * Token je obyčajný JWT s vymysleným podpisom (HS256) — supabase-js ho
 * v prehliadači len dekóduje a server (`requireSupabaseAuth` → `getClaims`)
 * pri HS256 overuje cez `/auth/v1/user`, ktoré odpovedá táto náhrada.
 * Heslo sa nekontroluje: prihlásiť sa dá ktorýmkoľvek demo e-mailom.
 */
import { randomUUID } from "node:crypto";

export type DemoUcet = {
  id: string;
  email: string;
  meno: string;
  /** rola v demo firmách (company_users.role) */
  rola: "owner" | "admin" | "accountant" | "employee" | "custom";
  opravnenia: Record<string, "read" | "edit">;
  metadata: Record<string, unknown>;
};

export const DEMO_UCTY: DemoUcet[] = [
  {
    id: "d0000000-0000-4000-8000-000000000001",
    email: "majitel@demo.faktero.sk",
    meno: "Martina Demová",
    rola: "owner",
    opravnenia: {},
    metadata: { full_name: "Martina Demová", dizajn: "faktero" },
  },
  {
    id: "d0000000-0000-4000-8000-000000000002",
    email: "uctovnik@demo.faktero.sk",
    meno: "Peter Účtovný",
    rola: "accountant",
    opravnenia: {},
    metadata: { full_name: "Peter Účtovný", dizajn: "faktero" },
  },
  {
    id: "d0000000-0000-4000-8000-000000000003",
    email: "vlastny@demo.faktero.sk",
    meno: "Jana Obmedzená",
    rola: "custom",
    opravnenia: { faktury: "edit", doklady: "read", kontakty: "edit", sklad: "read" },
    metadata: { full_name: "Jana Obmedzená", dizajn: "faktero" },
  },
];

export function ucetPodlaId(id: string | null | undefined) {
  return DEMO_UCTY.find((u) => u.id === id) ?? null;
}

function b64url(o: unknown): string {
  return Buffer.from(JSON.stringify(o)).toString("base64url");
}

export function dekodujToken(token: string | null | undefined): Record<string, any> | null {
  if (!token) return null;
  const casti = token.split(".");
  if (casti.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(casti[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function pouzivatelJson(u: DemoUcet) {
  const teraz = "2025-01-15T08:00:00.000Z";
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: teraz,
    phone: "",
    confirmed_at: teraz,
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { ...u.metadata, email: u.email },
    identities: [],
    factors: [],
    created_at: teraz,
    updated_at: new Date().toISOString(),
    is_anonymous: false,
  };
}

export function vyrobRelaciu(u: DemoUcet) {
  const teraz = Math.floor(Date.now() / 1000);
  const exp = teraz + 60 * 60 * 24 * 365;
  const access = [
    b64url({ alg: "HS256", typ: "JWT" }),
    b64url({
      aud: "authenticated",
      exp,
      iat: teraz,
      iss: "demo-preview",
      sub: u.id,
      email: u.email,
      phone: "",
      role: "authenticated",
      aal: "aal1",
      amr: [{ method: "password", timestamp: teraz }],
      session_id: randomUUID(),
      is_anonymous: false,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: u.metadata,
    }),
    Buffer.from("demo-podpis-bez-platnosti-32bytes").toString("base64url"),
  ].join(".");
  return {
    access_token: access,
    token_type: "bearer",
    expires_in: exp - teraz,
    expires_at: exp,
    refresh_token: `demo-refresh-${u.id}`,
    user: pouzivatelJson(u),
  };
}
