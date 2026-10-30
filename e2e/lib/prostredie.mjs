/*
  Prostredie E2E testov: adresa webu, Supabase, QA účet a firmy.

  Heslo QA účtu nie je nikde v repe. Číta sa z premennej `QA_HESLO`, a keď
  chýba, zo súboru `E2E_TAJOMSTVA` (predvolene /home/patrik/.faktero-e2e.env,
  práva 600, riadok `QA_HESLO=…`). Adresa Supabase a verejný kľúč sa berú
  z prostredia alebo z `.env` repa — verejný kľúč je aj tak v každej stránke.
*/
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const E2E_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_DIR = path.resolve(E2E_DIR, "..");
/** Repo, z ktorého sa nasadzuje — tam je `.env` a `node_modules`. */
export const HLAVNE_REPO = process.env.E2E_REPO || "/home/patrik/faktero-invoice-hub";
export const QA_PLAYWRIGHT = process.env.E2E_QA_PLAYWRIGHT || "/home/patrik/qa-playwright";

export const BASE = (process.env.BASE || "https://www.faktero.sk").replace(/\/$/, "");
export const QA_EMAIL = process.env.QA_EMAIL || "efaktura-qa@faktero.sk";

/** Firmy QA účtu — jediné, do ktorých testy zapisujú. */
export const FIRMY = {
  test: "ec3ff79b-1bbc-4726-80e3-93577751a123",
  test2: "dfe7e0d7-77a9-4ede-b978-d3ee8f896f15",
  cz: "bf72406d-e40a-43c9-ada2-40c9330fae80",
};
/** Cudzia firma (PALIERA) — len na overenie, že ju QA účet nevidí. */
export const CUDZIA_FIRMA = "ee86eb5f-57b7-445a-9b3c-8e6058a905ca";

function citajEnvSubor(cesta) {
  if (!existsSync(cesta)) return {};
  const von = {};
  for (const riadok of readFileSync(cesta, "utf8").split("\n")) {
    const m = riadok.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) von[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return von;
}

export const SUBOR_TAJOMSTIEV = process.env.E2E_TAJOMSTVA || "/home/patrik/.faktero-e2e.env";

/** Heslo QA účtu, alebo null (beh sa potom nespustí). */
export function qaHeslo() {
  if (process.env.QA_HESLO) return process.env.QA_HESLO;
  const z = citajEnvSubor(SUBOR_TAJOMSTIEV);
  if (z.QA_HESLO) {
    const prava = statSync(SUBOR_TAJOMSTIEV).mode & 0o077;
    if (prava) console.warn(`POZOR: ${SUBOR_TAJOMSTIEV} je čitateľný aj pre iných (chmod 600)`);
    return z.QA_HESLO;
  }
  return null;
}

function supabaseKonfig() {
  const env = {
    ...citajEnvSubor(path.join(HLAVNE_REPO, ".env")),
    ...citajEnvSubor(path.join(REPO_DIR, ".env")),
  };
  const url = process.env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const kluc =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !kluc) throw new Error("Chýba SUPABASE_URL / publishable kľúč (prostredie ani .env)");
  return { url: url.replace(/\/$/, ""), kluc };
}
export const SUPABASE = supabaseKonfig();

/** Playwright: z repa, a keď tam nie je, z /home/patrik/qa-playwright. */
export async function nacitajPlaywright() {
  let mod;
  try {
    mod = await import("playwright");
  } catch {
    const req = createRequire(path.join(QA_PLAYWRIGHT, "package.json"));
    mod = await import(req.resolve("playwright"));
  }
  return mod.chromium ? mod : mod.default;
}

/** Modul z node_modules repa (pdfjs, libxml2-wasm) — e2e nemá vlastné závislosti. */
export function cestaModulu(meno) {
  for (const koren of [REPO_DIR, HLAVNE_REPO]) {
    try {
      return createRequire(path.join(koren, "package.json")).resolve(meno);
    } catch {
      /* skúsi ďalší */
    }
  }
  throw new Error(`Modul ${meno} sa nenašiel`);
}

/* ------------------------------------------------------------------ REST */

/** Prihlásenie QA používateľa cez Supabase Auth — JWT pre REST kontroly. */
export async function prihlasRest(heslo) {
  const r = await fetch(`${SUPABASE.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE.kluc, "content-type": "application/json" },
    body: JSON.stringify({ email: QA_EMAIL, password: heslo }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token)
    throw new Error(
      `Prihlásenie cez REST zlyhalo: ${r.status} ${j.error_description ?? j.msg ?? ""}`,
    );
  return { jwt: j.access_token, userId: j.user?.id };
}

/**
 * Malý klient PostgREST s JWT QA používateľa (alebo bez neho = anon).
 * Vracia { status, data, text }; nehádže pri 4xx — test si stav kontroluje sám.
 */
export function restKlient(jwt) {
  const volaj = async (metoda, cesta, telo, { anon = false, hlavicky = {} } = {}) => {
    const h = {
      apikey: SUPABASE.kluc,
      "content-type": "application/json",
      Prefer: "return=representation",
      ...hlavicky,
    };
    if (!anon && jwt) h.Authorization = `Bearer ${jwt}`;
    const r = await fetch(`${SUPABASE.url}/rest/v1/${cesta}`, {
      method: metoda,
      headers: h,
      body: telo === undefined ? undefined : JSON.stringify(telo),
    });
    const text = await r.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { status: r.status, data, text, hlavicky: r.headers };
  };
  return {
    get: (c, o) => volaj("GET", c, undefined, o),
    post: (c, t, o) => volaj("POST", c, t, o),
    patch: (c, t, o) => volaj("PATCH", c, t, o),
    delete: (c, o) => volaj("DELETE", c, undefined, o),
    rpc: (meno, args, o) => volaj("POST", `rpc/${meno}`, args ?? {}, o),
    /** Počet riadkov (HEAD s count=exact). */
    pocet: async (cesta) => {
      const r = await fetch(`${SUPABASE.url}/rest/v1/${cesta}`, {
        method: "HEAD",
        headers: {
          apikey: SUPABASE.kluc,
          Authorization: `Bearer ${jwt}`,
          Prefer: "count=exact",
        },
      });
      const rozsah = r.headers.get("content-range") ?? "";
      return Number(rozsah.split("/")[1] ?? NaN);
    },
    /** Zapíše a vráti prvý riadok; pri chybe hodí výnimku s telom odpovede. */
    vloz: async (tabulka, riadok) => {
      const r = await volaj("POST", tabulka, riadok);
      if (r.status >= 300)
        throw new Error(`INSERT ${tabulka}: ${r.status} ${r.text.slice(0, 300)}`);
      return Array.isArray(r.data) ? r.data[0] : r.data;
    },
  };
}

/** Dnešný dátum RRRR-MM-DD podľa Bratislavy (nie UTC). */
export function dnes() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(new Date());
}
