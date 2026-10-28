/*
  Denný e-mailový súhrn úloh — raz ráno jeden e-mail človeku, ktorý má
  niečo na vybavenie: doklady na schválenie, komentáre, v ktorých ho
  označili, nespracované doklady a faktúry po splatnosti. Keď nič nečaká,
  e-mail sa nepošle — prázdny súhrn by ľudí naučil súhrny nečítať.

  Človek s viacerými firmami dostane jeden e-mail so sekciou za každú firmu,
  kde niečo čaká. Počty sa rátajú na serveri (`denny-suhrn.server.ts`), tu je
  len zostavenie textu, rozhodnutie posielať/neposielať a podpis odkazu na
  odhlásenie.

  Čisté funkcie bez databázy, aby sa dali skúšať. Podpis ide cez Web Crypto,
  ktoré má Node aj prehliadač — súbor sa tak dá importovať odkiaľkoľvek.
*/

import { sPoctom } from "./mnozne";
import { cakaNaMna } from "./moje-ulohy";
import { mozeSchvalit, nacitajUrovne, type StavSchvalovania } from "./schvalovanie";
import { vidiOblast, type Oblast } from "./opravnenia";

export type PoctyFirmy = {
  companyId: string;
  nazov: string;
  schvalenie: number;
  komentare: number;
  nespracovane: number;
  poSplatnosti: number;
};

const kladne = (n: unknown) => Math.max(0, Math.trunc(Number(n) || 0));

export function spoluVoFirme(p: PoctyFirmy): number {
  return (
    kladne(p.schvalenie) + kladne(p.komentare) + kladne(p.nespracovane) + kladne(p.poSplatnosti)
  );
}

/** Firmy, kde niečo čaká, v poradí podľa názvu (rovnako v každom súhrne). */
export function firmySUlohami(firmy: PoctyFirmy[]): PoctyFirmy[] {
  return firmy
    .filter((f) => spoluVoFirme(f) > 0)
    .sort((a, b) => a.nazov.localeCompare(b.nazov, "sk"));
}

// ---------- Počty pre člena firmy ----------

const OBLAST_AGENDY: Record<string, Oblast> = {
  doklad: "doklady",
  prijata: "doklady",
  vystavena: "faktury",
  nespracovany: "doklady",
  vyuctovanie: "doklady",
};

const ROLY_POHLADAVOK = ["owner", "admin", "accountant"];

export type Clen = {
  user_id: string;
  role: string;
  permissions: unknown;
  /** Povolenia schvaľovania po používateľoch (`company_users.schvalovanie_prava`) — ako zvonček. */
  schvalovanie_prava?: unknown;
};

export type ZaznamSchvalovania = {
  agenda: string;
  urovne: unknown;
  schvalena_uroven: number;
  stav: StavSchvalovania;
};
export type Komentar = {
  agenda: string;
  user_id: string;
  upozornit: string[] | null;
  vyriesili: string[] | null;
};

/** Všetko, čo treba o firme vedieť na výpočet úloh jej členov. */
export type DataFirmy = {
  schvalovanie: ZaznamSchvalovania[];
  komentare: Komentar[];
  nespracovane: number;
  poSplatnosti: number;
};

/** Počty pre jedného člena — čisté, nad už načítanými dátami firmy. */
export function poctyClena(
  clen: Clen,
  firma: { id: string; nazov: string },
  d: DataFirmy,
): PoctyFirmy {
  const vidi = (agenda: string) => {
    const o = OBLAST_AGENDY[agenda];
    return o ? vidiOblast(clen.role, clen.permissions, o) : false;
  };
  const schvalenie = d.schvalovanie.filter(
    (r) =>
      vidi(r.agenda) &&
      mozeSchvalit(
        { ...r, urovne: nacitajUrovne(r.urovne) },
        clen.user_id,
        clen.role,
        clen.schvalovanie_prava,
      ),
  ).length;
  const komentare = d.komentare.filter((k) => vidi(k.agenda) && cakaNaMna(k, clen.user_id)).length;
  const nespracovane = vidiOblast(clen.role, clen.permissions, "doklady") ? d.nespracovane : 0;
  const pohladavky =
    ROLY_POHLADAVOK.includes(clen.role) ||
    (clen.role === "custom" && vidiOblast(clen.role, clen.permissions, "faktury"));
  return {
    companyId: firma.id,
    nazov: firma.nazov,
    schvalenie,
    komentare,
    nespracovane,
    poSplatnosti: pohladavky ? d.poSplatnosti : 0,
  };
}

/** Posielať? Len keď súhrn zapnutý, má kam a aspoň v jednej firme niečo čaká. */
export function maSaPoslat(args: {
  zapnute: boolean | null | undefined;
  email: string | null | undefined;
  firmy: PoctyFirmy[];
}): boolean {
  if (args.zapnute === false) return false;
  if (!args.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.email.trim())) return false;
  return firmySUlohami(args.firmy).length > 0;
}

/** Položky jednej firmy slovami: „3 doklady na schválenie", „2 faktúry po splatnosti"… */
export function polozkyFirmy(p: PoctyFirmy): string[] {
  const out: string[] = [];
  if (kladne(p.schvalenie))
    out.push(`${sPoctom(kladne(p.schvalenie), ["doklad", "doklady", "dokladov"])} na schválenie`);
  if (kladne(p.komentare))
    out.push(
      `${sPoctom(kladne(p.komentare), ["komentár", "komentáre", "komentárov"])}, kde vás označili`,
    );
  if (kladne(p.nespracovane))
    out.push(
      sPoctom(kladne(p.nespracovane), [
        "nespracovaný doklad",
        "nespracované doklady",
        "nespracovaných dokladov",
      ]),
    );
  if (kladne(p.poSplatnosti))
    out.push(`${sPoctom(kladne(p.poSplatnosti), ["faktúra", "faktúry", "faktúr"])} po splatnosti`);
  return out;
}

/** „Čaká na vás vo firme X: 3 doklady na schválenie, 2 komentáre, kde vás označili". */
export function vetaFirmy(p: PoctyFirmy): string {
  return `Čaká na vás vo firme ${p.nazov}: ${polozkyFirmy(p).join(", ")}`;
}

export function predmetSuhrnu(firmy: PoctyFirmy[]): string {
  const s = firmySUlohami(firmy);
  const spolu = s.reduce((a, f) => a + spoluVoFirme(f), 0);
  const ulohy = sPoctom(spolu, ["úloha", "úlohy", "úloh"]);
  if (s.length === 1) return `Faktero: ${ulohy} vo firme ${s[0].nazov}`;
  return `Faktero: ${ulohy} v ${sPoctom(s.length, ["firme", "firmách", "firmách"])}`;
}

export function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Odkaz na Moje úlohy konkrétnej firmy — stránka si podľa `firma` prepne aktívnu firmu. */
export function odkazNaUlohy(web: string, companyId: string): string {
  return `${web.replace(/\/+$/, "")}/moje-ulohy?firma=${encodeURIComponent(companyId)}`;
}

/** Odkaz na faktúry po splatnosti (filter zoznamu faktúr). */
export function odkazNaPoSplatnosti(web: string, companyId: string): string {
  return `${web.replace(/\/+$/, "")}/moje-ulohy?firma=${encodeURIComponent(companyId)}&dalej=po-splatnosti`;
}

export function odkazNaOdhlasenie(web: string, token: string): string {
  return `${web.replace(/\/+$/, "")}/denny-suhrn/odhlasenie?t=${encodeURIComponent(token)}`;
}

export type EmailSuhrnu = { predmet: string; text: string; html: string };

/**
 * Zostaví e-mail. `web` je verejná adresa appky, `odhlasenie` hotový odkaz
 * na odhlásenie (s podpísaným tokenom). Firmy bez úloh sa vynechajú.
 */
export function zostavEmail(args: {
  meno?: string | null;
  firmy: PoctyFirmy[];
  web: string;
  odhlasenie: string;
}): EmailSuhrnu {
  const firmy = firmySUlohami(args.firmy);
  const oslovenie = args.meno?.trim() ? `Dobré ráno, ${args.meno.trim()}.` : "Dobré ráno.";
  const nastavenia = `${args.web.replace(/\/+$/, "")}/nastavenia`;

  const text = [
    oslovenie,
    "",
    ...firmy.flatMap((f) => [
      `${vetaFirmy(f)}.`,
      `Otvoriť Moje úlohy: ${odkazNaUlohy(args.web, f.companyId)}`,
      ...(kladne(f.poSplatnosti)
        ? [`Faktúry po splatnosti: ${odkazNaPoSplatnosti(args.web, f.companyId)}`]
        : []),
      "",
    ]),
    "Tento súhrn chodí raz denne ráno, len keď na vás niečo čaká.",
    `Vypnúť ho môžete v Nastaveniach účtu (${nastavenia}) alebo tu: ${args.odhlasenie}`,
  ].join("\n");

  const sekcie = firmy
    .map((f) => {
      const polozky = polozkyFirmy(f)
        .map((p) => `<li style="margin:0 0 4px">${escapeHtml(p)}</li>`)
        .join("");
      const poSplatnosti = kladne(f.poSplatnosti)
        ? ` <a href="${escapeHtml(odkazNaPoSplatnosti(args.web, f.companyId))}" style="color:#0f172a;font-size:13px;margin-left:12px">Faktúry po splatnosti</a>`
        : "";
      return `<div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:0 0 12px">
          <p style="margin:0 0 8px;font-weight:600">Čaká na vás vo firme ${escapeHtml(f.nazov)}</p>
          <ul style="margin:0 0 12px;padding-left:20px">${polozky}</ul>
          <a href="${escapeHtml(odkazNaUlohy(args.web, f.companyId))}" style="background:#16a34a;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;display:inline-block">Otvoriť Moje úlohy</a>${poSplatnosti}
        </div>`;
    })
    .join("");

  const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;max-width:600px;line-height:1.5">
      <p style="margin:0 0 16px">${escapeHtml(oslovenie)}</p>
      ${sekcie}
      <p style="margin:20px 0 0;color:#666;font-size:12px">Tento súhrn chodí raz denne ráno, len keď na vás niečo čaká.
      Vypnúť ho môžete v <a href="${escapeHtml(nastavenia)}" style="color:#666">Nastaveniach účtu</a>
      alebo jedným klikom: <a href="${escapeHtml(args.odhlasenie)}" style="color:#666">Odhlásiť sa z denného súhrnu</a>.</p>
    </div>`;

  return { predmet: predmetSuhrnu(firmy), text, html };
}

// ---------- Čas v Bratislave ----------

function castiVBratislave(d: Date) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { den: `${p.year}-${p.month}-${p.day}`, hodina: Number(p.hour) };
}

/** Dnešný deň v Bratislave (YYYY-MM-DD) — kľúč proti dvojitému odoslaniu aj „po splatnosti". */
export function denVBratislave(d: Date = new Date()): string {
  return castiVBratislave(d).den;
}

export function hodinaVBratislave(d: Date = new Date()): number {
  return castiVBratislave(d).hodina;
}

/** Hodina, kedy súhrn odchádza. Cron beží o 5:00 aj 6:00 UTC, prejde len ten, čo trafí 7:00. */
export const HODINA_SUHRNU = 7;

export function jeCasNaSuhrn(d: Date = new Date()): boolean {
  return hodinaVBratislave(d) === HODINA_SUHRNU;
}

// ---------- Token na odhlásenie ----------

/*
  Odkaz na odhlásenie nesie id používateľa s podpisom HMAC — holé id by
  dovolilo ktokoľvek odhlásiť ktokoľvek iného. Token nevyprší: odkaz v starom
  e-maile musí fungovať aj po mesiaci. Účel je súčasťou podpisu, takže sa ten
  istý kľúč nedá zneužiť na podpísanie niečoho iného.
*/

const UCEL = "denny-suhrn.odhlasenie.v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function base64url(bajty: Uint8Array): string {
  let s = "";
  for (const b of bajty) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(kluc: string, sprava: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(kluc),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const podpis = await crypto.subtle.sign("HMAC", k, enc.encode(sprava));
  return base64url(new Uint8Array(podpis)).slice(0, 32);
}

/** Porovnanie, ktoré nekončí pri prvom rozdielnom znaku. */
function rovnake(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function tokenOdhlasenia(userId: string, kluc: string): Promise<string> {
  if (!kluc) throw new Error("Chýba kľúč na podpis.");
  if (!UUID.test(userId)) throw new Error("Neplatné id používateľa.");
  const id = userId.toLowerCase();
  return `${id}.${await hmac(kluc, `${UCEL}.${id}`)}`;
}

/** Vráti id používateľa z platného tokenu, inak null. */
export async function overTokenOdhlasenia(
  token: string | null | undefined,
  kluc: string,
): Promise<string | null> {
  if (!token || !kluc || token.length > 200) return null;
  const bodka = token.lastIndexOf(".");
  if (bodka < 0) return null;
  const id = token.slice(0, bodka).toLowerCase();
  const podpis = token.slice(bodka + 1);
  if (!UUID.test(id)) return null;
  const ocakavany = await hmac(kluc, `${UCEL}.${id}`);
  return rovnake(podpis, ocakavany) ? id : null;
}
