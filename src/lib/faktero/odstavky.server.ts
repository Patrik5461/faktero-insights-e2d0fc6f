/**
 * Sťahovanie plánovaných odstávok inštitúcií do `odstavky_institucii` (FAK-523).
 * Volá ho cron hook /api/public/hooks/odstavky raz za hodinu.
 *
 * Pravidlá zápisu (podľa zdroj + guid):
 *  - nový oznam sa vloží ako `schvalene` (automaticky), `zamietnute` (zdroj hlási
 *    zrušenie) alebo `navrh` (čaká na admina),
 *  - riadok, ktorého sa admin dotkol (schválil/zamietol — `schvalil`, alebo
 *    upravil — `updated_at` sa líši od `created_at`), sa už nemení vôbec,
 *  - inak sa obnoví text a časy; automaticky schválený riadok môže zdroj
 *    neskôr zrušiť („Odstávka sa neuskutočnila“ → zamietnute).
 *
 * Cron pri vlastných úpravách `updated_at` nemení — tak sa dá rozoznať zásah admina.
 *
 * Server-only — neimportovať z klientskeho kódu.
 */
import {
  bezDuplicit,
  lenAktualne,
  rozoberFsRss,
  rozoberSpRss,
  rozoberUpvsTabulku,
  URL_UPVS_PLAN,
  type NajdenaOdstavka,
} from "./odstavky-zdroje";
import type { StavOdstavky } from "./odstavky";

const USER_AGENT = "Faktero/1.0 (+https://www.faktero.sk)";
const TIMEOUT_MS = 15_000;

const URL_FS = [
  "https://www.financnasprava.sk/sk/rss/rss-technicke-informacie",
  "https://www.financnasprava.sk/sk/rss/rss-novinky",
];
const URL_SP = "https://www.socpoist.sk/rss.xml";

type ZdrojBehu = "fs" | "upvs" | "sp";
export type SuhrnZdroja = { najdenych: number; novych: number; aktualizovanych: number; chyba?: string };
export type SuhrnOdstavok = Record<ZdrojBehu, SuhrnZdroja>;

async function stiahni(url: string, ocakavane: RegExp): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, text/html;q=0.9, */*;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const text = await res.text();
  // Počas vlastnej odstávky FS presmeruje RSS na servis.financnasprava.sk/odstavka (HTML).
  if (!ocakavane.test(text)) {
    const kam = res.url && res.url !== url ? ` (presmerované na ${res.url})` : "";
    throw new Error(`${url}: nečakaný obsah${kam}`);
  }
  return text;
}

function chybaText(e: unknown): string {
  const s = e instanceof Error ? e.message : String(e);
  return s.slice(0, 300);
}

function stavNovej(o: NajdenaOdstavka): StavOdstavky {
  if (o.zamietnute) return "zamietnute";
  return o.automaticky ? "schvalene" : "navrh";
}

type Existujuci = {
  id: string;
  guid: string;
  stav: StavOdstavky;
  automaticky: boolean;
  schvalil: string | null;
  created_at: string;
  updated_at: string;
  institucia: string;
  sluzba: string | null;
  nazov: string;
  popis: string | null;
  url: string | null;
  zaciatok: string | null;
  koniec: string | null;
};

function rovnakyCas(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b;
  return Date.parse(a) === Date.parse(b);
}

/** Nič nové — zbytočne nezapisovať každú hodinu. */
function bezZmeny(r: Existujuci, p: NajdenaOdstavka): boolean {
  return (
    r.stav === stavNovej(p) &&
    r.automaticky === p.automaticky &&
    r.institucia === p.institucia &&
    r.sluzba === p.sluzba &&
    r.nazov === p.nazov &&
    r.popis === p.popis &&
    r.url === p.url &&
    rovnakyCas(r.zaciatok, p.zaciatok) &&
    rovnakyCas(r.koniec, p.koniec)
  );
}

/** Riadok, ktorý admin schválil, zamietol alebo upravil, je jeho. */
function spracovalAdmin(r: Existujuci): boolean {
  if (r.schvalil) return true;
  if (r.stav !== "navrh" && !r.automaticky) return true;
  return Math.abs(Date.parse(r.updated_at) - Date.parse(r.created_at)) > 1000;
}

async function zapis(admin: any, zdroj: ZdrojBehu, polozky: NajdenaOdstavka[]): Promise<SuhrnZdroja> {
  const suhrn: SuhrnZdroja = { najdenych: polozky.length, novych: 0, aktualizovanych: 0 };
  if (!polozky.length) return suhrn;

  const { data: bolo, error } = await admin
    .from("odstavky_institucii")
    .select("id, guid, stav, automaticky, schvalil, created_at, updated_at, institucia, sluzba, nazov, popis, url, zaciatok, koniec")
    .eq("zdroj", zdroj)
    .in(
      "guid",
      polozky.map((p) => p.guid),
    );
  if (error) throw new Error(error.message);
  const podlaGuid = new Map<string, Existujuci>((bolo ?? []).map((r: Existujuci) => [r.guid, r]));

  const nove: Record<string, unknown>[] = [];
  for (const p of polozky) {
    const obsah = {
      institucia: p.institucia,
      sluzba: p.sluzba,
      nazov: p.nazov,
      popis: p.popis,
      url: p.url,
      zaciatok: p.zaciatok,
      koniec: p.koniec,
      automaticky: p.automaticky,
    };
    const r = podlaGuid.get(p.guid);
    if (!r) {
      const teraz = new Date().toISOString();
      nove.push({ ...obsah, zdroj, guid: p.guid, stav: stavNovej(p), created_at: teraz, updated_at: teraz });
      continue;
    }
    if (spracovalAdmin(r) || bezZmeny(r, p)) continue;
    // Návrh, ktorý medzičasom dostal presný čas alebo zrušenie, prejde do konečného stavu;
    // automaticky schválený sa vráti medzi návrhy, ak zdroj čas stratil.
    const { error: e } = await admin
      .from("odstavky_institucii")
      .update({ ...obsah, stav: stavNovej(p) })
      .eq("id", r.id);
    if (e) throw new Error(e.message);
    suhrn.aktualizovanych++;
  }

  if (nove.length) {
    const { error: e } = await admin.from("odstavky_institucii").insert(nove);
    if (e) throw new Error(e.message);
    suhrn.novych = nove.length;
  }
  return suhrn;
}

/** Jeden zdroj: stiahnutie, rozbor, zápis. Chyba sa vráti v súhrne, nezhodí ostatné. */
async function behZdroja(
  admin: any,
  zdroj: ZdrojBehu,
  ziskaj: () => Promise<{ polozky: NajdenaOdstavka[]; chyby: string[] }>,
): Promise<SuhrnZdroja> {
  try {
    const { polozky, chyby } = await ziskaj();
    const aktualne = lenAktualne(bezDuplicit(polozky));
    const suhrn = await zapis(admin, zdroj, aktualne);
    if (chyby.length) suhrn.chyba = chyby.join("; ");
    return suhrn;
  } catch (e) {
    console.error(`[odstavky] ${zdroj}:`, e);
    return { najdenych: 0, novych: 0, aktualizovanych: 0, chyba: chybaText(e) };
  }
}

export async function stiahniOdstavky(admin: any): Promise<SuhrnOdstavok> {
  const [fs, upvs, sp] = await Promise.all([
    behZdroja(admin, "fs", async () => {
      // Dva kanály — keď jeden nejde, druhý sa aj tak spracuje.
      const vysledky = await Promise.allSettled(URL_FS.map((u) => stiahni(u, /<rss[\s>]/i)));
      const polozky: NajdenaOdstavka[] = [];
      const chyby: string[] = [];
      for (const v of vysledky) {
        if (v.status === "fulfilled") polozky.push(...rozoberFsRss(v.value));
        else chyby.push(chybaText(v.reason));
      }
      if (chyby.length === URL_FS.length) throw new Error(chyby.join("; "));
      return { polozky, chyby };
    }),
    behZdroja(admin, "upvs", async () => ({
      polozky: rozoberUpvsTabulku(await stiahni(URL_UPVS_PLAN, /<table/i)),
      chyby: [],
    })),
    behZdroja(admin, "sp", async () => ({
      polozky: rozoberSpRss(await stiahni(URL_SP, /<rss[\s>]/i)),
      chyby: [],
    })),
  ]);
  return { fs, upvs, sp };
}
