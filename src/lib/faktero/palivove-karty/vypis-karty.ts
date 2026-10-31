/*
  Nahratý výpis palivovej karty (CSV, XLSX, PDF prečítané AI) → transakcie.

  Pre vydavateľov bez verejného API (Up Déjeuner / Shell karta od Up) sa
  mesačný výpis alebo faktúra nahrá ručne. Ďalej ide všetko rovnakou cestou
  ako pri Shell API (`spracovanie.ts`, `sync.server.ts`): väzby kariet na
  vozidlá, tankovania, bločky, jedna prijatá faktúra s rozpisom.

  Formát výpisu Up nepoznáme (vzor nemáme), preto sa stĺpce rozpoznávajú podľa
  názvov v slovenčine, češtine a angličtine a človek ich vie priradiť ručne.

  Čisté funkcie — smie ísť do prehliadača aj do testov.
*/
import { zakladnaSadzba, type KrajinaDane } from "../vat-rates";
import { maskaKarty, normalizujSpz, sadzbaZoSum, casVBratislave } from "./spracovanie";
import type { KartaTransakcia } from "./typy";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export const POLIA_VYPISU = [
  "datum",
  "cas",
  "karta",
  "spz",
  "vodic",
  "stanica",
  "krajina",
  "produkt",
  "mnozstvo",
  "jednotka",
  "jednCena",
  "zaklad",
  "dph",
  "sadzba",
  "spolu",
  "mena",
  "tachometer",
  "faktura",
  "transakcia",
] as const;
export type PoleVypisu = (typeof POLIA_VYPISU)[number];

/** Názvy polí pre výber pri ručnom priradení stĺpcov. */
export const NAZVY_POLI: Record<PoleVypisu, string> = {
  datum: "Dátum",
  cas: "Čas",
  karta: "Číslo karty",
  spz: "ŠPZ",
  vodic: "Vodič",
  stanica: "Čerpacia stanica",
  krajina: "Krajina",
  produkt: "Produkt",
  mnozstvo: "Množstvo (litre)",
  jednotka: "Jednotka",
  jednCena: "Jednotková cena",
  zaklad: "Základ (bez DPH)",
  dph: "DPH",
  sadzba: "Sadzba DPH",
  spolu: "Suma s DPH",
  mena: "Mena",
  tachometer: "Tachometer (km)",
  faktura: "Číslo faktúry",
  transakcia: "Číslo transakcie / dokladu",
};

/*
  Synonymá v tvare po `normalizujHlavicku` (malé písmená, bez diakritiky,
  bez interpunkcie a meny). Krátke (do 3 znakov) platia len ako celý názov.
*/
const SYNONYMA: Record<PoleVypisu, string[]> = {
  datum: [
    "datum",
    "datum transakcie",
    "datum transakce",
    "datum nakupu",
    "datum cerpania",
    "datum tankovania",
    "datum a cas",
    "datum uskutocnenia",
    "datum plnenia",
    "date",
    "transaction date",
    "purchase date",
    "den",
  ],
  cas: [
    "cas",
    "cas transakcie",
    "cas transakce",
    "cas nakupu",
    "time",
    "transaction time",
    "hodina",
  ],
  karta: [
    "karta",
    "cislo karty",
    "c karty",
    "karta cislo",
    "card",
    "card number",
    "card no",
    "pan",
    "palivova karta",
  ],
  spz: [
    "spz",
    "ecv",
    "ec",
    "evc",
    "evidencne cislo",
    "evidencne cislo vozidla",
    "evidencni cislo",
    "rz",
    "registracna znacka",
    "registracni znacka",
    "license plate",
    "licence plate",
    "registration",
    "vehicle",
    "vozidlo",
  ],
  vodic: ["vodic", "ridic", "driver", "drzitel karty", "meno na karte", "jmeno na karte"],
  stanica: [
    "cerpacia stanica",
    "cerpaci stanice",
    "stanica",
    "stanice",
    "station",
    "site",
    "site name",
    "miesto",
    "misto",
    "miesto nakupu",
    "nazov stanice",
    "adresa stanice",
    "obchodne miesto",
    "prevadzka",
    "provozovna",
    "lokalita",
    "location",
    "merchant",
  ],
  krajina: ["krajina", "zeme", "stat", "country", "krajina nakupu"],
  produkt: [
    "produkt",
    "nazov produktu",
    "nazev produktu",
    "nazov polozky",
    "nazev polozky",
    "nazev zbozi",
    "tovar",
    "zbozi",
    "polozka",
    "nazov tovaru",
    "druh tovaru",
    "druh paliva",
    "palivo",
    "sluzba",
    "popis",
    "product",
    "product name",
    "item",
    "description",
  ],
  mnozstvo: [
    "mnozstvo",
    "mnozstvi",
    "litre",
    "litrov",
    "litry",
    "l",
    "objem",
    "pocet",
    "quantity",
    "qty",
    "volume",
    "liters",
    "litres",
  ],
  jednotka: ["jednotka", "mj", "merna jednotka", "unit", "uom"],
  jednCena: [
    "jednotkova cena",
    "jedn cena",
    "jedn cena bez dph",
    "jedn cena s dph",
    "jednotkova cena bez dph",
    "jednotkova cena s dph",
    "cena za jednotku",
    "cena za liter",
    "cena za litr",
    "cena za l",
    "cena l",
    "cena za mj",
    "unit price",
    "price per unit",
    "price per litre",
    "price per liter",
  ],
  zaklad: [
    "zaklad",
    "zaklad dane",
    "zaklad dph",
    "suma bez dph",
    "cena bez dph",
    "celkom bez dph",
    "spolu bez dph",
    "castka bez dph",
    "cena celkem bez dph",
    "bez dph",
    "net",
    "net amount",
    "amount excl vat",
    "amount without vat",
  ],
  dph: ["dph", "vyska dph", "suma dph", "castka dph", "dan", "vat", "vat amount", "tax"],
  sadzba: [
    "sadzba dph",
    "sadzba",
    "sazba dph",
    "sazba",
    "dph %",
    "% dph",
    "percento dph",
    "vat rate",
    "vat %",
    "tax rate",
  ],
  spolu: [
    "suma s dph",
    "cena s dph",
    "celkom s dph",
    "spolu s dph",
    "castka s dph",
    "cena celkem s dph",
    "celkova suma",
    "cena celkom",
    "suma",
    "spolu",
    "celkom",
    "celkem",
    "castka",
    "k uhrade",
    "uctovana suma",
    "total",
    "gross",
    "gross amount",
    "amount",
    "amount incl vat",
    "total amount",
  ],
  mena: ["mena", "currency", "mena transakcie"],
  tachometer: [
    "tachometer",
    "stav tachometra",
    "tachometr",
    "stav tachometru",
    "km",
    "stav km",
    "najazdene km",
    "odometer",
    "mileage",
  ],
  faktura: [
    "cislo faktury",
    "c faktury",
    "faktura",
    "faktura cislo",
    "invoice",
    "invoice number",
    "invoice no",
  ],
  transakcia: [
    "cislo transakcie",
    "cislo transakce",
    "id transakcie",
    "transakcia",
    "transakce",
    "transaction id",
    "transaction number",
    "cislo dokladu",
    "doklad",
    "cislo uctenky",
    "cislo bloku",
    "receipt",
    "receipt number",
    "autorizacia",
    "cislo autorizacie",
  ],
};

/** Názov stĺpca na porovnanie: bez diakritiky, interpunkcie, meny a zátvoriek. */
export function normalizujHlavicku(h: unknown): string {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\((eur|czk|€|kc|km|l)\)|\[(eur|czk|€|kc|km|l)\]/g, " ")
    .replace(/€/g, " ")
    .replace(/%/g, " % ")
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\b(eur|czk|kc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function skore(h: string, syn: string): number {
  if (!h) return 0;
  if (h === syn) return 1000 + syn.length;
  if (syn.length <= 3) return 0;
  const s = ` ${h} `;
  return s.includes(` ${syn} `) ? syn.length : 0;
}

export type Mapovanie = Partial<Record<PoleVypisu, number>>;

/** Priradí stĺpce k poliam; najistejšie zhody (celý názov, dlhšie synonymum) majú prednosť. */
export function rozpoznajStlpce(hlavicka: unknown[]): Mapovanie {
  const nazvy = hlavicka.map(normalizujHlavicku);
  const pary: { i: number; pole: PoleVypisu; s: number }[] = [];
  nazvy.forEach((n, i) => {
    for (const pole of POLIA_VYPISU) {
      // „Dátum a čas transakcie“ je dátum (aj s časom), nie samotný čas.
      if (pole === "cas" && /\b(datum|date)\b/.test(n)) continue;
      const s = Math.max(0, ...SYNONYMA[pole].map((syn) => skore(n, syn)));
      if (s > 0) pary.push({ i, pole, s });
    }
  });
  pary.sort((a, b) => b.s - a.s || a.i - b.i);
  const mapa: Mapovanie = {};
  const pouzite = new Set<number>();
  for (const p of pary) {
    if (p.pole in mapa || pouzite.has(p.i)) continue;
    mapa[p.pole] = p.i;
    pouzite.add(p.i);
  }
  return mapa;
}

/** Stačí to na načítanie bez otázok? Dátum, suma a čo sa kúpilo. */
export function jeMapovanieIste(m: Mapovanie): boolean {
  return (
    m.datum !== undefined &&
    (m.spolu !== undefined || m.zaklad !== undefined) &&
    (m.produkt !== undefined || m.mnozstvo !== undefined)
  );
}

/** Riadok hlavičky — export býva uvedený názvom firmy alebo obdobím. */
export function najdiHlavicku(riadky: unknown[][]): { index: number; mapovanie: Mapovanie } {
  let najlepsi = { index: 0, mapovanie: {} as Mapovanie, pocet: -1 };
  for (let i = 0; i < Math.min(riadky.length, 20); i++) {
    const m = rozpoznajStlpce(riadky[i] ?? []);
    const pocet = Object.keys(m).length + (jeMapovanieIste(m) ? 10 : 0);
    if (pocet > najlepsi.pocet) najlepsi = { index: i, mapovanie: m, pocet };
  }
  return { index: najlepsi.index, mapovanie: najlepsi.mapovanie };
}

/* -------------------------------------------------------- čísla, dátumy */

/**
 * Číslo z bunky: „1 234,56“, „1.234,56“, „1,234.56“, „-12,50“, „12,50-“,
 * „(12,50)“, „1 234,56 €“. Nezaokrúhľuje — litre a ceny za liter majú tri miesta.
 */
export function cislo(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "")
    .replace(/[\s  ']/g, "")
    .trim();
  if (!s) return null;
  let zaporne = false;
  if (/^\(.*\)$/.test(s)) {
    zaporne = true;
    s = s.slice(1, -1);
  }
  if (/-$/.test(s)) {
    zaporne = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/^[^\d,.-]+|[^\d,.]+$/g, "");
  if (s.startsWith("-")) {
    zaporne = !zaporne;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const ciarka = s.lastIndexOf(",");
  const bodka = s.lastIndexOf(".");
  let norm: string;
  if (ciarka >= 0 && bodka >= 0) {
    norm = ciarka > bodka ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (ciarka >= 0) {
    // Len čiarky: viac ich = tisíce (1,234,567), jedna = desatinná (slovenský zápis).
    norm = (s.match(/,/g) ?? []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else {
    norm = (s.match(/\./g) ?? []).length > 1 ? s.replace(/\./g, "") : s;
  }
  const n = Number(norm);
  if (!Number.isFinite(n)) return null;
  return zaporne ? -n : n;
}

const dvojmiestne = (n: number | string) => String(n).padStart(2, "0");

function platnyDatum(r: number, m: number, d: number): string | null {
  if (r < 2000 || r > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(r, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${r}-${dvojmiestne(m)}-${dvojmiestne(d)}`;
}

/** Excel ukladá dátum ako počet dní od 30. 12. 1899, čas ako zlomok dňa. */
function zExcelu(v: number): { datum: string | null; cas: string | null } {
  const ms = Math.round(v * 86400) * 1000;
  const d = new Date(Date.UTC(1899, 11, 30) + ms);
  const cas = v % 1 ? `${dvojmiestne(d.getUTCHours())}:${dvojmiestne(d.getUTCMinutes())}` : null;
  return { datum: d.toISOString().slice(0, 10), cas };
}

/**
 * Dátum (a čas, ak je v tej istej bunke) na `YYYY-MM-DD` / `HH:MM`.
 * „31.10.2026“, „31. 10. 2026 14:35“, „31.10.26“, „2026-10-31“, „31/10/2026“,
 * číslo z Excelu. Nezmyselný dátum je `null`.
 */
export function datumACas(v: unknown): { datum: string | null; cas: string | null } {
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) return zExcelu(v);
    return { datum: null, cas: null };
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return {
      datum: platnyDatum(v.getFullYear(), v.getMonth() + 1, v.getDate()),
      cas:
        v.getHours() || v.getMinutes()
          ? `${dvojmiestne(v.getHours())}:${dvojmiestne(v.getMinutes())}`
          : null,
    };
  }
  const s = String(v ?? "").trim();
  if (!s) return { datum: null, cas: null };
  if (/^\d{5}([.,]\d+)?$/.test(s)) return datumACas(Number(s.replace(",", ".")));
  let datum: string | null = null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) datum = platnyDatum(+m[1], +m[2], +m[3]);
  else if ((m = /^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4})(?!\d)/.exec(s))) {
    let r = +m[3];
    if (m[3].length === 2) r += 2000;
    let d = +m[1];
    let mes = +m[2];
    // Americký zápis m/d/rrrr sa prezradí len dňom nad 12 na druhom mieste.
    if (mes > 12 && d <= 12) [d, mes] = [mes, d];
    datum = platnyDatum(r, mes, d);
  }
  const c = /(?:^|[\sT])(\d{1,2}):(\d{2})(?::\d{2})?/.exec(s);
  const cas = c && +c[1] < 24 && +c[2] < 60 ? `${dvojmiestne(c[1])}:${c[2]}` : null;
  return { datum, cas };
}

/** Samotný čas z bunky („14:35“, „14:35:10“, zlomok dňa z Excelu). */
export function casZBunky(v: unknown): string | null {
  if (typeof v === "number" && v >= 0 && v < 1) return zExcelu(v + 30000).cas ?? "00:00";
  if (typeof v === "number" && v > 20000) return zExcelu(v).cas;
  const m = /(\d{1,2}):(\d{2})/.exec(String(v ?? ""));
  return m && +m[1] < 24 && +m[2] < 60 ? `${dvojmiestne(m[1])}:${m[2]}` : null;
}

const KRAJINY: Record<string, string> = {
  SK: "SK",
  SVK: "SK",
  SLOVENSKO: "SK",
  SLOVAKIA: "SK",
  "SLOVENSKA REPUBLIKA": "SK",
  CZ: "CZ",
  CZE: "CZ",
  CESKO: "CZ",
  "CESKA REPUBLIKA": "CZ",
  CZECHIA: "CZ",
  "CZECH REPUBLIC": "CZ",
  AT: "AT",
  AUT: "AT",
  RAKUSKO: "AT",
  AUSTRIA: "AT",
  HU: "HU",
  HUN: "HU",
  MADARSKO: "HU",
  HUNGARY: "HU",
  PL: "PL",
  POL: "PL",
  POLSKO: "PL",
  POLAND: "PL",
  DE: "DE",
  DEU: "DE",
  NEMECKO: "DE",
  GERMANY: "DE",
  SI: "SI",
  SVN: "SI",
  SLOVINSKO: "SI",
  HR: "HR",
  HRV: "HR",
  CHORVATSKO: "HR",
  IT: "IT",
  ITA: "IT",
  TALIANSKO: "IT",
  RO: "RO",
  ROU: "RO",
  RUMUNSKO: "RO",
};

/** Krajina na ISO 2 („Slovensko“, „SVK“ → „SK“); neznáma je `null`. */
export function kodKrajiny(v: unknown): string | null {
  const s = String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
  if (!s) return null;
  if (KRAJINY[s]) return KRAJINY[s];
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

/* --------------------------------------------------------- riadky výpisu */

const PALIVO =
  /nafta|diesel|benzin|natural|super|v-?power|fuel ?save|lpg|cng|\bbe?95\b|\b9[58]\b|\b100\b|motorov|gasoline|petrol|palivo|\be10\b|\be5\b/i;
const NIE_PALIVO =
  /zlava|sleva|discount|rabat|poplat|mytie|umyv|adblue|mazivo|maziva|olej|dialnic|myto/i;
const ZLAVA = /zlava|sleva|discount|rabat|bonus/i;

const bezDiakritiky = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Riadok výpisu po poliach — z tabuľky cez mapovanie alebo priamo z AI. */
export type SurovyRiadok = Partial<Record<PoleVypisu, unknown>>;

export function riadokPodlaMapovania(riadok: unknown[], m: Mapovanie): SurovyRiadok {
  const o: SurovyRiadok = {};
  for (const [pole, i] of Object.entries(m) as [PoleVypisu, number][]) {
    if (i == null || i < 0) continue;
    const v = riadok[i];
    if (v !== undefined && v !== null && String(v).trim() !== "") o[pole] = v;
  }
  return o;
}

export type NormalizovanyRiadok = Omit<KartaTransakcia, "externeId" | "nakupId" | "surove"> & {
  /** Číslo transakcie z výpisu, ak ho výpis má. */
  transakciaId: string | null;
  /** DPH alebo základ boli dopočítané (sadzba nebola vo výpise). */
  odhadDph: boolean;
};

export type KontextVypisu = {
  /** Krajina firmy — sadzba sa dopočíta len pri domácich nákupoch. */
  krajinaFirmy: string;
  mena: string;
};

const text = (v: unknown, max = 200): string | null => {
  const s = String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Jeden riadok výpisu na transakciu, alebo dôvod, prečo sa preskočil.
 * Chýbajúce sumy sa dopočítajú (s DPH ↔ bez DPH cez sadzbu alebo DPH);
 * pri domácom nákupe bez sadzby sa použije základná sadzba krajiny a riadok
 * sa označí ako odhad.
 */
export function normalizujRiadok(
  r: SurovyRiadok,
  k: KontextVypisu,
): { ok: true; riadok: NormalizovanyRiadok } | { ok: false; dovod: string } {
  const dc = datumACas(r.datum);
  if (!dc.datum) return { ok: false, dovod: "bez dátumu" };
  const cas = casZBunky(r.cas) ?? dc.cas ?? "00:00";
  const domaca = (k.krajinaFirmy || "SK").toUpperCase();
  const krajina = kodKrajiny(r.krajina) ?? domaca;

  const mnozstvoRaw = cislo(r.mnozstvo);
  const jednCena = cislo(r.jednCena);
  let zaklad = cislo(r.zaklad);
  let dph = cislo(r.dph);
  let spolu = cislo(r.spolu);
  let sadzba = cislo(r.sadzba);
  if (sadzba != null && sadzba > 0 && sadzba < 1) sadzba = r2(sadzba * 100); // 0,23 z Excelu
  let odhadDph = false;

  if (spolu == null && zaklad == null && jednCena != null && mnozstvoRaw != null) {
    spolu = r2(jednCena * mnozstvoRaw);
    odhadDph = true;
  }
  if (spolu == null && zaklad == null) return { ok: false, dovod: "bez sumy" };

  if (spolu != null && zaklad != null && dph == null) dph = r2(spolu - zaklad);
  else if (spolu != null && zaklad == null && dph != null) zaklad = r2(spolu - dph);
  else if (spolu == null && zaklad != null && dph != null) spolu = r2(zaklad + dph);
  else if (spolu == null && zaklad != null) {
    let s = sadzba;
    if (s == null && krajina === domaca) {
      s = zakladnaSadzba(domaca as KrajinaDane, dc.datum);
      odhadDph = true;
    }
    dph = s == null ? 0 : r2((zaklad * s) / 100);
    spolu = r2(zaklad + dph);
  } else if (spolu != null && zaklad == null) {
    let s = sadzba;
    if (s == null && krajina === domaca) {
      s = zakladnaSadzba(domaca as KrajinaDane, dc.datum);
      odhadDph = true;
    }
    if (s == null) {
      // Zahraničný nákup bez rozpisu DPH — celá suma je náklad.
      zaklad = spolu;
      dph = 0;
    } else {
      zaklad = r2(spolu / (1 + s / 100));
      dph = r2(spolu - zaklad);
    }
  }
  zaklad = r2(zaklad ?? 0);
  dph = r2(dph ?? 0);
  spolu = r2(spolu ?? zaklad + dph);
  if (Math.abs(spolu) < 0.005) return { ok: false, dovod: "nulová suma" };
  if (sadzba == null) sadzba = sadzbaZoSum(zaklad, dph);

  const produkt = text(r.produkt, 120);
  const pn = bezDiakritiky(produkt ?? "");
  const jednotka = text(r.jednotka, 12);
  const jeZlava = ZLAVA.test(pn);
  const jePalivo = !!produkt && PALIVO.test(pn) && !NIE_PALIVO.test(pn);
  const mnozstvo = mnozstvoRaw == null ? null : r3(Math.abs(mnozstvoRaw));
  const spz = text(r.spz, 20);
  const karta =
    maskaKarty(r.karta) ??
    (spz && normalizujSpz(spz).length >= 4 ? `EČV ${normalizujSpz(spz)}` : null);
  const km = cislo(r.tachometer);

  return {
    ok: true,
    riadok: {
      cas: casVBratislave(dc.datum, `${cas}:00`),
      datum: dc.datum,
      karta,
      spz,
      vodic: text(r.vodic, 80),
      produkt,
      produktKod: null,
      jePalivo,
      mnozstvo,
      jednotka: jednotka ?? (jePalivo ? "L" : null),
      zaklad,
      dph,
      sadzbaDph: sadzba,
      spolu,
      mena: (text(r.mena, 3) ?? k.mena ?? "EUR").toUpperCase(),
      krajina,
      krajinaDph: krajina,
      miesto: text(r.stanica, 160),
      tachometerKm: km != null && km > 0 && km < 10_000_000 ? Math.round(km) : null,
      fakturaCislo: text(r.faktura, 40),
      fakturaDatum: null,
      // Zľava od vydavateľa karty je záporný riadok, nie dobropis.
      dobropis: spolu < 0 && !jeZlava,
      transakciaId: text(r.transakcia, 60),
      odhadDph,
    },
  };
}

/* -------------------------------------------------------------- odtlačok */

/** cyrb53 — krátky, stabilný hash textu (nie kryptografický, len na odtlačok). */
export function hash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const kluc = (s: string | null) =>
  bezDiakritiky(String(s ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Odtlačok riadku — `externe_id` transakcie. Ten istý výpis nahratý znova
 * dá tie isté odtlačky, takže `upsert` nič nezdvojí. Dva rovnaké nákupy v
 * jednom výpise (dvakrát tá istá suma v ten istý deň) rozlíši poradie.
 */
export function odtlacky(riadky: NormalizovanyRiadok[]): string[] {
  const videne = new Map<string, number>();
  return riadky.map((t) => {
    const zaklad = t.transakciaId
      ? ["id", t.datum, kluc(t.transakciaId), kluc(t.produkt), t.spolu.toFixed(2)]
      : [
          t.datum,
          t.cas.slice(11, 16),
          kluc(t.karta),
          kluc(t.produkt),
          (t.mnozstvo ?? 0).toFixed(2),
          t.spolu.toFixed(2),
          kluc(t.miesto),
        ];
    const k = zaklad.join("|");
    const n = (videne.get(k) ?? 0) + 1;
    videne.set(k, n);
    return `vypis:${hash(k)}${n > 1 ? `-${n}` : ""}`;
  });
}

/** Normalizované riadky → transakcie s odtlačkom (nákup = jeden riadok). */
export function naTransakcie(riadky: NormalizovanyRiadok[]): KartaTransakcia[] {
  const idcka = odtlacky(riadky);
  return riadky.map((r, i) => {
    const { transakciaId, odhadDph, ...t } = r;
    return {
      ...t,
      externeId: idcka[i],
      // Viac riadkov s tým istým číslom transakcie = jeden nákup (nafta + AdBlue).
      nakupId: transakciaId ? `${t.datum}|${kluc(transakciaId)}` : null,
      surove: { transakcia: transakciaId, odhadDph: odhadDph || undefined },
    };
  });
}

/* ---------------------------------------------------------------- tabuľka */

export type VysledokTabulky = {
  hlavicka: string[];
  hlavickaIndex: number;
  mapovanie: Mapovanie;
  iste: boolean;
  riadky: NormalizovanyRiadok[];
  preskocene: { riadok: number; dovod: string }[];
  /** Súčtový riadok výpisu („Spolu“), ak ho výpis má — na kontrolu súčtu. */
  sucetVypisu: number | null;
  /** Prvé riadky pod hlavičkou na ručné priradenie stĺpcov. */
  ukazka: string[][];
};

const SUCTOVY = /^(spolu|celkom|celkem|sucet|soucet|total|suma spolu|spolu za)/i;

/**
 * Tabuľka (riadky z CSV/XLSX) → transakcie. `mapovanie` od človeka prebije
 * rozpoznané. Riadok bez dátumu, ktorý začína „Spolu/Celkom“, je súčet výpisu.
 */
export function tabulkaNaRiadky(
  tabulka: unknown[][],
  k: KontextVypisu,
  rucne?: { hlavickaIndex?: number; mapovanie?: Mapovanie } | null,
): VysledokTabulky {
  const najdena = najdiHlavicku(tabulka);
  const hlavickaIndex = rucne?.hlavickaIndex ?? najdena.index;
  const mapovanie =
    rucne?.mapovanie && Object.keys(rucne.mapovanie).length
      ? rucne.mapovanie
      : rucne?.hlavickaIndex !== undefined
        ? rozpoznajStlpce(tabulka[hlavickaIndex] ?? [])
        : najdena.mapovanie;
  const hlavicka = (tabulka[hlavickaIndex] ?? []).map((h) => String(h ?? "").trim());
  const riadky: NormalizovanyRiadok[] = [];
  const preskocene: { riadok: number; dovod: string }[] = [];
  let sucetVypisu: number | null = null;
  for (let i = hlavickaIndex + 1; i < tabulka.length; i++) {
    const surovy = tabulka[i] ?? [];
    if (!surovy.some((b) => String(b ?? "").trim() !== "")) continue;
    const r = riadokPodlaMapovania(surovy, mapovanie);
    const n = normalizujRiadok(r, k);
    if (n.ok) {
      riadky.push(n.riadok);
      continue;
    }
    const prvy = bezDiakritiky(
      String(surovy.find((b) => String(b ?? "").trim() !== "") ?? ""),
    ).trim();
    if (SUCTOVY.test(prvy)) {
      const s = cislo(r.spolu) ?? null;
      if (s != null) sucetVypisu = r2(s);
      continue;
    }
    preskocene.push({ riadok: i + 1, dovod: n.dovod });
  }
  return {
    hlavicka,
    hlavickaIndex,
    mapovanie,
    iste: jeMapovanieIste(mapovanie),
    riadky,
    preskocene,
    sucetVypisu,
    ukazka: tabulka
      .slice(hlavickaIndex + 1, hlavickaIndex + 6)
      .map((r) => (r ?? []).map((b) => String(b ?? "").slice(0, 40))),
  };
}

/* ----------------------------------------------------------------- súčty */

export type SuctyVypisu = {
  riadkov: number;
  zaklad: number;
  dph: number;
  spolu: number;
  litre: number;
  /** Suma s DPH podľa faktúr vo výpise. */
  podlaFaktur: { cislo: string | null; riadkov: number; spolu: number }[];
};

export function sucty(
  riadky: Pick<
    KartaTransakcia,
    "zaklad" | "dph" | "spolu" | "mnozstvo" | "jePalivo" | "jednotka" | "fakturaCislo"
  >[],
): SuctyVypisu {
  const o: SuctyVypisu = {
    riadkov: riadky.length,
    zaklad: 0,
    dph: 0,
    spolu: 0,
    litre: 0,
    podlaFaktur: [],
  };
  const f = new Map<string, { cislo: string | null; riadkov: number; spolu: number }>();
  for (const r of riadky) {
    o.zaklad = r2(o.zaklad + r.zaklad);
    o.dph = r2(o.dph + r.dph);
    o.spolu = r2(o.spolu + r.spolu);
    if (r.jePalivo && r.mnozstvo) o.litre = r3(o.litre + r.mnozstvo);
    const k = r.fakturaCislo ?? "";
    const x = f.get(k) ?? { cislo: r.fakturaCislo ?? null, riadkov: 0, spolu: 0 };
    x.riadkov++;
    x.spolu = r2(x.spolu + r.spolu);
    f.set(k, x);
  }
  o.podlaFaktur = [...f.values()];
  return o;
}

/** Rozdiel súm: faktúra − riadky. Nenulový ide na faktúre ako dorovnávací riadok. */
export function rozdielSuctu(sumaFaktury: number | null, sucetRiadkov: number): number | null {
  if (sumaFaktury == null || !Number.isFinite(sumaFaktury)) return null;
  return r2(sumaFaktury - sucetRiadkov);
}

/* ------------------------------------------------------------- AI (PDF) */

export const POKYN_AI = `ÚLOHA: Toto je faktúra alebo výpis k palivovej karte (napr. Up Déjeuner / Shell, DKV, OMV). Vyber hlavičku faktúry a VŠETKY jednotlivé nákupy (riadky rozpisu transakcií).

Vráť LEN JSON v tvare:
{"faktura":{"cislo":string|null,"datum":"YYYY-MM-DD"|null,"splatnost":"YYYY-MM-DD"|null,"zaklad":number|null,"dph":number|null,"spolu":number|null,"mena":"EUR"|...,"dodavatel":string|null,"ico":string|null,"dic":string|null},
 "riadky":[{"datum":"YYYY-MM-DD","cas":"HH:MM"|null,"karta":string|null,"spz":string|null,"vodic":string|null,"stanica":string|null,"krajina":"SK"|...|null,"produkt":string|null,"mnozstvo":number|null,"jednotka":string|null,"jednCena":number|null,"zaklad":number|null,"dph":number|null,"sadzba":number|null,"spolu":number|null,"tachometer":number|null,"transakcia":string|null}]}

PRAVIDLÁ:
- Každý nákup (tankovanie, AdBlue, umytie, poplatok, zľava) je samostatný riadok; zľavu ako záporné sumy.
- Sumy ako čísla s desatinnou bodkou, bez meny a medzier. "spolu" = suma s DPH, "zaklad" = bez DPH.
- Číslo karty prepíš tak, ako je na doklade (aj maskované).
- Súčtové riadky (Spolu, Celkom, rekapitulácia DPH) do "riadky" NEDÁVAJ — patria do hlavičky faktúry.
- Čo na doklade nie je, daj null. Nič si nevymýšľaj.`;

export type FakturaZVypisu = {
  cislo: string | null;
  datum: string | null;
  splatnost: string | null;
  zaklad: number | null;
  dph: number | null;
  spolu: number | null;
  mena: string | null;
};

/** Odpoveď AI → hlavička faktúry a riadky v tvare surového riadku. */
export function zAiOdpovede(o: unknown): { faktura: FakturaZVypisu; riadky: SurovyRiadok[] } {
  const x = (o && typeof o === "object" ? o : {}) as Record<string, any>;
  const f = (x.faktura && typeof x.faktura === "object" ? x.faktura : {}) as Record<
    string,
    unknown
  >;
  const riadky = (Array.isArray(x.riadky) ? x.riadky : [])
    .filter((r: unknown) => r && typeof r === "object")
    .slice(0, 3000)
    .map((r: Record<string, unknown>) => {
      const o: SurovyRiadok = {};
      for (const p of POLIA_VYPISU) if (r[p] != null && r[p] !== "") o[p] = r[p];
      return o;
    });
  return {
    faktura: {
      cislo: text(f.cislo, 40),
      datum: datumACas(f.datum).datum,
      splatnost: datumACas(f.splatnost).datum,
      zaklad: cislo(f.zaklad),
      dph: cislo(f.dph),
      spolu: cislo(f.spolu),
      mena: text(f.mena, 3)?.toUpperCase() ?? null,
    },
    riadky,
  };
}
