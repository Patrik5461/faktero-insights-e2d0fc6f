/*
  DATEV-Format „Buchungsstapel“ — import zaúčtovaných dokladov pre nemeckých
  daňových poradcov (DATEV Rechnungswesen, Kanzlei-Rechnungswesen, DATEV
  Unternehmen online). Vstupom je ten istý `DokladUctovania` ako pri Omege,
  Money S3 či Flexi.

  Zdroj formátu: DATEV Developer Portal, „DATEV-Format“ → „Buchungsstapel“
  (Header-Version 700, Formatkategorie 21, Formatversion 13). Súbor:
   - prvý riadok je hlavička EXTF (31 polí), druhý názvy stĺpcov, potom
     jeden riadok na zápis (125 stĺpcov, neobsadené ostávajú prázdne),
   - oddeľovač bodkočiarka, text v úvodzovkách (úvodzovka sa zdvojí),
     čísla bez úvodzoviek s desatinnou čiarkou a bez oddeľovača tisícov,
   - kódovanie ANSI (Windows-1252) — prevod robí sťahovanie, text sa už
     tu zbaví znakov, ktoré v ňom nie sú (`naAnsi`),
   - Belegdatum je TTMM, rok dodá hlavička (Datum vom/bis) — preto celý
     stapel musí ležať v jednom hospodárskom roku,
   - názov súboru má začínať „EXTF_“, inak ho DATEV import neponúkne.

  Účtovanie: Konto je osobný účet (Debitor / Kreditor) alebo pokladňa,
  Gegenkonto výnos či náklad, S/H sa vzťahuje na Konto. Suma je brutto a daň
  si DATEV rozpočíta sám — buď cez automatický účet (Automatikkonto, napr.
  SKR03 8400 = výnosy 19 % USt), alebo cez BU-Schlüssel pri bežnom účte
  (9 = 19 % Vorsteuer). Pri prenesení daňovej povinnosti a nadobudnutí z EÚ
  ide netto suma na automatický účet, ktorý zaúčtuje daň aj odpočet naraz.

  Čo sa nedá vyčítať z dokladov alebo si tým nie sme istí, je okomentované
  pri mapovaní účtov a dá sa prepísať v nastaveniach exportu.
*/

import { naAnsi } from "./cp1252";
import { domacaMena, domacejZaJednotku } from "./kurzy";
import { jeEuIcDph, rozdelIcDph } from "./vies";
import type { DokladUctovania, KodUctovania, RiadokUctovania } from "./zauctovanie-export";

export type OsnovaDatev = "SKR03" | "SKR04";

/** Účty, ktoré export používa. Kľúč sa dá prepísať v nastaveniach (`ucty.<kľúč>`). */
export type KlucUctu =
  | "debitor"
  | "kreditor"
  | "vynos19"
  | "vynos7"
  | "vynos0"
  | "vynosKleinunternehmer"
  | "vynosEuTovar"
  | "vynosEuSluzba"
  | "vynosTrojstranny"
  | "vynosVyvoz"
  | "vynosTretiaKrajinaSluzba"
  | "vynos13b"
  | "vynosOss"
  | "zaloha19"
  | "zaloha7"
  | "naklady"
  | "nadobudnutie19"
  | "nadobudnutie7"
  | "rcTuzemsko19"
  | "rcTuzemsko7"
  | "rcEu19"
  | "rcEu7"
  | "rcTretia19"
  | "rcTretia7"
  | "pokladna"
  | "karta";

type DefUctu = {
  SKR03: string;
  SKR04: string;
  /** Automatikkonto (AM/AV) — daň rozpočíta DATEV, BU-Schlüssel sa nesmie zadať. */
  automatik: boolean;
  /** Popis v nastaveniach exportu. */
  popis: string;
  /** Kde si číslom účtu nie sme istí — treba ho overiť s poradcom. */
  neiste?: string;
};

/*
  Mapovanie účtov SKR03 / SKR04 (stav 2025/2026).

  Zdroj: DATEV Kontenrahmen SKR 03 a SKR 04 (Art.-Nr. 11174 / 11175),
  Automatikkonten označené „AM“ (Umsatzsteuer) a „AV“ (Vorsteuer).
  Osobné účty: pri dĺžke Sachkonten 4 sú Debitoren 10000–69999 a Kreditoren
  70000–99999 — zberný Debitor 10000 a Kreditor 70000 („Diverse“).

  Účty označené `neiste` sú z pamäti, nie z aktuálneho vydania osnovy —
  pred prvým ostrým importom ich treba porovnať s osnovou mandanta.
*/
export const UCTY_DATEV: Record<KlucUctu, DefUctu> = {
  debitor: {
    SKR03: "10000",
    SKR04: "10000",
    automatik: false,
    popis: "Zberný Debitor (odberatelia)",
  },
  kreditor: {
    SKR03: "70000",
    SKR04: "70000",
    automatik: false,
    popis: "Zberný Kreditor (dodávatelia)",
  },
  vynos19: {
    SKR03: "8400",
    SKR04: "4400",
    automatik: true,
    popis: "Erlöse 19 % USt",
  },
  vynos7: {
    SKR03: "8300",
    SKR04: "4300",
    automatik: true,
    popis: "Erlöse 7 % USt",
  },
  vynos0: {
    SKR03: "8100",
    SKR04: "4100",
    automatik: true,
    popis: "Steuerfreie Umsätze § 4 Nr. 8 ff. UStG",
    neiste: "Nulová sadzba bez prenesenia môže byť aj iné oslobodenie — overiť.",
  },
  vynosKleinunternehmer: {
    SKR03: "8195",
    SKR04: "4185",
    automatik: true,
    popis: "Erlöse als Kleinunternehmer (§ 19 UStG)",
    neiste: "8195 / 4185 — overiť v osnove mandanta.",
  },
  vynosEuTovar: {
    SKR03: "8125",
    SKR04: "4125",
    automatik: true,
    popis: "Steuerfreie innergemeinschaftliche Lieferungen § 4 Nr. 1b UStG (UStVA KZ 41)",
  },
  vynosEuSluzba: {
    SKR03: "8336",
    SKR04: "4336",
    automatik: true,
    popis:
      "Erlöse aus im anderen EU-Land steuerpflichtigen sonstigen Leistungen, § 13b (UStVA KZ 21)",
  },
  vynosTrojstranny: {
    SKR03: "8130",
    SKR04: "4130",
    automatik: true,
    popis: "Lieferungen des ersten Abnehmers bei ig. Dreiecksgeschäften § 25b (UStVA KZ 42)",
  },
  vynosVyvoz: {
    SKR03: "8120",
    SKR04: "4120",
    automatik: true,
    popis: "Steuerfreie Umsätze § 4 Nr. 1a UStG — Ausfuhr Drittland (UStVA KZ 43)",
  },
  vynosTretiaKrajinaSluzba: {
    SKR03: "8338",
    SKR04: "4338",
    automatik: true,
    popis:
      "Erlöse aus im Drittland steuerbaren Leistungen, im Inland nicht steuerbar (UStVA KZ 45)",
  },
  vynos13b: {
    SKR03: "8337",
    SKR04: "4337",
    automatik: true,
    popis:
      "Erlöse aus Leistungen, für die der Leistungsempfänger die Steuer schuldet (UStVA KZ 60)",
  },
  vynosOss: {
    SKR03: "8320",
    SKR04: "4320",
    automatik: true,
    popis: "Erlöse aus im anderen EU-Land steuerpflichtigen Lieferungen (OSS)",
    neiste: "OSS má v osnove viac účtov podľa štátu a sadzby — 8320/4320 je všeobecný, overiť.",
  },
  zaloha19: {
    SKR03: "1718",
    SKR04: "3272",
    automatik: true,
    popis: "Erhaltene, versteuerte Anzahlungen 19 % USt",
  },
  zaloha7: {
    SKR03: "1711",
    SKR04: "3260",
    automatik: true,
    popis: "Erhaltene, versteuerte Anzahlungen 7 % USt",
    neiste: "1711 / 3260 — overiť.",
  },
  naklady: {
    SKR03: "4980",
    SKR04: "6850",
    automatik: false,
    popis: "Náklady, keď predkontácia nemá účet (Sonstiger Betriebsbedarf) — s BU-Schlüssel",
  },
  nadobudnutie19: {
    SKR03: "3425",
    SKR04: "5425",
    automatik: true,
    popis: "Innergemeinschaftlicher Erwerb 19 % VSt und 19 % USt (UStVA KZ 89 / 61)",
  },
  nadobudnutie7: {
    SKR03: "3420",
    SKR04: "5420",
    automatik: true,
    popis: "Innergemeinschaftlicher Erwerb 7 % VSt und 7 % USt (UStVA KZ 93 / 61)",
  },
  rcTuzemsko19: {
    SKR03: "3120",
    SKR04: "5920",
    automatik: true,
    popis:
      "Leistungen eines im Inland ansässigen Unternehmers § 13b, 19 % VSt/USt (UStVA KZ 84/85, 67)",
    neiste: "3120 / 5920 sú „Bauleistungen“; iné § 13b plnenia majú vlastné účty — overiť.",
  },
  rcTuzemsko7: {
    SKR03: "3110",
    SKR04: "5910",
    automatik: true,
    popis: "Leistungen eines im Inland ansässigen Unternehmers § 13b, 7 % VSt/USt",
    neiste: "3110 / 5910 — overiť.",
  },
  rcEu19: {
    SKR03: "3123",
    SKR04: "5923",
    automatik: true,
    popis:
      "Sonstige Leistungen eines im anderen EU-Land ansässigen Unternehmers 19 % (UStVA KZ 46/47, 67)",
  },
  rcEu7: {
    SKR03: "3113",
    SKR04: "5913",
    automatik: true,
    popis: "Sonstige Leistungen eines im anderen EU-Land ansässigen Unternehmers 7 %",
    neiste: "3113 / 5913 — overiť.",
  },
  rcTretia19: {
    SKR03: "3125",
    SKR04: "5925",
    automatik: true,
    popis: "Leistungen eines im Ausland ansässigen Unternehmers 19 % (UStVA KZ 84/85, 67)",
  },
  rcTretia7: {
    SKR03: "3115",
    SKR04: "5915",
    automatik: true,
    popis: "Leistungen eines im Ausland ansässigen Unternehmers 7 %",
    neiste: "3115 / 5915 — overiť.",
  },
  pokladna: {
    SKR03: "1000",
    SKR04: "1600",
    automatik: false,
    popis: "Kasse — bločky platené v hotovosti",
  },
  karta: {
    SKR03: "1360",
    SKR04: "1460",
    automatik: false,
    popis: "Geldtransit — bločky platené kartou",
  },
};

/*
  Ďalšie automatické účty, na ktoré sa BU-Schlüssel nesmie dať (DATEV by
  zápis odmietol ako „Automatikkonto mit Steuerschlüssel“). Používajú ich
  predkontácie: Wareneingang 19 % / 7 % Vorsteuer.
*/
const DALSIE_AUTOMATICKE: Record<OsnovaDatev, string[]> = {
  SKR03: ["3400", "3300"],
  SKR04: ["5400", "5300"],
};

/*
  BU-Schlüssel (Steuerschlüssel) pri bežnom, neautomatickom účte.

  Isté (dlhodobo platné jednomiestne kľúče DATEV):
    2 = Umsatzsteuer 7 %, 3 = Umsatzsteuer 19 %,
    8 = Vorsteuer 7 %,    9 = Vorsteuer 19 %.
  Neisté (dvojmiestne kľúče pre prenesenie a EÚ — DATEV ich medzi rokmi
  menil a od roku 2025 zavádza aj štvormiestne): 19 / 18 ig. Erwerb 19 / 7 %,
  94 / 91 § 13b 19 / 7 %, 46 sonstige Leistung z EÚ 19 %. Export ich použije
  len vtedy, keď si firma na tieto prípady nastaví vlastný, neautomatický
  účet — predvolené účty sú automatické a kľúč nepotrebujú. Každý sa dá
  prepísať v nastaveniach (`bu.<kľúč>`).
*/
export const BU_DATEV: Record<string, string> = {
  vystup19: "3",
  vystup7: "2",
  vstup19: "9",
  vstup7: "8",
  nadobudnutie19: "19",
  nadobudnutie7: "18",
  rcTuzemsko19: "94",
  rcTuzemsko7: "91",
  rcEu19: "46",
  rcEu7: "91",
  rcTretia19: "94",
  rcTretia7: "91",
};

/** Nastavenia exportu (`companies.uctovanie_nastavenia.datev`) — z formulára prídu ako text. */
export type NastaveniaDatev = {
  beraternummer?: string | number | null;
  mandantennummer?: string | number | null;
  /** „SKR03“ / „SKR04“ (alebo „03“ / „04“). */
  osnova?: string | null;
  /** Dĺžka Sachkonten 4–8; osobné účty majú o jednu číslicu viac. */
  dlzkaUctov?: string | number | null;
  /** Mesiac začiatku hospodárskeho roka (1–12). */
  zaciatokRoka?: string | number | null;
  /** „zberne“ (predvolené) alebo „osobne“. */
  osobneUcty?: string | null;
  diktat?: string | null;
  ucty?: Partial<Record<KlucUctu, string>>;
  bu?: Partial<Record<string, string>>;
  /** Ďalšie automatické účty mandanta oddelené čiarkou. */
  automatickeUcty?: string | null;
};

export type FirmaDatev = {
  name?: string | null;
  country?: string | null;
  vat_scheme?: string | null;
};

/* ─── Formátovanie ──────────────────────────────────────────────────────── */

/** Text do poľa: Windows-1252, bez zalomení, v úvodzovkách, skrátený. */
export function textDatev(v: unknown, max = 0): string {
  let s = naAnsi(String(v ?? ""))
    .replace(/[\r\n\t;]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  if (max) s = s.slice(0, max);
  return `"${s.replace(/"/g, '""')}"`;
}

/** Suma s desatinnou čiarkou, bez oddeľovača tisícov: 1234.5 → „1234,50“. */
export function cisloDatev(n: number, desatinne = 2): string {
  const x = Number(n);
  return (Number.isFinite(x) ? x : 0).toFixed(desatinne).replace(".", ",");
}

/** Belegdatum: ISO dátum → TTMM (rok je v hlavičke). */
export function belegdatum(iso: string): string {
  const [, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}${m}`;
}

/** TTMMJJJJ — Leistungsdatum, Fälligkeit. */
function datumTtmmjjjj(iso: string | null | undefined): string {
  const s = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  return `${s.slice(8, 10)}${s.slice(5, 7)}${s.slice(0, 4)}`;
}

/** TTMMJJ — splatnosť v Belegfeld 2 (konvencia DATEV pre saldokonto OPOS). */
function datumTtmmjj(iso: string | null | undefined): string {
  const s = datumTtmmjjjj(iso);
  return s ? `${s.slice(0, 4)}${s.slice(6, 8)}` : "";
}

/** YYYYMMDD — dátumy v hlavičke. */
const datumHlavicky = (iso: string) => String(iso).slice(0, 10).replace(/-/g, "");

/**
 * Belegfeld 1 je kľúč na párovanie úhrad (OPOS) — DATEV v ňom pripúšťa len
 * písmená A–Z, číslice a znaky $ & % * + - /, najviac 36 znakov.
 */
export function belegfeld1(cislo: string): string {
  return naAnsi(String(cislo ?? ""))
    .normalize("NFD")
    .replace(/[^A-Za-z0-9$&%*+\-/]/g, "")
    .slice(0, 36);
}

/* ─── Stĺpce ────────────────────────────────────────────────────────────── */

/** Názvy 125 stĺpcov Buchungsstapel vo formátovej verzii 13 (poradie je záväzné). */
export const STLPCE_DATEV: string[] = [
  "Umsatz (ohne Soll/Haben-Kz)",
  "Soll/Haben-Kennzeichen",
  "WKZ Umsatz",
  "Kurs",
  "Basis-Umsatz",
  "WKZ Basis-Umsatz",
  "Konto",
  "Gegenkonto (ohne BU-Schlüssel)",
  "BU-Schlüssel",
  "Belegdatum",
  "Belegfeld 1",
  "Belegfeld 2",
  "Skonto",
  "Buchungstext",
  "Postensperre",
  "Diverse Adressnummer",
  "Geschäftspartnerbank",
  "Sachverhalt",
  "Zinssperre",
  "Beleglink",
  ...Array.from({ length: 8 }, (_, i) => [
    `Beleginfo - Art ${i + 1}`,
    `Beleginfo - Inhalt ${i + 1}`,
  ]).flat(),
  "KOST1 - Kostenstelle",
  "KOST2 - Kostenstelle",
  "Kost-Menge",
  "EU-Mitgliedstaat u. UStID (Bestimmung)",
  "EU-Steuersatz (Bestimmung)",
  "Abw. Versteuerungsart",
  "Sachverhalt L+L",
  "Funktionsergänzung L+L",
  "BU 49 Hauptfunktionstyp",
  "BU 49 Hauptfunktionsnummer",
  "BU 49 Funktionsergänzung",
  ...Array.from({ length: 20 }, (_, i) => [
    `Zusatzinformation - Art ${i + 1}`,
    `Zusatzinformation - Inhalt ${i + 1}`,
  ]).flat(),
  "Stück",
  "Gewicht",
  "Zahlweise",
  "Forderungsart",
  "Veranlagungsjahr",
  "Zugeordnete Fälligkeit",
  "Skontotyp",
  "Auftragsnummer",
  "Buchungstyp",
  "USt-Schlüssel (Anzahlungen)",
  "EU-Mitgliedstaat (Anzahlungen)",
  "Sachverhalt L+L (Anzahlungen)",
  "EU-Steuersatz (Anzahlungen)",
  "Erlöskonto (Anzahlungen)",
  "Herkunft-Kz",
  "Buchungs GUID",
  "KOST-Datum",
  "SEPA-Mandatsreferenz",
  "Skontosperre",
  "Gesellschaftername",
  "Beteiligtennummer",
  "Identifikationsnummer",
  "Zeichnernummer",
  "Postensperre bis",
  "Bezeichnung SoBil-Sachverhalt",
  "Kennzeichen SoBil-Buchung",
  "Festschreibung",
  "Leistungsdatum",
  "Datum Zuord. Steuerperiode",
  "Fälligkeit",
  "Generalumkehr (GU)",
  "Steuersatz",
  "Land",
  "Abrechnungsreferenz",
  "BVV-Position",
  "EU-Mitgliedstaat u. UStID (Ursprung)",
  "EU-Steuersatz (Ursprung)",
  "Abw. Skontokonto",
];

const STLPEC = Object.fromEntries(STLPCE_DATEV.map((n, i) => [n, i])) as Record<string, number>;

/** Jeden zápis Buchungsstapel. */
export type ZapisDatev = {
  umsatz: number;
  sh: "S" | "H";
  wkz: string;
  /** Kurs „koľko cudzej meny za 1 jednotku domácej“; len pri cudzej mene. */
  kurs: number | null;
  basisUmsatz: number | null;
  wkzBasis: string | null;
  konto: string;
  gegenkonto: string;
  bu: string;
  belegdatum: string;
  belegfeld1: string;
  belegfeld2: string;
  buchungstext: string;
  kost1: string | null;
  kost2: string | null;
  euUstId: string | null;
  leistungsdatum: string | null;
  faelligkeit: string | null;
};

function riadokZapisu(z: ZapisDatev): string {
  const p: string[] = new Array(STLPCE_DATEV.length).fill("");
  const daj = (stlpec: string, v: string) => {
    p[STLPEC[stlpec]!] = v;
  };
  daj("Umsatz (ohne Soll/Haben-Kz)", cisloDatev(z.umsatz));
  daj("Soll/Haben-Kennzeichen", textDatev(z.sh));
  daj("WKZ Umsatz", textDatev(z.wkz));
  if (z.kurs) daj("Kurs", cisloDatev(z.kurs, 6));
  if (z.basisUmsatz != null) daj("Basis-Umsatz", cisloDatev(z.basisUmsatz));
  if (z.wkzBasis) daj("WKZ Basis-Umsatz", textDatev(z.wkzBasis));
  daj("Konto", z.konto);
  daj("Gegenkonto (ohne BU-Schlüssel)", z.gegenkonto);
  if (z.bu) daj("BU-Schlüssel", textDatev(z.bu));
  daj("Belegdatum", belegdatum(z.belegdatum));
  daj("Belegfeld 1", textDatev(z.belegfeld1));
  if (z.belegfeld2) daj("Belegfeld 2", textDatev(z.belegfeld2));
  daj("Buchungstext", textDatev(z.buchungstext, 60));
  if (z.kost1) daj("KOST1 - Kostenstelle", textDatev(z.kost1, 36));
  if (z.kost2) daj("KOST2 - Kostenstelle", textDatev(z.kost2, 36));
  if (z.euUstId) daj("EU-Mitgliedstaat u. UStID (Bestimmung)", textDatev(z.euUstId, 15));
  if (z.leistungsdatum) daj("Leistungsdatum", datumTtmmjjjj(z.leistungsdatum));
  if (z.faelligkeit) daj("Fälligkeit", datumTtmmjjjj(z.faelligkeit));
  return p.join(";");
}

/* ─── Účty ──────────────────────────────────────────────────────────────── */

export function osnovaZNastaveni(n: NastaveniaDatev): OsnovaDatev {
  return /04/.test(String(n.osnova ?? "")) ? "SKR04" : "SKR03";
}

function dlzkaUctov(n: NastaveniaDatev): number {
  const d = Math.trunc(Number(n.dlzkaUctov));
  return d >= 4 && d <= 8 ? d : 4;
}

/**
 * Sachkonto doplnené na dĺžku mandanta — DATEV pri dlhších účtoch pridáva
 * nuly vpravo (8400 → 84000 pri dĺžke 5). Osobné účty majú o číslicu viac.
 */
function naDlzku(ucet: string, dlzka: number, osobny: boolean): string {
  const s = String(ucet).replace(/\D/g, "");
  const ciel = osobny ? dlzka + 1 : dlzka;
  return s.length >= ciel ? s : s.padEnd(ciel, "0");
}

/** Číslo účtu z predkontácie, ak je to účet DATEV (4–9 číslic). */
function ucetZPredkontacie(v: string | null | undefined): string | null {
  const s = String(v ?? "").replace(/\s/g, "");
  return /^\d{4,9}$/.test(s) ? s : null;
}

/** FNV-1a — stabilné číslo z textu, aby partner dostal pri každom exporte ten istý účet. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Sadzba riadku. Prijatá faktúra bez položiek má sadzbu odhadnutú zo súm
 * podľa slovenských sadzieb (7 % by z nej vyšlo ako 5 %) — keď podiel dane
 * a základu sedí na nemeckých 19 / 7 %, platí ten.
 */
function sadzbaZRiadku(r: RiadokUctovania): number {
  const s = Number(r.sadzba) || 0;
  if (s === 19 || s === 7 || !r.zaklad || !r.dph) return s;
  const podiel = (r.dph / r.zaklad) * 100;
  if (Math.abs(podiel - 19) < 0.6) return 19;
  if (Math.abs(podiel - 7) < 0.6) return 7;
  return s;
}

/* ─── Zostavenie ────────────────────────────────────────────────────────── */

export type VysledokDatev = {
  obsah: string;
  /** Doklady, ktoré do súboru nešli — „číslo — dôvod“. */
  preskocene: string[];
  /** Doklad v súbore je, ale niečo treba skontrolovať. */
  upozornenia: string[];
  datumOd: string | null;
  datumDo: string | null;
};

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const AGENDA_NAZOV: Record<DokladUctovania["agenda"], string> = {
  vystavena: "Ausgangsrechnungen",
  prijata: "Eingangsrechnungen",
  doklad: "Belege",
};

export function buildDatevBuchungsstapel(opts: {
  firma: FirmaDatev;
  doklady: DokladUctovania[];
  kody?: Record<string, KodUctovania>;
  nastavenia: NastaveniaDatev;
  /** Čas vytvorenia do hlavičky — v testoch pevný. */
  teraz?: Date;
}): VysledokDatev {
  const n = opts.nastavenia ?? {};
  const berater = Math.trunc(Number(n.beraternummer));
  const mandant = Math.trunc(Number(n.mandantennummer));
  if (!(berater >= 1001 && berater <= 9999999))
    throw new Error(
      "DATEV: doplňte Beraternummer (1001–9999999) v nastaveniach exportu — dá vám ho daňový poradca.",
    );
  if (!(mandant >= 1 && mandant <= 99999))
    throw new Error("DATEV: doplňte Mandantennummer (1–99999) v nastaveniach exportu.");

  const osnova = osnovaZNastaveni(n);
  const dlzka = dlzkaUctov(n);
  const kody = opts.kody ?? {};
  const kleinunternehmer = String(opts.firma?.vat_scheme ?? "") === "de_kleinunternehmer";
  const domaca = domacaMena(opts.firma?.country);
  const automaticke = new Set<string>([
    ...Object.values(UCTY_DATEV)
      .filter((u) => u.automatik)
      .map((u) => u[osnova]),
    ...DALSIE_AUTOMATICKE[osnova],
    ...String(n.automatickeUcty ?? "")
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean),
  ]);
  const ucet = (k: KlucUctu): string => {
    const vlastny = ucetZPredkontacie(n.ucty?.[k]);
    const osobny = k === "debitor" || k === "kreditor";
    return naDlzku(vlastny ?? UCTY_DATEV[k][osnova], dlzka, osobny);
  };
  const jeAutomaticky = (u: string) =>
    automaticke.has(u) || automaticke.has(u.replace(/0+$/, "").padEnd(4, "0"));
  const bu = (k: string): string => String(n.bu?.[k] ?? BU_DATEV[k] ?? "").trim();
  /** BU-Schlüssel k účtu: automatický ho nesmie mať, bežný ho potrebuje. */
  const buKUctu = (u: string, k: string) => (jeAutomaticky(u) ? "" : bu(k));

  /* Osobné účty: zberné, alebo odvodené z IČ DPH / IČO / názvu partnera. */
  const osobne = String(n.osobneUcty ?? "") === "osobne";
  const obsadene = new Map<string, string>();
  const osobnyUcet = (d: DokladUctovania, typ: "debitor" | "kreditor"): string => {
    if (!osobne) return ucet(typ);
    const kluc = (d.partner.icDph || d.partner.ico || d.partner.nazov || "")
      .toUpperCase()
      .replace(/\s+/g, "");
    if (!kluc) return ucet(typ);
    const zaklad = 10 ** dlzka; // 10000 pri dĺžke 4
    const [od, rozsah] = typ === "debitor" ? [zaklad, 6 * zaklad] : [7 * zaklad, 3 * zaklad];
    let cislo = od + 1 + (hash(kluc) % (rozsah - 1));
    // Kolízia v rámci súboru: ďalšie voľné číslo.
    while (obsadene.has(String(cislo)) && obsadene.get(String(cislo)) !== kluc)
      cislo = od + 1 + ((cislo - od) % (rozsah - 1));
    obsadene.set(String(cislo), kluc);
    return String(cislo);
  };

  const preskocene: string[] = [];
  const upozornenia: string[] = [];
  const zapisy: ZapisDatev[] = [];

  for (const d of opts.doklady) {
    const cislo = d.cislo || d.partner.nazov || "doklad";
    if (d.druh === "zaloha" && !d.dokladKPlatbe) {
      preskocene.push(
        `${cislo} — zálohová faktúra nie je daňový doklad (do DATEV ide doklad k platbe)`,
      );
      continue;
    }
    const datum = d.datumZauctovania ?? d.datumVystavenia ?? d.datumDodania;
    if (!datum) {
      preskocene.push(`${cislo} — chýba dátum dokladu`);
      continue;
    }

    /* Cudzia mena: Umsatz v mene dokladu, Basis-Umsatz v domácej. */
    const cudzia = Boolean(d.mena && d.mena !== domaca);
    const zaJednu = cudzia ? domacejZaJednotku(d.kurz, opts.firma?.country) : 1;
    if (cudzia && !(zaJednu > 0)) {
      preskocene.push(`${cislo} — doklad je v mene ${d.mena} a chýba mu kurz`);
      continue;
    }

    /* Konto a smer: S/H sa vzťahuje na Konto. */
    let konto: string;
    let sh: "S" | "H";
    if (d.agenda === "vystavena") {
      konto = osobnyUcet(d, "debitor");
      sh = d.druh === "dobropis" ? "H" : "S";
    } else if (d.agenda === "doklad" && d.forma === "pokladna") {
      konto = ucet("pokladna");
      sh = "H";
    } else if (d.agenda === "doklad" && d.forma === "interny") {
      konto = ucet("karta");
      sh = "H";
    } else {
      konto = osobnyUcet(d, "kreditor");
      sh = d.druh === "dobropis" ? "S" : "H";
    }

    const ic = rozdelIcDph(d.partner.icDph);
    const statPartnera =
      (ic?.kod ??
        String(d.partner.stat ?? "")
          .toUpperCase()
          .slice(0, 2)) ||
      "DE";
    const euPartner = Boolean(ic && jeEuIcDph(d.partner.icDph) && ic.kod !== "DE");

    const riadky: RiadokUctovania[] = d.riadky.length
      ? d.riadky
      : [
          {
            sadzba: 0,
            zaklad: d.celkom,
            dph: 0,
            predkontacia: d.predkontacia,
            clenenie: d.clenenie,
            kv: d.kv,
            odpocet: true,
            text: null,
          },
        ];

    const zapisyDokladu: ZapisDatev[] = [];
    let chyba: string | null = null;
    for (const r of riadky) {
      const sadzba = sadzbaZRiadku(r);
      const kod = r.predkontacia ? kody[r.predkontacia] : undefined;
      let gegenkonto: string;
      let buKluc = "";
      /** Netto: daň dopočíta automatický účet (prenesenie, nadobudnutie). */
      let netto = false;

      if (d.agenda === "vystavena") {
        const vlastny = ucetZPredkontacie(kod?.ucetD);
        const zalohovyRiadok = d.dokladKPlatbe || (d.odpocetVRiadkoch && r.zaklad < 0);
        if (kleinunternehmer) gegenkonto = ucet("vynosKleinunternehmer");
        else if (zalohovyRiadok) gegenkonto = ucet(sadzba === 7 ? "zaloha7" : "zaloha19");
        else if (d.oss) gegenkonto = ucet("vynosOss");
        else if (d.prenesenieDph) {
          netto = true;
          const sluzba = d.euPlnenie === "sluzba";
          if (d.prenosTyp === "eu_b2b")
            gegenkonto = ucet(
              sluzba
                ? "vynosEuSluzba"
                : d.euPlnenie === "trojstranny"
                  ? "vynosTrojstranny"
                  : "vynosEuTovar",
            );
          else if (d.prenosTyp === "export")
            gegenkonto = ucet(sluzba ? "vynosTretiaKrajinaSluzba" : "vynosVyvoz");
          else gegenkonto = ucet("vynos13b");
        } else if (sadzba === 19 || sadzba === 7) {
          const k = sadzba === 19 ? "vynos19" : "vynos7";
          gegenkonto = vlastny ? naDlzku(vlastny, dlzka, false) : ucet(k);
          buKluc = buKUctu(gegenkonto, sadzba === 19 ? "vystup19" : "vystup7");
        } else if (sadzba === 0) {
          gegenkonto = ucet("vynos0");
          if (euPartner)
            upozornenia.push(
              `${cislo} — nulová sadzba s IČ DPH z EÚ bez prenesenia; ak ide o dodanie do EÚ, označte ho na faktúre`,
            );
        } else {
          const vlastnyNaSadzbu = ucetZPredkontacie(n.ucty?.[`vynos${sadzba}` as KlucUctu]);
          if (!vlastnyNaSadzbu) {
            chyba = `sadzba ${sadzba} % nemá v DATEV účet — doplňte ho v nastaveniach (ucty.vynos${sadzba})`;
            break;
          }
          gegenkonto = naDlzku(vlastnyNaSadzbu, dlzka, false);
        }
      } else {
        // Prijatá faktúra a bloček.
        const vlastny = ucetZPredkontacie(kod?.ucetMd);
        const naklad = vlastny ? naDlzku(vlastny, dlzka, false) : ucet("naklady");
        const sz = sadzba === 7 ? 7 : 19;
        if (kleinunternehmer || !r.odpocet) {
          // Bez odpočtu ide celá suma do nákladu, daň sa nerozpočítava.
          gegenkonto = naklad;
        } else if (d.agenda === "prijata" && d.dphRezim === "nadobudnutie") {
          netto = true;
          const k: KlucUctu = sz === 7 ? "nadobudnutie7" : "nadobudnutie19";
          gegenkonto = ucet(k);
          buKluc = buKUctu(gegenkonto, k);
        } else if (d.agenda === "prijata" && d.prenesenieDph) {
          netto = true;
          const druh = statPartnera === "DE" ? "rcTuzemsko" : euPartner ? "rcEu" : "rcTretia";
          const k = `${druh}${sz}` as KlucUctu;
          gegenkonto = ucet(k);
          buKluc = buKUctu(gegenkonto, k);
        } else if (d.agenda === "prijata" && d.dphRezim === "dovoz") {
          gegenkonto = naklad;
          upozornenia.push(
            `${cislo} — dovoz: dovoznú DPH (Einfuhrumsatzsteuer) zaúčtujte podľa colného výmeru zvlášť`,
          );
        } else if (sadzba === 19 || sadzba === 7) {
          gegenkonto = naklad;
          buKluc = buKUctu(naklad, sadzba === 19 ? "vstup19" : "vstup7");
        } else {
          gegenkonto = naklad;
          if (sadzba > 0)
            upozornenia.push(
              `${cislo} — sadzba ${sadzba} % nie je nemecká; zahraničná DPH sa v Nemecku neodpočítava, ide do nákladu celá`,
            );
        }
      }

      const suma = r2(netto ? r.zaklad : r.zaklad + r.dph);
      if (!suma) continue;
      const smer: "S" | "H" = suma < 0 ? (sh === "S" ? "H" : "S") : sh;
      const umsatz = Math.abs(suma);
      zapisyDokladu.push({
        umsatz,
        sh: smer,
        wkz: cudzia ? d.mena : domaca,
        kurs: cudzia ? Math.round((1 / zaJednu) * 1e6) / 1e6 : null,
        basisUmsatz: cudzia ? r2(umsatz * zaJednu) : null,
        wkzBasis: cudzia ? domaca : null,
        konto,
        gegenkonto,
        bu: buKluc,
        belegdatum: datum,
        belegfeld1: belegfeld1(d.cislo),
        belegfeld2: d.agenda === "doklad" ? "" : datumTtmmjj(d.datumSplatnosti),
        buchungstext:
          (d.druh === "dobropis" ? "Gutschrift " : "") +
          (r.text && d.odpocetVRiadkoch && r.zaklad < 0 ? r.text : d.partner.nazov || d.text),
        kost1: d.stredisko,
        kost2: d.zakazka,
        euUstId:
          d.agenda === "vystavena" && d.prenesenieDph && d.prenosTyp === "eu_b2b" && ic
            ? `${ic.kod}${ic.cislo}`
            : null,
        leistungsdatum: d.datumDodania,
        faelligkeit: d.agenda === "doklad" ? null : d.datumSplatnosti,
      });
    }
    if (chyba) {
      preskocene.push(`${cislo} — ${chyba}`);
      continue;
    }
    if (Math.abs(d.zaokruhlenie) >= 0.01)
      upozornenia.push(
        `${cislo} — zaokrúhlenie ${cisloDatev(d.zaokruhlenie)} nie je v zápisoch; zaúčtujte ho ručne`,
      );
    zapisy.push(...zapisyDokladu);
  }

  /*
    Hospodársky rok: Belegdatum nesie len deň a mesiac, rok je v hlavičke —
    stapel preto nesmie prekročiť hranicu hospodárskeho roka.
  */
  const mesiacWj = Math.trunc(Number(n.zaciatokRoka));
  const wjMesiac = mesiacWj >= 1 && mesiacWj <= 12 ? mesiacWj : 1;
  const zaciatokWj = (iso: string) => {
    const r = Number(iso.slice(0, 4));
    const m = Number(iso.slice(5, 7));
    const rok = m >= wjMesiac ? r : r - 1;
    return `${rok}-${String(wjMesiac).padStart(2, "0")}-01`;
  };
  const datumy = zapisy.map((z) => z.belegdatum.slice(0, 10)).sort();
  const datumOd = datumy[0] ?? null;
  const datumDo = datumy[datumy.length - 1] ?? null;
  if (datumOd && datumDo && zaciatokWj(datumOd) !== zaciatokWj(datumDo))
    throw new Error(
      `DATEV: doklady sú z dvoch hospodárskych rokov (${datumOd} – ${datumDo}). Vyberte obdobie v rámci jedného roka.`,
    );

  const teraz = opts.teraz ?? new Date();
  const p2 = (x: number, d = 2) => String(x).padStart(d, "0");
  const vytvorene = `${teraz.getUTCFullYear()}${p2(teraz.getUTCMonth() + 1)}${p2(teraz.getUTCDate())}${p2(teraz.getUTCHours())}${p2(teraz.getUTCMinutes())}${p2(teraz.getUTCSeconds())}${p2(teraz.getUTCMilliseconds(), 3)}`;
  const dnes = teraz.toISOString().slice(0, 10);
  const agendy = [...new Set(opts.doklady.map((d) => AGENDA_NAZOV[d.agenda]))].join(", ");
  const diktat = naAnsi(String(n.diktat ?? ""))
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase();

  /* Hlavička EXTF — 31 polí podľa DATEV-Format, Header-Version 700. */
  const hlavicka = [
    textDatev("EXTF"), // 1 Kennzeichen
    "700", // 2 Versionsnummer
    "21", // 3 Formatkategorie (Buchungsstapel)
    textDatev("Buchungsstapel"), // 4 Formatname
    "13", // 5 Formatversion
    vytvorene, // 6 Erzeugt am (JJJJMMTTHHMMSSFFF)
    "", // 7 Importiert
    textDatev("RE"), // 8 Herkunft
    textDatev("Faktero"), // 9 Exportiert von
    textDatev(""), // 10 Importiert von
    String(berater), // 11 Beraternummer
    String(mandant), // 12 Mandantennummer
    datumHlavicky(zaciatokWj(datumOd ?? dnes)), // 13 WJ-Beginn
    String(dlzka), // 14 Sachkontenlänge
    datumHlavicky(datumOd ?? dnes), // 15 Datum vom
    datumHlavicky(datumDo ?? dnes), // 16 Datum bis
    textDatev(`Faktero ${agendy}`, 30), // 17 Bezeichnung
    textDatev(diktat), // 18 Diktatkürzel
    "1", // 19 Buchungstyp (1 = Finanzbuchführung)
    "0", // 20 Rechnungslegungszweck (0 = unabhängig)
    "0", // 21 Festschreibung (0 = keine)
    textDatev(domaca), // 22 WKZ
    "", // 23 reserviert
    textDatev(""), // 24 Derivatskennzeichen
    "", // 25 reserviert
    "", // 26 reserviert
    textDatev(osnova === "SKR04" ? "04" : "03"), // 27 Sachkontenrahmen
    "", // 28 ID der Branchenlösung
    "", // 29 reserviert
    textDatev(""), // 30 reserviert
    textDatev(""), // 31 Anwendungsinformation
  ].join(";");

  const obsah =
    [hlavicka, STLPCE_DATEV.join(";"), ...zapisy.map(riadokZapisu)].join("\r\n") + "\r\n";
  return { obsah, preskocene, upozornenia, datumOd, datumDo };
}
