/**
 * Rozbor zdrojov plánovaných odstávok (FAK-523, 26. 11. 2026) — čisté funkcie,
 * bez siete a databázy. Sťahovanie a zápis robí `odstavky.server.ts`.
 *
 *  - fs    RSS Finančnej správy (technické informácie + novinky). Novinky miešajú
 *          aj tlačové správy, berú sa len oznamy o odstávke či nedostupnosti
 *          elektronických služieb. Obmedzenia na hraničných priechodoch a
 *          pobočkách colného úradu (fyzické pracoviská) sa vynechajú.
 *  - upvs  tabuľka „Plán technických odstávok“ na slovensko.sk (Dátum / Začiatok /
 *          Koniec / Plánované aktivity), „Odstávka sa neuskutočnila“ = zamietnuté.
 *  - sp    RSS Sociálnej poisťovne, pubDate v tvare „26.11.2026“.
 *
 * Časy sú v texte vždy miestne (Europe/Bratislava), do databázy idú ako ISO
 * s posunom pásma platným v daný deň (+01:00 v zime, +02:00 v lete).
 */
import { INSTITUCIE, type ZdrojOdstavky } from "./odstavky";

export type NajdenaOdstavka = {
  zdroj: ZdrojOdstavky;
  guid: string;
  institucia: string;
  sluzba: string | null;
  nazov: string;
  popis: string | null;
  url: string | null;
  zaciatok: string | null;
  koniec: string | null;
  /** Spoľahlivý zdroj aj čas — ide rovno medzi schválené. */
  automaticky: boolean;
  /** Zdroj sám hovorí, že sa odstávka neuskutoční. */
  zamietnute?: boolean;
};

export const URL_UPVS_PLAN = "https://www.slovensko.sk/sk/oznamy/plan-odstavok";

// ---------------------------------------------------------------------------
// Časové pásmo
// ---------------------------------------------------------------------------

const casti = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Bratislava",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Posun Bratislavy voči UTC v minútach v danom okamihu (60 alebo 120). */
function posunMin(utcMs: number): number {
  const p: Record<string, number> = {};
  for (const c of casti.formatToParts(new Date(utcMs))) {
    if (c.type !== "literal") p[c.type] = Number(c.value);
  }
  const ako = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return Math.round((ako - utcMs) / 60000);
}

/**
 * Miestny čas v Bratislave → ISO s posunom, napr. „2026-12-09T22:00:00+01:00“.
 * Hodina 24 a deň za koncom mesiaca sa prelejú do ďalšieho dňa (Date.UTC).
 */
export function bratislavaIso(rok: number, mesiac: number, den: number, hod = 0, min = 0): string {
  const odhad = Date.UTC(rok, mesiac - 1, den, hod, min);
  let posun = posunMin(odhad);
  let utc = odhad - posun * 60000;
  const posun2 = posunMin(utc);
  if (posun2 !== posun) {
    posun = posun2;
    utc = odhad - posun * 60000;
  }
  const miestne = new Date(utc + posun * 60000).toISOString().slice(0, 19);
  const zn = posun >= 0 ? "+" : "-";
  const a = Math.abs(posun);
  return `${miestne}${zn}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Dátumy a časy v slovenskom texte
// ---------------------------------------------------------------------------

type Datum = { rok: number | null; mesiac: number; den: number; poz: number; dlzka: number };
type Cas = { hod: number; min: number; poz: number };

/** Mená mesiacov v 1., 2. aj 6. páde (január/januára/januári, marec/marca/marci …). */
const MESIACE: [RegExp, number][] = [
  [/^jan/, 1],
  [/^feb/, 2],
  [/^mar/, 3],
  [/^apr/, 4],
  [/^m[áa]j/, 5],
  [/^j[úu]n/, 6],
  [/^j[úu]l/, 7],
  [/^aug/, 8],
  [/^sep/, 9],
  [/^okt/, 10],
  [/^nov/, 11],
  [/^dec/, 12],
];

const RE_DATUM_SLOVOM =
  /(?<!\d)(\d{1,2})\.\s*(janu[áa]r\p{L}*|febru[áa]r\p{L}*|mar(?:ec|ca|ci)|apr[íi]l\p{L}*|m[áa]j\p{L}*|j[úu]n\p{L}*|j[úu]l\p{L}*|august\p{L}*|septemb\p{L}*|okt[óo]b\p{L}*|novemb\p{L}*|decemb\p{L}*)(?:\s+(\d{4}))?/giu;
const RE_DATUM_CISLOM = /(?<![\d.])(\d{1,2})\.\s*(\d{1,2})\.(?:\s*(\d{4}))?(?![\d:])/g;
const RE_CAS = /(?<![\d.:,])(\d{1,2})[:.](\d{2})(?![\d])(?!\.\s*\d)/g;

function mesiacZMena(meno: string): number | null {
  const m = meno.toLowerCase();
  for (const [re, c] of MESIACE) if (re.test(m)) return c;
  return null;
}

function platnyDen(den: number, mesiac: number): boolean {
  return mesiac >= 1 && mesiac <= 12 && den >= 1 && den <= 31;
}

/** Všetky dátumy v texte v poradí výskytu. */
export function najdiDatumy(text: string): Datum[] {
  const out: Datum[] = [];
  for (const m of text.matchAll(RE_DATUM_SLOVOM)) {
    const mesiac = mesiacZMena(m[2]);
    const den = Number(m[1]);
    if (mesiac && platnyDen(den, mesiac)) {
      out.push({ den, mesiac, rok: m[3] ? Number(m[3]) : null, poz: m.index!, dlzka: m[0].length });
    }
  }
  for (const m of text.matchAll(RE_DATUM_CISLOM)) {
    const den = Number(m[1]);
    const mesiac = Number(m[2]);
    if (platnyDen(den, mesiac)) {
      out.push({ den, mesiac, rok: m[3] ? Number(m[3]) : null, poz: m.index!, dlzka: m[0].length });
    }
  }
  out.sort((a, b) => a.poz - b.poz);
  // Chýbajúci rok („od 11. júna do 15. júna 2026“) prevezme od najbližšieho ďalšieho dátumu.
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].rok == null && i + 1 < out.length) out[i].rok = out[i + 1].rok;
  }
  return out;
}

/** Časy „20:00“, „22.00 h.“, „9:00 hod.“ — mimo úsekov, ktoré sú dátumom. */
export function najdiCasy(text: string, datumy = najdiDatumy(text)): Cas[] {
  let bez = text;
  for (const d of datumy) bez = bez.slice(0, d.poz) + " ".repeat(d.dlzka) + bez.slice(d.poz + d.dlzka);
  const out: Cas[] = [];
  for (const m of bez.matchAll(RE_CAS)) {
    const hod = Number(m[1]);
    const min = Number(m[2]);
    if (hod > 24 || min > 59 || (hod === 24 && min > 0)) continue;
    out.push({ hod, min, poz: m.index! });
  }
  return out;
}

export type OdDo = { zaciatok: string; koniec: string | null; presne: boolean };

const DEN_MS = 24 * 3600_000;

/** Ten istý miestny čas o deň neskôr (aj cez zmenu letného času). */
function posunODen(iso: string): string {
  const [r, m, d, h, mi] = iso.slice(0, 16).split(/[-T:]/).map(Number);
  return bratislavaIso(r, m, d + 1, h, mi);
}

/**
 * Začiatok a koniec odstávky zo slovenského textu.
 *
 * Prvý dátum je deň začiatku, prvý čas začiatok. Koniec je druhý čas; jeho deň
 * je druhý dátum, ak stojí pred ním („od 22:00 hod. do 16. decembra 2025 … do
 * 04:00 hod.“), inak deň začiatku. Koniec skôr ako začiatok = prechod cez
 * polnoc → ďalší deň. Bez času celý deň (`presne: false`).
 */
export function casOdDo(text: string, rokPredvoleny: number): OdDo | null {
  const datumy = najdiDatumy(text);
  if (!datumy.length) return null;
  const casy = najdiCasy(text, datumy);
  const d0 = datumy[0];
  const rok0 = d0.rok ?? rokPredvoleny;
  const t0 = casy[0];
  const t1 = casy[1];

  // Druhý dátum sa berie len vtedy, keď patrí ku koncu (stojí pred časom konca).
  const d1 = datumy.find((d, i) => i > 0 && (t1 ? d.poz < t1.poz : true) && d.poz > d0.poz);
  const koncovy = d1 ?? null;

  if (!t0) {
    // Len dátum (alebo dátum – dátum) — celé dni.
    const zaciatok = bratislavaIso(rok0, d0.mesiac, d0.den, 0, 0);
    const k = koncovy ?? d0;
    const koniec = bratislavaIso(k.rok ?? rok0, k.mesiac, k.den + 1, 0, 0);
    return { zaciatok, koniec: Date.parse(koniec) > Date.parse(zaciatok) ? koniec : null, presne: false };
  }

  const zaciatok = bratislavaIso(rok0, d0.mesiac, d0.den, t0.hod, t0.min);
  if (!t1) return { zaciatok, koniec: null, presne: false };

  const k = koncovy ?? d0;
  let koniec = bratislavaIso(k.rok ?? rok0, k.mesiac, k.den, t1.hod, t1.min);
  if (Date.parse(koniec) <= Date.parse(zaciatok)) koniec = posunODen(koniec);
  if (Date.parse(koniec) <= Date.parse(zaciatok)) return { zaciatok, koniec: null, presne: false };
  return { zaciatok, koniec, presne: true };
}

// ---------------------------------------------------------------------------
// Text, HTML, RSS
// ---------------------------------------------------------------------------

const ENTITY: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ndash: "–",
  mdash: "—",
  bdquo: "„",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  hellip: "…",
  euro: "€",
};

export function dekodujEntity(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (cele, k: string) => {
    if (k[0] === "#") {
      const n = k[1] === "x" || k[1] === "X" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : cele;
    }
    return ENTITY[k.toLowerCase()] ?? cele;
  });
}

/** HTML → čistý text v jednom riadku (zoznamy oddelené „; “). */
export function htmlNaText(html: string): string {
  return dekodujEntity(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/li>\s*/gi, "; ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .replace(/\s*;\s*(;\s*)*/g, "; ")
    .replace(/^[\s;]+|[\s;]+$/g, "")
    .trim();
}

function skrat(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

type RssPolozka = {
  title: string;
  link: string | null;
  description: string;
  category: string | null;
  guid: string | null;
  pubDate: string | null;
};

function tag(blok: string, meno: string): string | null {
  const m = blok.match(new RegExp(`<${meno}(?:\\s[^>]*)?>([\\s\\S]*?)</${meno}>`, "i"));
  if (!m) return null;
  let v = m[1].trim();
  const cdata = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  // Text v RSS je raz escapovaný (description potom obsahuje HTML) — CDATA nie.
  v = cdata ? cdata[1] : dekodujEntity(v);
  return v;
}

export function rozoberRss(xml: string): RssPolozka[] {
  const out: RssPolozka[] = [];
  for (const m of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const b = m[1];
    out.push({
      title: htmlNaText(tag(b, "title") ?? ""),
      link: tag(b, "link")?.trim() || null,
      description: tag(b, "description") ?? "",
      category: tag(b, "category")?.trim() || null,
      guid: tag(b, "guid")?.trim() || null,
      pubDate: tag(b, "pubDate")?.trim() || null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Relevancia a služba
// ---------------------------------------------------------------------------

/** Samo osebe znamená odstávku. */
const RE_SILNE =
  /odst[áa]vk|v[ýy]padok|v[ýy]padk|nedostupn|neb(?:ude|udú|udu)\s+(?:\p{L}+\s+){0,4}dostupn|nebude\s+(?:\p{L}+\s+){0,4}funk[čc]n/iu;
/** Znamená odstávku len pri elektronickej službe. */
const RE_SLABE = /[úu]dr[žz]b|technick\p{L}*\s+pr[áa]c|obmedzen/iu;
const RE_ELEKTRONICKE =
  /port[áa]l|elektronick|e-?slu[žz]b|syst[ée]m|aplik[áa]ci|e-?dane|e-?kasa|\beid\b|slovensko\.sk|prihlasovan|formul[áa]r|pod[áa]van|e-?faktúr|schr[áa]nk/iu;
/** Fyzické pracoviská — nie elektronická služba. */
const RE_FYZICKE = /hrani[čc]n\p{L}*\s+priechod|coln\p{L}*\s+[úu]rad|\bPC[ÚU]\b|pracovisk/iu;

export function jeOznamOdstavky(text: string): boolean {
  const elektronicke = RE_ELEKTRONICKE.test(text);
  if (RE_FYZICKE.test(text) && !elektronicke) return false;
  if (RE_SILNE.test(text)) return true;
  return RE_SLABE.test(text) && elektronicke;
}

const SLUZBY: [RegExp, string][] = [
  [/port[áa]l\p{L}*\s+(?:FS|finan[čc]nej\s+spr[áa]vy)|\bPFS\b/iu, "Portál FS"],
  [/e-?dane/iu, "eDane"],
  [/e-?kas/iu, "eKasa"],
  [/\bOPD\b|online\s+pokladn/iu, "OPD"],
  [/e-?fakt[úu]r/iu, "eFaktúra"],
  [/e-?formul[áa]r|pod[áa]vani\p{L}*\s+formul[áa]r|\beForm\b|\bMEF\b/iu, "eFormuláre"],
  [/e-?pobo[čc]k/iu, "ePobočka"],
  [/e-?slu[žz]b/iu, "eSlužby"],
  [/\beDesk\b|elektronick\p{L}*\s+schr[áa]nk/iu, "eDesk"],
  [/\beID\b/u, "eID"],
  [/slovensko\.sk|[úu]stredn\p{L}*\s+port[áa]l/iu, "slovensko.sk"],
];

/** Dotknuté služby z textu, napr. „Portál FS, eDane“. `null` = nevedno. */
export function odhadniSluzbu(text: string, predvolena: string | null = null): string | null {
  const najdene: string[] = predvolena ? [predvolena] : [];
  for (const [re, meno] of SLUZBY) {
    if (re.test(text) && !najdene.includes(meno)) najdene.push(meno);
  }
  return najdene.length ? najdene.slice(0, 4).join(", ") : null;
}

function rokZDatumu(s: string | null, zaloha: number): number {
  const m = s?.match(/\b(20\d{2})\b/);
  return m ? Number(m[1]) : zaloha;
}

// ---------------------------------------------------------------------------
// Zdroje
// ---------------------------------------------------------------------------

/**
 * RSS Finančnej správy (oba kanály). Položka z kanála „Technické informácie“
 * s rozpoznaným od–do je automaticky schválená, ostatné sú návrh.
 */
export function rozoberFsRss(xml: string, teraz = new Date()): NajdenaOdstavka[] {
  const kanalTech = /<channel>[\s\S]*?<title>\s*Technick/i.test(xml);
  const out: NajdenaOdstavka[] = [];
  for (const p of rozoberRss(xml)) {
    const popis = htmlNaText(p.description);
    const cely = `${p.title}. ${popis}`;
    if (!jeOznamOdstavky(cely)) continue;
    const tech = kanalTech || /technick/i.test(p.category ?? "");
    const rok = rokZDatumu(p.pubDate, teraz.getFullYear());
    // Popis býva presnejší (deň v týždni, „v čase od … do …“), titulok je záloha.
    const cas = casOdDo(popis, rok) ?? casOdDo(p.title, rok);
    const guid = p.guid || p.link || `fs-${p.title}`;
    out.push({
      zdroj: "fs",
      guid,
      institucia: INSTITUCIE.fs,
      sluzba: odhadniSluzbu(cely),
      nazov: skrat(p.title, 300),
      popis: popis ? skrat(popis, 2000) : null,
      url: p.link,
      zaciatok: cas?.zaciatok ?? null,
      koniec: cas?.koniec ?? null,
      automaticky: tech && !!cas?.presne,
    });
  }
  return out;
}

/** Deň v bunke tabuľky ÚPVS („09. 12. 2026“, „14.05.2022“, „10. 08. 20 22“). */
function datumyBunky(text: string): Datum[] {
  return najdiDatumy(text.replace(/\b(20)\s+(\d{2})\b/g, "$1$2"));
}

/**
 * Tabuľka plánu odstávok slovensko.sk. Riadok s rozpoznaným časom je
 * automaticky schválený, „neuskutočnila sa“ / „presunutá“ je zamietnutý.
 */
export function rozoberUpvsTabulku(html: string): NajdenaOdstavka[] {
  const out: NajdenaOdstavka[] = [];
  const videne = new Set<string>();
  for (const r of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const bunky = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((b) => b[1]);
    if (bunky.length < 4) continue;
    const [datumHtml, odHtml, doHtml, aktivityHtml] = bunky;
    const datumy = datumyBunky(htmlNaText(datumHtml));
    if (!datumy.length || datumy[0].rok == null) continue;
    const d0 = datumy[0];
    const d1 = datumy.length > 1 ? datumy[datumy.length - 1] : d0;
    const casyOd = najdiCasy(htmlNaText(odHtml), []);
    const casyDo = najdiCasy(htmlNaText(doHtml), []);
    const t0 = casyOd[0];
    const t1 = casyDo[casyDo.length - 1];

    let zaciatok: string;
    let koniec: string | null = null;
    if (t0) {
      zaciatok = bratislavaIso(d0.rok!, d0.mesiac, d0.den, t0.hod, t0.min);
      if (t1) {
        koniec = bratislavaIso(d1.rok ?? d0.rok!, d1.mesiac, d1.den, t1.hod, t1.min);
        if (Date.parse(koniec) <= Date.parse(zaciatok)) koniec = posunODen(koniec);
        if (Date.parse(koniec) <= Date.parse(zaciatok)) koniec = null;
      }
    } else {
      zaciatok = bratislavaIso(d0.rok!, d0.mesiac, d0.den, 0, 0);
      koniec = bratislavaIso(d1.rok ?? d0.rok!, d1.mesiac, d1.den + 1, 0, 0);
    }

    // Prvý odsek (tučný) je názov, odrážky sú popis.
    const aktivity = htmlNaText(aktivityHtml);
    const silne = aktivityHtml.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
    let nazov = silne ? htmlNaText(silne[1]) : "";
    if (!nazov) nazov = aktivity.split(";")[0]?.trim() ?? "";
    if (!nazov) nazov = "Technická odstávka";
    let popis = aktivity.startsWith(nazov) ? aktivity.slice(nazov.length) : aktivity;
    popis = popis.replace(/^[\s;:–-]+/, "").trim();

    const guid = `upvs-${zaciatok.slice(0, 16)}`;
    if (videne.has(guid)) continue;
    videne.add(guid);

    out.push({
      zdroj: "upvs",
      guid,
      institucia: INSTITUCIE.upvs,
      sluzba: odhadniSluzbu(aktivity, "slovensko.sk"),
      nazov: skrat(nazov, 300),
      popis: popis ? skrat(popis, 2000) : null,
      url: URL_UPVS_PLAN,
      zaciatok,
      koniec,
      automaticky: !!(t0 && koniec),
      zamietnute: /neuskuto[čc]nil|presunut/i.test(aktivity),
    });
  }
  return out;
}

/** RSS Sociálnej poisťovne — odstávky zriedka, vždy ako návrh na schválenie. */
export function rozoberSpRss(xml: string, teraz = new Date()): NajdenaOdstavka[] {
  const out: NajdenaOdstavka[] = [];
  for (const p of rozoberRss(xml)) {
    const popis = htmlNaText(p.description);
    const cely = `${p.title}. ${popis}`;
    if (!jeOznamOdstavky(cely)) continue;
    const rok = rokZDatumu(p.pubDate, teraz.getFullYear());
    const cas = casOdDo(popis, rok) ?? casOdDo(p.title, rok);
    const url = p.link ? p.link.replace(/^http:\/\//, "https://") : null;
    out.push({
      zdroj: "sp",
      guid: p.guid || p.link || `sp-${p.title}`,
      institucia: INSTITUCIE.sp,
      sluzba: odhadniSluzbu(cely),
      nazov: skrat(p.title, 300),
      popis: popis ? skrat(popis, 2000) : null,
      url,
      zaciatok: cas?.zaciatok ?? null,
      koniec: cas?.koniec ?? null,
      automaticky: false,
    });
  }
  return out;
}

/**
 * Do databázy len to, čo ešte neskončilo alebo skončilo nedávno — tabuľka ÚPVS
 * nesie históriu od roku 2018. Bez dátumu ide všetko (admin to posúdi).
 */
export function lenAktualne(polozky: NajdenaOdstavka[], teraz = Date.now(), dniDozadu = 14): NajdenaOdstavka[] {
  const hranica = teraz - dniDozadu * DEN_MS;
  return polozky.filter((p) => {
    const k = p.koniec ? Date.parse(p.koniec) : p.zaciatok ? Date.parse(p.zaciatok) + DEN_MS : null;
    return k == null || k >= hranica;
  });
}

/** Rovnaký oznam býva v oboch kanáloch FS — prednosť má automaticky schválený. */
export function bezDuplicit(polozky: NajdenaOdstavka[]): NajdenaOdstavka[] {
  const m = new Map<string, NajdenaOdstavka>();
  for (const p of polozky) {
    const k = `${p.zdroj}|${p.guid}`;
    const bol = m.get(k);
    if (!bol || (p.automaticky && !bol.automaticky)) m.set(k, p);
  }
  return [...m.values()];
}
