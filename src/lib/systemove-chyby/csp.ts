/*
  Content-Security-Policy — zatiaľ len v režime Report-Only.

  Hlavičku pridáva `src/server.ts` ku každej HTML odpovedi (nasadí sa bez
  roota, nginx sa jej netýka). Prehliadač nič neblokuje, len posiela hlásenia
  porušení na `/api/public/csp-report`; tie idú do Admin → Chyby (zdroj
  „prehliadač“, úroveň „varovanie“). Keď bude zoznam týždeň čistý, prepne sa
  názov hlavičky na `Content-Security-Policy`.

  Zoznam zdrojov je zistený z kódu aj z produkčného HTML (31. 10. 2026):
  - Supabase (REST, Auth, Storage, Realtime cez wss) — obrázky a PDF,
  - Cloudflare Turnstile (registrácia, faktúra zadarmo) — skript + iframe,
  - Google Tag Manager / Analytics (len po súhlase) — skript, iframe noscript, beacony,
  - Zásielkovňa (widget.packeta.com) — skript + iframe výberu výdajného miesta,
  - GoPay — presmerovanie platobnej brány (form-action / frame), logo z cdn.gopay.com,
  - dlaždice OpenStreetMap (mapa jazdy), logá Visa/Mastercard z upload.wikimedia.org
    a partnerské logá — preto img-src povolí všetko cez https:,
  - pdf.js a skener bežia ako workery z vlastného pôvodu alebo z blob:.
*/

const SUPABASE_PREDVOLENE = "https://sywcjxydnljkzoepfcaz.supabase.co";

export const CSP_REPORT_CESTA = "/api/public/csp-report";

function supabasePovod(): string {
  const env =
    (typeof process !== "undefined" &&
      (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)) ||
    "";
  try {
    return env ? new URL(env).origin : SUPABASE_PREDVOLENE;
  } catch {
    return SUPABASE_PREDVOLENE;
  }
}

/** Celá politika ako text hlavičky. */
export function politikaCsp(supabase = supabasePovod()): string {
  const wss = supabase.replace(/^https:/, "wss:");
  const gopay = "https://*.gopay.cz https://*.gopay.com";
  const google =
    "https://www.googletagmanager.com https://*.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com";
  const direktivy: [string, string][] = [
    ["default-src", "'self'"],
    [
      "script-src",
      `'self' 'unsafe-inline' https://challenges.cloudflare.com https://widget.packeta.com ${google}`,
    ],
    ["style-src", "'self' 'unsafe-inline' https://fonts.googleapis.com https://widget.packeta.com"],
    ["font-src", "'self' data: https://fonts.gstatic.com"],
    ["img-src", "'self' data: blob: https:"],
    [
      "connect-src",
      `'self' data: blob: ${supabase} ${wss} https://challenges.cloudflare.com https://widget.packeta.com ${google}`,
    ],
    [
      "frame-src",
      `'self' blob: https://challenges.cloudflare.com https://widget.packeta.com https://www.googletagmanager.com ${gopay}`,
    ],
    ["worker-src", "'self' blob:"],
    ["media-src", `'self' blob: ${supabase}`],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", `'self' ${gopay}`],
    ["frame-ancestors", "'self'"],
    ["report-uri", CSP_REPORT_CESTA],
    ["report-to", "csp"],
  ];
  return direktivy.map(([k, v]) => `${k} ${v}`).join("; ");
}

let _hlavicky: [string, string][] | null = null;
/** Hlavičky, ktoré `server.ts` pridá ku každej HTML odpovedi. */
export function hlavickyCsp(): [string, string][] {
  return (_hlavicky ??= [
    ["content-security-policy-report-only", politikaCsp()],
    ["reporting-endpoints", `csp="${CSP_REPORT_CESTA}"`],
  ]);
}

/* --------------------------------------------------------------- hlásenia */

export type CspHlasenie = {
  direktiva: string;
  /** Pôvod zablokovaného zdroja (bez cesty a parametrov) alebo kľúčové slovo (inline, eval…). */
  blokovane: string;
  /** Cesta stránky, na ktorej sa to stalo (bez parametrov). */
  stranka: string | null;
  /** Súbor, z ktorého porušenie vzišlo (bez parametrov), ak ho prehliadač uviedol. */
  subor: string | null;
};

/** Doplnky prehliadača a interné stránky — nie sú naša vec, nezapisujú sa. */
const SUM =
  /^(chrome|moz|safari|safari-web|ms-browser|edge)-extension:|^(about|chrome|webkit-masked-url|resource|android-webview-video-poster):/i;

function bezParametrov(u: unknown): string | null {
  if (typeof u !== "string" || !u) return null;
  try {
    const url = new URL(u);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "wss:")
      return url.origin + url.pathname;
    return url.protocol.replace(/:$/, "");
  } catch {
    return u.slice(0, 100);
  }
}

function povodAleboSlovo(u: unknown): string {
  if (typeof u !== "string" || !u) return "?";
  try {
    const url = new URL(u);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "wss:")
      return url.origin;
    return url.protocol.replace(/:$/, "");
  } catch {
    // „inline“, „eval“, „wasm-eval“, „self“…
    return u.slice(0, 60);
  }
}

/**
 * Rozoberie telo hlásenia — starý formát (`{"csp-report": {...}}`, report-uri)
 * aj Reporting API (pole `[{type:"csp-violation", body:{...}}]`, report-to).
 * Vráti len hlásenia, ktoré stoja za zápis (bez doplnkov prehliadača).
 */
export function rozoberCspHlasenia(text: string): CspHlasenie[] {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return [];
  }
  const tela: any[] = Array.isArray(j)
    ? j.filter((x) => x && (x.type === "csp-violation" || !x.type)).map((x) => x.body ?? x)
    : [(j as any)?.["csp-report"] ?? j];
  const vysledok: CspHlasenie[] = [];
  for (const r of tela.slice(0, 20)) {
    if (!r || typeof r !== "object") continue;
    const blokovaneUri = r["blocked-uri"] ?? r.blockedURL ?? "";
    const subor = r["source-file"] ?? r.sourceFile ?? "";
    if (SUM.test(String(blokovaneUri)) || SUM.test(String(subor))) continue;
    const direktiva = String(
      r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"] ?? "?",
    )
      .split(" ")[0]
      .slice(0, 40);
    let stranka: string | null = null;
    try {
      stranka = new URL(String(r["document-uri"] ?? r.documentURL ?? "")).pathname;
    } catch {
      stranka = null;
    }
    vysledok.push({
      direktiva,
      blokovane: povodAleboSlovo(blokovaneUri),
      stranka,
      subor: bezParametrov(subor),
    });
  }
  return vysledok;
}

/** Text do Admin → Chyby — bez stránky, aby sa rovnaké porušenie zlúčilo do jedného riadku. */
export function spravaCsp(h: CspHlasenie): string {
  return `CSP (report-only): ${h.direktiva} zablokovalo ${h.blokovane}`;
}
