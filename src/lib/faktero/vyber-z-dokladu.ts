/*
  Oprava poľa kliknutím do náhľadu dokladu (ako Rossum).

  Keď AI prečíta pole zle, človek klikne do poľa vo formulári a potom na
  správny text v náhľade. Text z dokladu ale nie je hodnota: „1 234,50 €" treba
  zapísať ako 1234.5, „12. 10. 2026" ako 2026-10-12, IBAN bez medzier a IČO len
  z číslic. Tu je celé to prevádzanie — bez Reactu, aby sa dalo otestovať.
*/
import type { UdajeNespracovaneho } from "./nespracovane";

export type TypPola =
  | "text"
  | "cislo"
  | "suma"
  | "datum"
  | "iban"
  | "ico"
  | "dic"
  | "icdph"
  | "symbol"
  | "psc"
  | "mena";

export type KlucPola =
  | "dodavatel.nazov"
  | "dodavatel.ico"
  | "dodavatel.icDph"
  | "dodavatel.dic"
  | "dodavatel.iban"
  | "dodavatel.ulica"
  | "dodavatel.mesto"
  | "dodavatel.psc"
  | "cislo"
  | "popis"
  | "vs"
  | "ks"
  | "ss"
  | "objednavka"
  | "dodaciList"
  | "datumVystavenia"
  | "datumDodania"
  | "splatnost"
  | "opravuje"
  | "mena"
  | "celkom"
  | "ostatny.predmet"
  | "ostatny.lehota";

export type PoleVyberu = {
  kluc: KlucPola;
  nazov: string;
  typ: TypPola;
  /**
   * Čo vezme jedno kliknutie: „slovo" (číslo, VS) alebo celý úsek textu, ako ho
   * nesie PDF („úsek" — názov firmy či ulica majú viac slov).
   */
  klik: "slovo" | "usek";
  /** Popisy poľa vo formulári — podľa nich sa pole spozná, keď doň človek klikne. */
  popisy: string[];
};

export const POLIA_VYBERU: PoleVyberu[] = [
  {
    kluc: "dodavatel.nazov",
    nazov: "Názov dodávateľa",
    typ: "text",
    klik: "usek",
    popisy: ["Dodávateľ", "Názov"],
  },
  { kluc: "dodavatel.ico", nazov: "IČO", typ: "ico", klik: "slovo", popisy: ["IČO"] },
  { kluc: "dodavatel.icDph", nazov: "IČ DPH", typ: "icdph", klik: "slovo", popisy: ["IČ DPH"] },
  { kluc: "dodavatel.dic", nazov: "DIČ", typ: "dic", klik: "slovo", popisy: ["DIČ"] },
  { kluc: "dodavatel.iban", nazov: "IBAN", typ: "iban", klik: "usek", popisy: ["IBAN"] },
  {
    kluc: "dodavatel.ulica",
    nazov: "Ulica a číslo",
    typ: "text",
    klik: "usek",
    popisy: ["Ulica a číslo"],
  },
  { kluc: "dodavatel.mesto", nazov: "Mesto", typ: "text", klik: "usek", popisy: ["Mesto"] },
  { kluc: "dodavatel.psc", nazov: "PSČ", typ: "psc", klik: "usek", popisy: ["PSČ"] },
  { kluc: "cislo", nazov: "Číslo dokladu", typ: "cislo", klik: "slovo", popisy: ["Číslo dokladu"] },
  { kluc: "popis", nazov: "Popis plnenia", typ: "text", klik: "usek", popisy: ["Popis plnenia"] },
  {
    kluc: "vs",
    nazov: "Variabilný symbol",
    typ: "symbol",
    klik: "slovo",
    popisy: ["Variabilný symbol"],
  },
  {
    kluc: "ks",
    nazov: "Konštantný symbol",
    typ: "symbol",
    klik: "slovo",
    popisy: ["Konštantný symbol"],
  },
  {
    kluc: "ss",
    nazov: "Špecifický symbol",
    typ: "symbol",
    klik: "slovo",
    popisy: ["Špecifický symbol"],
  },
  {
    kluc: "objednavka",
    nazov: "Číslo objednávky",
    typ: "cislo",
    klik: "slovo",
    popisy: ["Číslo objednávky"],
  },
  {
    kluc: "dodaciList",
    nazov: "Číslo dodacieho listu",
    typ: "cislo",
    klik: "slovo",
    popisy: ["Číslo dodacieho listu"],
  },
  {
    kluc: "datumVystavenia",
    nazov: "Dátum vystavenia",
    typ: "datum",
    klik: "usek",
    popisy: ["Dátum vystavenia"],
  },
  {
    kluc: "datumDodania",
    nazov: "Dátum dodania",
    typ: "datum",
    klik: "usek",
    popisy: ["Dátum dodania"],
  },
  { kluc: "splatnost", nazov: "Splatnosť", typ: "datum", klik: "usek", popisy: ["Splatnosť"] },
  {
    kluc: "opravuje",
    nazov: "Opravuje faktúru č.",
    typ: "cislo",
    klik: "slovo",
    popisy: ["Opravuje faktúru"],
  },
  { kluc: "mena", nazov: "Mena", typ: "mena", klik: "slovo", popisy: ["Mena"] },
  { kluc: "celkom", nazov: "Suma spolu", typ: "suma", klik: "usek", popisy: ["Suma spolu"] },
  { kluc: "ostatny.predmet", nazov: "Predmet", typ: "text", klik: "usek", popisy: ["Predmet"] },
  { kluc: "ostatny.lehota", nazov: "Lehota", typ: "datum", klik: "usek", popisy: ["Lehota"] },
];

const POLE = new Map(POLIA_VYBERU.map((p) => [p.kluc, p]));
export function poleVyberu(kluc: KlucPola): PoleVyberu {
  return POLE.get(kluc)!;
}

const zjednot = (s: string) => s.replace(/\s+/g, " ").trim().toLocaleLowerCase("sk");

/**
 * Pole formulára podľa jeho popisu (aria-label alebo text nad poľom).
 * Porovnáva sa začiatok, lebo za popisom môže byť ešte štítok („naučené").
 * Dlhší popis má prednosť — „Číslo dokladu" nesmie zobrať „Číslo".
 */
export function polePodlaPopisu(popis: string | null | undefined): KlucPola | null {
  const t = zjednot(popis ?? "");
  if (!t) return null;
  let najlepsie: { kluc: KlucPola; dlzka: number } | null = null;
  for (const p of POLIA_VYBERU)
    for (const pp of p.popisy) {
      const z = zjednot(pp);
      if (t === z || (t.startsWith(z) && !/[\p{L}\d]/u.test(t[z.length] ?? ""))) {
        if (!najlepsie || z.length > najlepsie.dlzka) najlepsie = { kluc: p.kluc, dlzka: z.length };
      }
    }
  return najlepsie?.kluc ?? null;
}

/* ---------------------------------------------------------------- sumy */

/** Suma s oddeľovačmi tisícov (medzera, bodka, čiarka, apostrof) alebo bez nich. */
const VZOR_SUMY =
  /[-−–]?\s?(?:\d{1,3}(?:[   .,'’]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,3})?)(?!\d)/g;

/** „1 234,50" aj „1,234.50" aj „1.234,5" → 1234.5. Nerozpoznané → null. */
export function precitajSumu(text: string): number | null {
  const najdene = [...String(text ?? "").matchAll(VZOR_SUMY)];
  if (!najdene.length) return null;
  return sumaZRetazca(najdene[0][0]);
}

function sumaZRetazca(s: string): number | null {
  let t = s.replace(/[\s  '’]/g, "");
  const zaporna = /^[-−–]/.test(t);
  t = t.replace(/^[-−–]/, "");
  const posledna = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  if (posledna >= 0) {
    const zaNou = t.length - posledna - 1;
    const oddelovac = t[posledna];
    const pocet = t.split(oddelovac).length - 1;
    const ineOddelovace = /[.,]/.test(
      t.slice(0, posledna).replace(new RegExp(`\\${oddelovac}`, "g"), ""),
    );
    // Desatinná časť: 1–2 číslice, alebo za iným oddeľovačom tisícov,
    // alebo „0,500" (nula pred čiarkou tisíce nemá).
    const desatinna = pocet === 1 && (zaNou !== 3 || ineOddelovace || /^0[.,]/.test(t));
    if (desatinna && zaNou > 0) {
      t = t.slice(0, posledna).replace(/[.,]/g, "") + "." + t.slice(posledna + 1);
    } else {
      t = t.replace(/[.,]/g, "");
    }
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round((zaporna ? -n : n) * 100) / 100;
}

/* -------------------------------------------------------------- dátumy */

const bezDiakritiky = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Mesiac podľa slova — slovensky, česky aj anglicky (v hocijakom páde). */
function mesiacZoSlova(slovo: string): number | null {
  const w = bezDiakritiky(slovo).replace(/\.$/, "");
  if (w.length < 3) return null;
  // Česko: červen (6) a červenec (7) majú rovnaký začiatok.
  if (/^cervenc|^cervence/.test(w)) return 7;
  if (/^cerv/.test(w)) return 6;
  const zaciatky: [RegExp, number][] = [
    [/^(jan|led)/, 1],
    [/^(feb|uno)/, 2],
    [/^(mar|bre)/, 3],
    [/^(apr|dub)/, 4],
    [/^(maj|may|kve)/, 5],
    [/^jun/, 6],
    [/^jul/, 7],
    [/^(aug|srp)/, 8],
    [/^(sep|zar)/, 9],
    [/^(okt|oct|rij)/, 10],
    [/^(nov|lis)/, 11],
    [/^(dec|pro)/, 12],
  ];
  for (const [r, m] of zaciatky) if (r.test(w)) return m;
  return null;
}

function rok(r: string): number {
  const n = Number(r);
  return r.length === 2 ? 2000 + n : n;
}

function iso(y: number, m: number, d: number): string | null {
  if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const SLOVO = "([\\p{L}]{3,}\\.?)";
const VZORY_DATUMU: { r: RegExp; z: (m: RegExpMatchArray) => string | null }[] = [
  // 2026-10-12
  { r: /(\d{4})-(\d{1,2})-(\d{1,2})/u, z: (m) => iso(Number(m[1]), Number(m[2]), Number(m[3])) },
  // 12.10.2026, 12. 10. 2026, 12/10/2026, 12-10-26
  {
    r: /(\d{1,2})\s?[./-]\s?(\d{1,2})\s?[./-]\s?(\d{4}|\d{2})(?!\d)/u,
    z: (m) => iso(rok(m[3]), Number(m[2]), Number(m[1])),
  },
  // 12. októbra 2026, 12 Oct 2026
  {
    r: new RegExp(`(\\d{1,2})\\.?\\s*${SLOVO}\\s*(\\d{4})`, "u"),
    z: (m) => {
      const mes = mesiacZoSlova(m[2]);
      return mes ? iso(Number(m[3]), mes, Number(m[1])) : null;
    },
  },
  // October 12, 2026
  {
    r: new RegExp(`${SLOVO}\\s*(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})`, "u"),
    z: (m) => {
      const mes = mesiacZoSlova(m[1]);
      return mes ? iso(Number(m[3]), mes, Number(m[2])) : null;
    },
  },
];

/** Dátum v hocijakom bežnom tvare → „RRRR-MM-DD". Nerozpoznaný → null. */
export function precitajDatum(text: string): string | null {
  const t = String(text ?? "");
  let najskor: { poz: number; hodnota: string } | null = null;
  for (const v of VZORY_DATUMU) {
    const m = t.match(v.r);
    if (!m || m.index == null) continue;
    const h = v.z(m);
    if (h && (!najskor || m.index < najskor.poz)) najskor = { poz: m.index, hodnota: h };
  }
  return najskor?.hodnota ?? null;
}

/* ------------------------------------------------- identifikátory a pod. */

/** Kontrola IBAN-u modulom 97. */
export function platnyIban(iban: string): boolean {
  const t = iban.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(t)) return false;
  const prest = t.slice(4) + t.slice(0, 4);
  let zvysok = 0;
  for (const ch of prest) {
    const kod = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const c of kod) zvysok = (zvysok * 10 + Number(c)) % 97;
  }
  return zvysok === 1;
}

export function precitajIban(text: string): string | null {
  const t = String(text ?? "")
    .toUpperCase()
    .replace(/[\s  -]/g, "");
  const kandidati = [...t.matchAll(/[A-Z]{2}\d{2}[A-Z0-9]{10,30}/g)].map((m) => m[0]);
  if (!kandidati.length) return null;
  // Za IBAN-om býva hneď BIC alebo slovo — skráť na najdlhší platný.
  for (const k of kandidati)
    for (let n = Math.min(k.length, 34); n >= 14; n--)
      if (platnyIban(k.slice(0, n))) return k.slice(0, n);
  return kandidati[0].slice(0, 34);
}

/** Číslice bez medzier medzi nimi („123 45 678" → „12345678"). */
function zlepCislice(t: string): string {
  return t.replace(/(\d)[\s  ]+(?=\d)/g, "$1");
}

export function precitajIco(text: string): string | null {
  const m = zlepCislice(String(text ?? "")).match(/(?<!\d)\d{6,8}(?!\d)/);
  return m ? m[0].padStart(8, "0") : null;
}

export function precitajDic(text: string): string | null {
  const t = zlepCislice(String(text ?? "").toUpperCase());
  const cz = t.match(/CZ\s?(\d{8,10})(?!\d)/);
  if (cz) return `CZ${cz[1]}`;
  const m = t.match(/(?<!\d)\d{9,10}(?!\d)/);
  return m ? m[0] : null;
}

export function precitajIcDph(text: string): string | null {
  const t = String(text ?? "")
    .toUpperCase()
    .replace(/[\s  ]/g, "");
  const m =
    t.match(/(?<![A-Z])([A-Z]{2})(\d[\dA-Z]{1,13})/) ?? t.match(/([A-Z]{2})(\d[\dA-Z]{1,13})/);
  return m ? m[1] + m[2] : null;
}

/** VS, KS, ŠS — len číslice, najviac 10. */
export function precitajSymbol(text: string): string | null {
  const m = String(text ?? "").match(/\d{1,10}(?!\d)/);
  return m ? m[0] : null;
}

export function precitajPsc(text: string): string | null {
  const m = zlepCislice(String(text ?? "")).match(/(?<!\d)(\d{3})(\d{2})(?!\d)/);
  return m ? `${m[1]} ${m[2]}` : null;
}

const KODY_MIEN = new Set([
  "EUR",
  "CZK",
  "USD",
  "GBP",
  "PLN",
  "HUF",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "RON",
  "BGN",
  "UAH",
  "JPY",
  "CNY",
  "CAD",
  "AUD",
  "TRY",
  "RSD",
  "ISK",
]);

const SYMBOLY_MIEN: [RegExp, string][] = [
  [/€/, "EUR"],
  [/kč/i, "CZK"],
  [/zł/i, "PLN"],
  [/£/, "GBP"],
  [/\$/, "USD"],
  [/ft\b/i, "HUF"],
];

export function precitajMenu(text: string): string | null {
  const t = String(text ?? "");
  for (const m of t.toUpperCase().matchAll(/(?<![A-Z])[A-Z]{3}(?![A-Z])/g))
    if (KODY_MIEN.has(m[0])) return m[0];
  for (const [r, m] of SYMBOLY_MIEN) if (r.test(t)) return m;
  return null;
}

/**
 * Číslo dokladu: ak je v označení aj popis („Faktúra č.: 2026001"),
 * vezme sa len to za ním.
 */
export function precitajCislo(text: string): string | null {
  let t = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const zaDvojbodkou = t.match(/:\s*(\S.*)$/);
  if (zaDvojbodkou) t = zaDvojbodkou[1];
  // `\b` na „č" nefunguje (nie je to písmeno ASCII), preto medzera alebo začiatok.
  t = t.replace(/^(?:.*?(?:^|\s)(?:č\.|c\.|no\.|nr\.|číslo|cislo|number))\s*/iu, "");
  t = t.replace(/[,;]+$/, "").trim();
  return t || null;
}

export function precitajText(text: string): string | null {
  const t = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return t || null;
}

export type Hodnota = string | number;

/** Prevedie text z dokladu na hodnotu poľa. Nerozpoznaný text → null. */
export function normalizuj(typ: TypPola, text: string): Hodnota | null {
  switch (typ) {
    case "suma":
      return precitajSumu(text);
    case "datum":
      return precitajDatum(text);
    case "iban":
      return precitajIban(text);
    case "ico":
      return precitajIco(text);
    case "dic":
      return precitajDic(text);
    case "icdph":
      return precitajIcDph(text);
    case "symbol":
      return precitajSymbol(text);
    case "psc":
      return precitajPsc(text);
    case "mena":
      return precitajMenu(text);
    case "cislo":
      return precitajCislo(text);
    default:
      return precitajText(text);
  }
}

/** Ako sa hodnota typu volá v chybovej hláške. */
export const NAZOV_TYPU: Record<TypPola, string> = {
  text: "text",
  cislo: "číslo",
  suma: "sumu",
  datum: "dátum",
  iban: "IBAN",
  ico: "IČO",
  dic: "DIČ",
  icdph: "IČ DPH",
  symbol: "symbol",
  psc: "PSČ",
  mena: "menu",
};

/* ------------------------------------------------ kliknutie do riadku */

/** Vzory, ktoré sa môžu rozbehnúť cez viac slov („1 234,50", „12. 10. 2026", IBAN). */
const VZOR_ROZSIRENIA: Partial<Record<TypPola, RegExp>> = {
  suma: VZOR_SUMY,
  datum:
    /\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s?[./-]\s?\d{1,2}\s?[./-]\s?(?:\d{4}|\d{2})(?!\d)|\d{1,2}\.?\s*[\p{L}]{3,}\.?\s*\d{4}|[\p{L}]{3,}\.?\s*\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}/gu,
  iban: /[A-Z]{2}\d{2}(?:[  ]?[A-Z0-9]{1,4}){3,8}/gi,
  ico: /\d{2,3}(?:[  ]?\d{2,3}){1,3}/g,
  psc: /\d{3}[  ]?\d{2}(?!\d)/g,
};

/**
 * Hodnota z kliknutia na slovo v úseku textu z PDF. Keď kliknuté slovo patrí
 * do dlhšej hodnoty („234,50" z „1 234,50"), vezme sa celá. Inak samotné slovo,
 * a pri poliach, ktoré berú celý úsek (názov, ulica), celý úsek.
 */
export function hodnotaZKliku(
  pole: Pick<PoleVyberu, "typ" | "klik">,
  usek: string,
  od: number,
  po: number,
): Hodnota | null {
  const vzor = VZOR_ROZSIRENIA[pole.typ];
  if (vzor) {
    for (const m of usek.matchAll(new RegExp(vzor.source, vzor.flags))) {
      const z = m.index ?? 0;
      const k = z + m[0].length;
      if (z < po && k > od) {
        const h = normalizuj(pole.typ, m[0]);
        if (h != null) return h;
      }
    }
  }
  const slovo = usek.slice(od, po);
  if (pole.klik === "usek") {
    const h = normalizuj(pole.typ, usek);
    if (h != null && (pole.typ === "text" || !vzor)) return h;
  }
  return normalizuj(pole.typ, slovo) ?? (pole.klik === "usek" ? normalizuj(pole.typ, usek) : null);
}

/** Rozdelí úsek textu na slová s ich polohou (pre klikateľné rámčeky). */
export function slovaUseku(usek: string): { text: string; od: number; po: number }[] {
  return [...usek.matchAll(/\S+/g)].map((m) => ({
    text: m[0],
    od: m.index ?? 0,
    po: (m.index ?? 0) + m[0].length,
  }));
}

/* ------------------------------------------------------- zápis do údajov */

/** Zapíše hodnotu do údajov dokladu; vráti nové údaje (pôvodné nemení). */
export function zapisDoUdajov(
  u: UdajeNespracovaneho,
  kluc: KlucPola,
  hodnota: Hodnota,
): UdajeNespracovaneho {
  if (kluc === "celkom")
    return { ...u, celkom: typeof hodnota === "number" ? hodnota : precitajSumu(String(hodnota)) };
  const h = String(hodnota);
  if (kluc.startsWith("dodavatel.")) {
    const k = kluc.slice("dodavatel.".length) as keyof UdajeNespracovaneho["dodavatel"];
    return { ...u, dodavatel: { ...u.dodavatel, [k]: h } };
  }
  if (kluc.startsWith("ostatny.")) {
    const k = kluc.slice("ostatny.".length) as keyof UdajeNespracovaneho["ostatny"];
    return { ...u, ostatny: { ...u.ostatny, [k]: h } };
  }
  return { ...u, [kluc]: h } as UdajeNespracovaneho;
}

/** Hodnota na ukážku v potvrdení („1 234,50 €" → „1234.50"). */
export function hodnotaNaUkazku(typ: TypPola, h: Hodnota): string {
  if (typ === "suma" && typeof h === "number") return h.toFixed(2).replace(".", ",");
  if (typ === "datum" && typeof h === "string") {
    const [y, m, d] = h.split("-");
    return `${Number(d)}. ${Number(m)}. ${y}`;
  }
  return String(h);
}

/* ------------------------------------------- slová v náhľade a výber */

/** Slovo v náhľade — poloha v zlomkoch strany (0–1), aby nezáležalo na zväčšení. */
export type SlovoNahladu = {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  /** Celý úsek textu z PDF, do ktorého slovo patrí, a poloha slova v ňom. */
  usek: string;
  od: number;
  po: number;
};

export type Obdlznik = { x: number; y: number; w: number; h: number };

/**
 * Rozloží úsek textu z PDF na slová. pdf.js dáva polohu len celého úseku,
 * šírku slova preto odmeria `zmeraj` (písmom úseku) a pomerne ju roztiahne
 * na skutočnú šírku úseku.
 */
export function slovaZUseku(
  usek: { str: string; x: number; y: number; w: number; h: number },
  zmeraj: (s: string) => number,
): SlovoNahladu[] {
  const celkom = zmeraj(usek.str) || usek.str.length || 1;
  return slovaUseku(usek.str).map((s) => {
    const x0 = (zmeraj(usek.str.slice(0, s.od)) / celkom) * usek.w;
    const x1 = (zmeraj(usek.str.slice(0, s.po)) / celkom) * usek.w;
    return {
      x: usek.x + x0,
      y: usek.y,
      w: Math.max(x1 - x0, 0.001),
      h: usek.h,
      text: s.text,
      usek: usek.str,
      od: s.od,
      po: s.po,
    };
  });
}

/** Slovo pod bodom; pri prekrytí to najmenšie. Tolerancia je v zlomkoch strany. */
export function slovoNaBode(
  slova: SlovoNahladu[],
  x: number,
  y: number,
  tolerancia = 0.002,
): number {
  let najlepsie = -1;
  let plocha = Infinity;
  slova.forEach((s, i) => {
    if (
      x >= s.x - tolerancia &&
      x <= s.x + s.w + tolerancia &&
      y >= s.y - tolerancia &&
      y <= s.y + s.h + tolerancia &&
      s.w * s.h < plocha
    ) {
      najlepsie = i;
      plocha = s.w * s.h;
    }
  });
  return najlepsie;
}

/** Slová, ktorých stred leží v označenom obdĺžniku. */
export function slovaVObdlzniku(slova: SlovoNahladu[], r: Obdlznik): SlovoNahladu[] {
  return slova.filter((s) => {
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
  });
}

/** Text zo slov v poradí čítania — po riadkoch zhora, v riadku zľava. */
export function textZoSlov(slova: SlovoNahladu[]): string {
  const zoradene = [...slova].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const riadky: SlovoNahladu[][] = [];
  for (const s of zoradene) {
    const posledny = riadky[riadky.length - 1];
    const stred = s.y + s.h / 2;
    if (
      posledny &&
      Math.abs(posledny[0].y + posledny[0].h / 2 - stred) < Math.max(s.h, posledny[0].h) / 2
    )
      posledny.push(s);
    else riadky.push([s]);
  }
  return riadky
    .map((r) =>
      r
        .sort((a, b) => a.x - b.x)
        .map((s) => s.text)
        .join(" "),
    )
    .join("\n");
}

/** Normalizuje obdĺžnik ťahaný hocijakým smerom a oreže ho na stranu. */
export function obdlznikZBodov(ax: number, ay: number, bx: number, by: number): Obdlznik {
  const o = (v: number) => Math.min(1, Math.max(0, v));
  const x = o(Math.min(ax, bx));
  const y = o(Math.min(ay, by));
  return { x, y, w: o(Math.max(ax, bx)) - x, h: o(Math.max(ay, by)) - y };
}

/** Polia, ktoré formulár pri danom druhu dokladu ukazuje (rovnako ako stránka). */
export function poliaPreDruh(druh: string | null | undefined): KlucPola[] {
  const faktura = druh === "faktura" || druh === "zalohova" || druh === "dobropis";
  if (druh === "ostatny") return ["dodavatel.nazov", "ostatny.predmet", "ostatny.lehota"];
  const dodavatel: KlucPola[] = ["dodavatel.nazov", "dodavatel.ico", "dodavatel.icDph"];
  if (!druh) return dodavatel;
  if (!faktura) return [...dodavatel, "cislo", "datumVystavenia", "mena", "celkom"];
  const vsetky = POLIA_VYBERU.map((p) => p.kluc).filter((k) => !k.startsWith("ostatny."));
  return druh === "dobropis" ? vsetky : vsetky.filter((k) => k !== "opravuje");
}
