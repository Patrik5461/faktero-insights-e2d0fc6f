import { krajinaDane, sadzbyKrajiny, zoradPodlaSadzby } from "./vat-rates";
import { jeKrajinaEu } from "./rezim-odberatela";
import { rozdelIcDph } from "./vies";
import { rezimFirmy } from "./dph-rezim";
import { resolveVatClassification, type KontextClenenia } from "./clenenie-vystavenej";
import { resolveVatClassificationPrijatej, type KontextPrijatych } from "./clenenie-prijatych";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import { platnyDruhPdp } from "./veta-prenesenia";
/*
  Konvertor tabuľky (XLSX/CSV) na dávku XML Pohody.

  Účtovníčka dostane od klienta doklady v Exceli, nie vo Fakteri. Vyplní ich
  do predpripravenej šablóny (vydané faktúry, prijaté faktúry alebo bločky),
  Faktero z riadkov poskladá doklady v pamäti a prevedie ich tým istým
  exportom, ktorým idú do Pohody doklady z Faktera. **Nič sa neukladá** —
  výsledok je len súbor na stiahnutie.

  Čisté funkcie: šablóna (hlavičky a vzorový riadok) a prevod riadkov na
  doklady v tvare, ktorý čítajú `polozkyFaktur` a `polozkyDokladov`.
*/

export type DruhKonvertora = "vydane" | "prijate" | "blocky";

export const DRUHY_KONVERTORA: { kod: DruhKonvertora; nazov: string }[] = [
  { kod: "vydane", nazov: "Vydané faktúry" },
  { kod: "prijate", nazov: "Prijaté faktúry" },
  { kod: "blocky", nazov: "Bločky" },
];

/*
  Režim DPH dokladu (audit 14. 11. 2026, V14). Bez neho šiel odberateľ z EÚ
  ako tuzemské plnenie s 0 % a prijatá faktúra z EÚ ako tuzemská bez
  samozdanenia. Hodnoty sa prevedú na tie isté polia ako pri doklade vo
  Fakteri (`reverse_charge`, `reverse_charge_type`, `eu_plnenie`,
  `dph_rezim`) a členenie z nich určí `resolveVatClassification(Prijatej)`.
*/
const REZIM_VYDANE = "Režim DPH (tuzemsko/prenesenie/EÚ tovar/EÚ služba/trojstranný/vývoz/mimo EÚ služba)";
const REZIM_PRIJATE = "Režim DPH (tuzemsko/prenesenie/nadobudnutie z EÚ/služba zo zahraničia)";

type Stlpec = { kluc: string; nazov: string; povinny?: boolean; vzor: string | number };

/*
  Hlavičky šablóny. Riadky s rovnakým číslom dokladu sú jeden doklad —
  pri vydanej faktúre ďalšia položka, pri prijatej faktúre a bločku ďalšia
  sadzba DPH v rozpise.
*/
export const STLPCE_KONVERTORA: Record<DruhKonvertora, Stlpec[]> = {
  vydane: [
    { kluc: "cislo", nazov: "Číslo faktúry", povinny: true, vzor: "2026001" },
    { kluc: "typ", nazov: "Typ (faktúra/dobropis)", vzor: "faktúra" },
    { kluc: "vystavenie", nazov: "Dátum vystavenia", povinny: true, vzor: "2026-10-01" },
    { kluc: "dodanie", nazov: "Dátum dodania", vzor: "2026-10-01" },
    { kluc: "splatnost", nazov: "Dátum splatnosti", vzor: "2026-10-15" },
    { kluc: "partner", nazov: "Odberateľ", povinny: true, vzor: "Vzorová firma s.r.o." },
    { kluc: "ico", nazov: "IČO", vzor: "12345678" },
    { kluc: "dic", nazov: "DIČ", vzor: "2020123456" },
    { kluc: "icDph", nazov: "IČ DPH", vzor: "SK2020123456" },
    { kluc: "ulica", nazov: "Ulica", vzor: "Hlavná 1" },
    { kluc: "mesto", nazov: "Mesto", vzor: "Bratislava" },
    { kluc: "psc", nazov: "PSČ", vzor: "81101" },
    { kluc: "krajina", nazov: "Krajina", vzor: "SK" },
    { kluc: "email", nazov: "E-mail", vzor: "" },
    { kluc: "vs", nazov: "Variabilný symbol", vzor: "2026001" },
    { kluc: "ks", nazov: "Konštantný symbol", vzor: "" },
    { kluc: "mena", nazov: "Mena", vzor: "EUR" },
    { kluc: "kurz", nazov: "Kurz (pri cudzej mene)", vzor: "" },
    { kluc: "rezim", nazov: REZIM_VYDANE, vzor: "tuzemsko" },
    { kluc: "pdpDruh", nazov: "Druh prenesenia (písmeno § 69 ods. 12, napr. j)", vzor: "" },
    { kluc: "platba", nazov: "Forma úhrady (prevod/hotovosť/karta/dobierka)", vzor: "prevod" },
    { kluc: "text", nazov: "Text nad položkami", vzor: "Fakturujeme vám za služby" },
    { kluc: "poznamka", nazov: "Poznámka", vzor: "" },
    { kluc: "polozka", nazov: "Položka", povinny: true, vzor: "Konzultácie" },
    { kluc: "mnozstvo", nazov: "Množstvo", vzor: 2 },
    { kluc: "mj", nazov: "MJ", vzor: "hod" },
    { kluc: "cena", nazov: "Jednotková cena bez DPH", povinny: true, vzor: 50 },
    { kluc: "sadzba", nazov: "Sadzba DPH %", vzor: 23 },
    { kluc: "predkontacia", nazov: "Predkontácia", vzor: "" },
    { kluc: "clenenie", nazov: "Členenie DPH", vzor: "" },
  ],
  prijate: [
    { kluc: "cislo", nazov: "Číslo faktúry dodávateľa", povinny: true, vzor: "FA-2026-118" },
    { kluc: "vs", nazov: "Variabilný symbol", vzor: "2026118" },
    { kluc: "vystavenie", nazov: "Dátum vystavenia", povinny: true, vzor: "2026-10-02" },
    { kluc: "dodanie", nazov: "Dátum dodania", vzor: "2026-10-02" },
    { kluc: "dorucenie", nazov: "Dátum doručenia", vzor: "2026-10-04" },
    { kluc: "splatnost", nazov: "Dátum splatnosti", vzor: "2026-10-16" },
    { kluc: "partner", nazov: "Dodávateľ", povinny: true, vzor: "Dodávateľ a.s." },
    { kluc: "ico", nazov: "IČO", vzor: "87654321" },
    { kluc: "dic", nazov: "DIČ", vzor: "2021876543" },
    { kluc: "icDph", nazov: "IČ DPH", vzor: "SK2021876543" },
    { kluc: "ulica", nazov: "Ulica", vzor: "Priemyselná 5" },
    { kluc: "mesto", nazov: "Mesto", vzor: "Žilina" },
    { kluc: "psc", nazov: "PSČ", vzor: "01001" },
    { kluc: "krajina", nazov: "Krajina", vzor: "SK" },
    { kluc: "iban", nazov: "IBAN dodávateľa", vzor: "" },
    { kluc: "mena", nazov: "Mena", vzor: "EUR" },
    { kluc: "kurz", nazov: "Kurz (pri cudzej mene)", vzor: "" },
    { kluc: "rezim", nazov: REZIM_PRIJATE, vzor: "tuzemsko" },
    { kluc: "platba", nazov: "Forma úhrady (prevod/hotovosť/karta/dobierka)", vzor: "prevod" },
    { kluc: "text", nazov: "Text", vzor: "Materiál na stavbu" },
    { kluc: "zaklad", nazov: "Základ DPH", povinny: true, vzor: 100 },
    { kluc: "sadzba", nazov: "Sadzba DPH %", vzor: 23 },
    { kluc: "dph", nazov: "DPH", vzor: 23 },
    { kluc: "predkontacia", nazov: "Predkontácia", vzor: "" },
    { kluc: "clenenie", nazov: "Členenie DPH", vzor: "" },
    { kluc: "poznamka", nazov: "Poznámka", vzor: "" },
  ],
  blocky: [
    { kluc: "vystavenie", nazov: "Dátum", povinny: true, vzor: "2026-10-03" },
    { kluc: "partner", nazov: "Obchodník", povinny: true, vzor: "Čerpacia stanica" },
    { kluc: "ico", nazov: "IČO", vzor: "11223344" },
    { kluc: "icDph", nazov: "IČ DPH", vzor: "SK2020112233" },
    { kluc: "cislo", nazov: "Číslo dokladu", vzor: "B-555" },
    { kluc: "platba", nazov: "Spôsob platby (hotovosť/karta/prevod)", vzor: "karta" },
    { kluc: "zaklad", nazov: "Základ DPH", povinny: true, vzor: 40.65 },
    { kluc: "sadzba", nazov: "Sadzba DPH %", vzor: 23 },
    { kluc: "dph", nazov: "DPH", vzor: 9.35 },
    { kluc: "predkontacia", nazov: "Predkontácia", vzor: "" },
    { kluc: "clenenie", nazov: "Členenie DPH", vzor: "" },
    { kluc: "poznamka", nazov: "Poznámka", vzor: "" },
  ],
};

/** Hlavička a vzorový riadok šablóny (pre `aoa_to_sheet`). */
export function sablonaKonvertora(druh: DruhKonvertora): (string | number)[][] {
  const s = STLPCE_KONVERTORA[druh];
  return [s.map((x) => (x.povinny ? `${x.nazov} *` : x.nazov)), s.map((x) => x.vzor)];
}

/** Názov stĺpca bez diakritiky, hviezdičky a veľkosti písmen — na porovnanie hlavičky. */
function normNazov(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Číslo zo šablóny: „1 234,56", „1234.56", 1234.56. Prázdne = `null`. */
export function cisloZBunky(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[\s €%]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes("."))
    s =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Dátum zo šablóny: „2026-10-01", „1.10.2026", sériové číslo Excelu. Zlý = `""`. */
export function datumZBunky(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return platnyDatum(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(s);
  if (m) return platnyDatum(+m[3], +m[2], +m[1]);
  return "";
}

function platnyDatum(r: number, mes: number, d: number): string {
  const x = new Date(Date.UTC(r, mes - 1, d));
  if (x.getUTCFullYear() !== r || x.getUTCMonth() !== mes - 1 || x.getUTCDate() !== d) return "";
  return x.toISOString().slice(0, 10);
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Sadzba „23", „23 %" alebo 0,23 (bunka vo formáte percent). Prázdna bunka
 * je `null` — nie 0 %: tuzemský doklad bez sadzby by inak išiel bez dane
 * (audit 14. 11. 2026, V14). Nečíslo je `NaN`.
 */
function sadzbaZBunky(v: unknown): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = cisloZBunky(v);
  if (n == null) return Number.NaN;
  return n > 0 && n < 1 ? r2(n * 100) : n;
}

type RezimVydanej = {
  reverse_charge: boolean;
  reverse_charge_type: "domestic_69" | "eu_b2b" | "export" | null;
  eu_plnenie: "tovar" | "sluzba" | "trojstranny" | null;
};

/** Režim DPH vydanej faktúry zo stĺpca. Prázdne = tuzemsko, neznáme = `null`. */
export function rezimVydanejZBunky(v: unknown): RezimVydanej | null {
  const s = normNazov(v).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!s || s.startsWith("tuzem")) return { reverse_charge: false, reverse_charge_type: null, eu_plnenie: null };
  if (s.startsWith("pren") || s.includes("pdp") || s.includes("69"))
    return { reverse_charge: true, reverse_charge_type: "domestic_69", eu_plnenie: null };
  if (s.startsWith("troj")) return { reverse_charge: true, reverse_charge_type: "eu_b2b", eu_plnenie: "trojstranny" };
  if (s.startsWith("eu")) {
    if (s.includes("tovar")) return { reverse_charge: true, reverse_charge_type: "eu_b2b", eu_plnenie: "tovar" };
    if (s.includes("sluz")) return { reverse_charge: true, reverse_charge_type: "eu_b2b", eu_plnenie: "sluzba" };
    if (s.includes("troj")) return { reverse_charge: true, reverse_charge_type: "eu_b2b", eu_plnenie: "trojstranny" };
    return null;
  }
  if (s.startsWith("vyvoz") || s.startsWith("export"))
    return { reverse_charge: true, reverse_charge_type: "export", eu_plnenie: "tovar" };
  if (s.startsWith("mimo")) {
    if (s.includes("sluz")) return { reverse_charge: true, reverse_charge_type: "export", eu_plnenie: "sluzba" };
    if (s.includes("tovar")) return { reverse_charge: true, reverse_charge_type: "export", eu_plnenie: "tovar" };
    return null;
  }
  return null;
}

type RezimPrijatej = { reverse_charge: boolean; dph_rezim: "tuzemsko" | "samozdanenie" | "nadobudnutie" | null };

/** Režim DPH prijatej faktúry zo stĺpca. Prázdne = tuzemsko, neznáme = `null`. */
export function rezimPrijatejZBunky(v: unknown): RezimPrijatej | null {
  const s = normNazov(v).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!s || s.startsWith("tuzem")) return { reverse_charge: false, dph_rezim: null };
  // Tuzemské prenesenie (§ 69 ods. 12) — `reverse_charge`, režim prázdny (ako formulár).
  if (s.startsWith("pren") || s.includes("pdp") || s.includes("69"))
    return { reverse_charge: true, dph_rezim: null };
  if (s.startsWith("nadob") || (s.startsWith("eu") && s.includes("tovar")))
    return { reverse_charge: false, dph_rezim: "nadobudnutie" };
  if (s.includes("sluz") || s.startsWith("samozd"))
    return { reverse_charge: false, dph_rezim: "samozdanenie" };
  return null;
}

/** Je partner z iného štátu (podľa IČ DPH, inak krajiny)? */
function partnerZoZahranicia(icDph: unknown, krajina: unknown, domov: string): "eu" | "mimo_eu" | null {
  const ic = rozdelIcDph(String(icDph ?? ""));
  const kod = (ic?.kod === "EL" ? "GR" : ic?.kod) || String(krajina ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(kod) || kod === domov) return null;
  return jeKrajinaEu(kod) ? "eu" : "mimo_eu";
}

/**
 * Overí sadzbu tuzemského plnenia: povinná a platná v krajine firmy ku dňu
 * dodania (S16 — 20 % v roku 2026 či CZ 21 % na SK firme ticho skončili
 * v inej priehradke). Vráti chybu alebo `null`.
 */
function chybaSadzby(
  sadzba: number | null,
  o: { krajina: string; den: string; kde: string; platitel: boolean },
): string | null {
  if (sadzba == null)
    return o.platitel
      ? `${o.kde}: chýba sadzba DPH — pri plnení bez DPH napíšte 0, pri prenesení či EÚ vyplňte Režim DPH`
      : null;
  if (Number.isNaN(sadzba)) return `${o.kde}: sadzba DPH nie je číslo`;
  const platne = sadzbyKrajiny(krajinaDane(o.krajina), o.den);
  if (!platne.some((x) => Math.abs(x - sadzba) < 0.001))
    return `${o.kde}: sadzba ${sadzba} % k ${o.den} neplatí (platné: ${platne.join(", ")} %)`;
  return null;
}

function platbaZBunky(v: unknown): string {
  const s = normNazov(v);
  if (!s) return "prevod";
  if (s.startsWith("hot")) return "hotovost";
  if (s.startsWith("kart") || s === "card") return "karta";
  if (s.startsWith("dob")) return "dobierka";
  if (s.startsWith("zap")) return "zapocet";
  return "prevod";
}

/** Krátky stály odtlačok — rovnaký doklad dostane pri druhom prevode to isté id (kontrola duplicity v Pohode). */
function odtlacok(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export type VysledokKonvertora = {
  /** Vydané faktúry v tvare pre `polozkyFaktur`. */
  faktury: { invoice: Record<string, unknown>; items: Record<string, unknown>[] }[];
  /** Prijaté faktúry a bločky v tvare pre `polozkyDokladov`. */
  doklady: Record<string, unknown>[];
  /** Riadky, ktoré sa nedali previesť — doklad z nich do súboru nejde. */
  chyby: string[];
};

/** Riadky tabuľky (objekty podľa hlavičky) → hodnoty podľa kľúča stĺpca. */
export function riadkyPodlaKluca(
  druh: DruhKonvertora,
  riadky: Record<string, unknown>[],
): Record<string, unknown>[] {
  const mapa = new Map(STLPCE_KONVERTORA[druh].map((s) => [normNazov(s.nazov), s.kluc]));
  return riadky.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r ?? {})) {
      const kluc = mapa.get(normNazov(k));
      if (kluc) out[kluc] = typeof v === "string" ? v.trim() : v;
    }
    return out;
  });
}

const text = (v: unknown, max = 255) =>
  String(v ?? "")
    .trim()
    .slice(0, max);

/** Voliteľný dátum: prázdny = `""`, vyplnený zlý = `null` (chyba, nie ticho zahodiť — S16). */
function volitelnyDatum(v: unknown): string | null {
  if (v == null || String(v).trim() === "") return "";
  return datumZBunky(v) || null;
}

/** Variabilný symbol: len číslice, najviac 10. „EU-1" nie je VS 1 (S16). */
function vsZBunky(v: unknown): string | null {
  const s = text(v, 40).replace(/\s/g, "");
  if (!s) return "";
  return /^\d{1,10}$/.test(s) ? s : null;
}

/**
 * Prevedie riadky šablóny na doklady. `riadky` sú objekty podľa hlavičky
 * (tak, ako ich vráti `sheet_to_json`); prázdne riadky sa preskočia.
 *
 * `firma` (riadok `companies`) určí krajinu sadzieb, platiteľa DPH a
 * členenie DPH / KV tými istými funkciami ako doklad uložený vo Fakteri
 * (`resolveVatClassification`, `resolveVatClassificationPrijatej`). Bez nej
 * slovenský platiteľ a členenie z nastavení exportu.
 */
export function prevedRiadky(
  druh: DruhKonvertora,
  riadky: Record<string, unknown>[],
  opts: {
    domacaMena?: string;
    firma?: Record<string, any> | null;
    /** Číselníky firmy pre členenie (`nacitajKontextClenenia` / `nacitajKontextPrijatych`). */
    kontextVydanych?: KontextClenenia;
    kontextPrijatych?: KontextPrijatych;
  } = {},
): VysledokKonvertora {
  const domaca = (opts.domacaMena || "EUR").toUpperCase();
  const firma = opts.firma ?? null;
  const krajina = krajinaDane(firma?.country);
  const platitel = firma ? rezimFirmy(firma).platitel : true;
  const chyby: string[] = [];
  const zoznam = riadkyPodlaKluca(druh, riadky)
    .map((r, i) => ({ r, cisloRiadku: i + 2 }))
    .filter(({ r }) => Object.values(r).some((v) => v !== "" && v != null));
  const povinne = STLPCE_KONVERTORA[druh].filter((s) => s.povinny);

  // Skupiny riadkov = doklady.
  const skupiny = new Map<string, { r: Record<string, unknown>; cisloRiadku: number }[]>();
  for (const x of zoznam) {
    const chyba = povinne.find((s) => x.r[s.kluc] == null || x.r[s.kluc] === "");
    if (chyba) {
      chyby.push(`Riadok ${x.cisloRiadku}: chýba „${chyba.nazov}"`);
      continue;
    }
    const cislo = text(x.r.cislo);
    const kluc =
      druh === "blocky" && !cislo
        ? `riadok-${x.cisloRiadku}`
        : [
            cislo,
            druh === "vydane" ? "" : normNazov(x.r.partner),
            druh === "blocky" ? text(x.r.vystavenie) : "",
          ].join("|");
    skupiny.set(kluc, [...(skupiny.get(kluc) ?? []), x]);
  }

  const faktury: VysledokKonvertora["faktury"] = [];
  const doklady: Record<string, unknown>[] = [];

  for (const [kluc, sk] of skupiny) {
    const h = sk[0].r;
    const odkial =
      sk.length > 1
        ? `riadky ${sk[0].cisloRiadku}–${sk[sk.length - 1].cisloRiadku}`
        : `riadok ${sk[0].cisloRiadku}`;
    const vystavenie = datumZBunky(h.vystavenie);
    if (!vystavenie) {
      chyby.push(
        `${odkial}: dátum vystavenia nie je platný dátum (napr. 2026-10-01 alebo 1.10.2026)`,
      );
      continue;
    }
    // Voliteľné dátumy: zlý dátum je chyba, nie ticho prázdne pole (S16).
    const zlyDatum = (["dodanie", "splatnost", "dorucenie"] as const).find(
      (k) => k in h && volitelnyDatum(h[k]) === null,
    );
    if (zlyDatum) {
      const nazov = STLPCE_KONVERTORA[druh].find((s) => s.kluc === zlyDatum)?.nazov ?? zlyDatum;
      chyby.push(`${odkial}: „${nazov}" nie je platný dátum (napr. 2026-10-01 alebo 1.10.2026)`);
      continue;
    }
    const mena = (text(h.mena, 3) || domaca).toUpperCase();
    /*
      Cudzia mena bez kurzu sa nedá zaúčtovať — Pohoda by dostala kurz 0
      (V15). Je to chyba riadku, nie varovanie, ktoré sa dá odkliknúť.
    */
    const kurz = cisloZBunky(h.kurz);
    if (mena !== domaca && !(kurz != null && kurz > 0)) {
      chyby.push(`${odkial}: doklad v mene ${mena} potrebuje kurz (počet ${mena} za 1 ${domaca})`);
      continue;
    }
    const vs = vsZBunky(h.vs);
    if (vs === null) {
      chyby.push(`${odkial}: variabilný symbol smie mať len číslice (najviac 10)`);
      continue;
    }
    const id = `XLS-${druh}-${odtlacok(`${kluc}|${vystavenie}`)}`;
    const dodanie = datumZBunky(h.dodanie);
    const denSadzby = dodanie || vystavenie;

    if (druh === "vydane") {
      const typ = normNazov(h.typ);
      if (typ && !typ.startsWith("fakt") && !typ.startsWith("dobropis")) {
        chyby.push(
          `${odkial}: typ „${text(h.typ, 30)}" konvertor nepozná — len faktúra alebo dobropis` +
            (/zaloh|proforma/.test(typ) ? " (zálohovú faktúru zadajte vo Fakteri alebo priamo v Pohode)" : ""),
        );
        continue;
      }
      const rezim = rezimVydanejZBunky(h.rezim);
      if (!rezim) {
        chyby.push(`${odkial}: Režim DPH „${text(h.rezim, 40)}" konvertor nepozná`);
        continue;
      }
      // Odberateľ zo zahraničia bez vyplneného režimu by išiel ako tuzemské plnenie.
      const zahranicie = platitel ? partnerZoZahranicia(h.icDph, h.krajina, krajina) : null;
      if (!rezim.reverse_charge && zahranicie && (zahranicie === "mimo_eu" || rozdelIcDph(String(h.icDph ?? "")))) {
        chyby.push(
          `${odkial}: odberateľ je ${zahranicie === "eu" ? "z iného štátu EÚ" : "mimo EÚ"} — vyplňte Režim DPH (napr. EÚ tovar, EÚ služba, vývoz)`,
        );
        continue;
      }
      const pdpDruh = text(h.pdpDruh, 5).replace(/[).\s]/g, "");
      if (pdpDruh && !platnyDruhPdp(krajina, pdpDruh)) {
        chyby.push(`${odkial}: druh prenesenia „${pdpDruh}" nepoznáme (písmeno § 69 ods. 12)`);
        continue;
      }
      const items: Record<string, unknown>[] = [];
      let zla = "";
      for (const { r, cisloRiadku } of sk) {
        const mnozstvo = cisloZBunky(r.mnozstvo) ?? 1;
        const cena = cisloZBunky(r.cena);
        if (cena == null) {
          zla = `Riadok ${cisloRiadku}: jednotková cena nie je číslo`;
          break;
        }
        let sadzba = sadzbaZBunky(r.sadzba);
        if (rezim.reverse_charge || !platitel) {
          // Bez dane: prenesenie, EÚ a vývoz (aj neplatiteľ) — položka s 0 % ako vo Fakteri.
          if (sadzba != null && sadzba !== 0) {
            zla = !platitel
              ? `Riadok ${cisloRiadku}: firma nie je platiteľ DPH — sadzbu nechajte prázdnu`
              : `Riadok ${cisloRiadku}: pri režime ${text(h.rezim, 30)} sa DPH neúčtuje — sadzbu nechajte prázdnu`;
            break;
          }
          sadzba = 0;
        } else {
          const ch = chybaSadzby(sadzba, { krajina, den: denSadzby, kde: `Riadok ${cisloRiadku}`, platitel });
          if (ch) {
            zla = ch;
            break;
          }
        }
        const s = sadzba ?? 0;
        const zaklad = r2(mnozstvo * cena);
        const dph = r2((zaklad * s) / 100);
        items.push({
          name: text(r.polozka, 90),
          quantity: mnozstvo,
          unit: text(r.mj, 10) || "ks",
          unit_price: cena,
          vat_rate: s,
          subtotal: zaklad,
          vat_amount: dph,
          total: r2(zaklad + dph),
          pohoda_predkontacia: text(r.predkontacia, 30) || null,
          pohoda_clenenie_dph: text(r.clenenie, 30) || null,
        });
      }
      if (zla) {
        chyby.push(zla);
        continue;
      }
      const dobropis = typ.startsWith("dobropis");
      const invoice: Record<string, unknown> = {
        id,
        type: dobropis ? "credit_note" : "regular",
        invoice_number: text(h.cislo, 32),
        issue_date: vystavenie,
        delivery_date: dodanie || vystavenie,
        due_date: datumZBunky(h.splatnost) || null,
        customer_name: text(h.partner, 96),
        customer_ico: text(h.ico, 15) || null,
        customer_dic: text(h.dic, 18) || null,
        customer_ic_dph: text(h.icDph, 18) || null,
        customer_street: text(h.ulica, 64) || null,
        customer_city: text(h.mesto, 45) || null,
        customer_zip: text(h.psc, 15) || null,
        customer_country: text(h.krajina, 2).toUpperCase() || null,
        customer_email: text(h.email, 98) || null,
        variable_symbol: vs || null,
        constant_symbol: text(h.ks, 4).replace(/\D/g, "") || null,
        currency: mena,
        exchange_rate: mena !== domaca ? kurz : null,
        payment_method: platbaZBunky(h.platba),
        intro_note: text(h.text, 240) || null,
        notes: text(h.poznamka, 200) || null,
        subtotal: r2(items.reduce((a, it) => a + Number(it.subtotal), 0)),
        vat_total: r2(items.reduce((a, it) => a + Number(it.vat_amount), 0)),
        total: r2(items.reduce((a, it) => a + Number(it.total), 0)),
        ...rezim,
        pdp_druh: rezim.reverse_charge_type === "domestic_69" ? platnyDruhPdp(krajina, pdpDruh) : null,
        status: "issued",
      };
      /*
        Členenie DPH a KV — to isté, čo dostane faktúra uložená vo Fakteri
        (`resolveVatClassification`). Vyplnené členenie v položkách prebíja.
      */
      if (firma) {
        const v = resolveVatClassification(firma as any, invoice as any, opts.kontextVydanych ?? {});
        invoice.pohoda_clenenie_dph = v.pohoda_clenenie_dph;
        invoice.kv_clenenie = v.kv_clenenie;
        // Bez členenia by export dal predvolené tuzemské — radšej zastaviť.
        if (rezim.reverse_charge && platitel && !v.pohoda_clenenie_dph && items.some((it) => !it.pohoda_clenenie_dph)) {
          chyby.push(`${odkial}: členenie DPH pre režim ${text(h.rezim, 30)} sa nedá určiť — vyplňte stĺpec Členenie DPH`);
          continue;
        }
      }
      faktury.push({ invoice, items });
      continue;
    }

    const rezimPrijatej = druh === "prijate" ? rezimPrijatejZBunky(h.rezim) : { reverse_charge: false, dph_rezim: null };
    if (!rezimPrijatej) {
      chyby.push(`${odkial}: Režim DPH „${text(h.rezim, 40)}" konvertor nepozná`);
      continue;
    }
    const samozdanenie = rezimPrijatej.reverse_charge || rezimPrijatej.dph_rezim != null;
    const zahranicie = platitel ? partnerZoZahranicia(h.icDph, h.krajina, krajina) : null;

    // Prijatá faktúra a bloček — rozpis po sadzbách.
    const po = new Map<number, { sadzba: number; zaklad: number; dph: number; pdp?: boolean }>();
    let zla = "";
    for (const { r, cisloRiadku } of sk) {
      const zaklad = cisloZBunky(r.zaklad);
      if (zaklad == null) {
        zla = `Riadok ${cisloRiadku}: základ DPH nie je číslo`;
        break;
      }
      let sadzba = sadzbaZBunky(r.sadzba);
      if (samozdanenie) {
        // Samozdanenie: dodávateľ daň neúčtoval; sadzbu (ak chýba) doplní export (`sadzbaSamozdanenia`).
        if (Number(cisloZBunky(r.dph) ?? 0)) {
          zla = `Riadok ${cisloRiadku}: pri režime ${text(h.rezim, 30)} dodávateľ DPH neúčtuje — stĺpec DPH nechajte prázdny`;
          break;
        }
        if (sadzba != null && Number.isNaN(sadzba)) {
          zla = `Riadok ${cisloRiadku}: sadzba DPH nie je číslo`;
          break;
        }
        sadzba = sadzba ?? 0;
      } else if (!zahranicie) {
        // Cudzia DPH (hotel v Rakúsku) má sadzby inej krajiny — tú nekontrolujeme.
        const ch = chybaSadzby(sadzba, { krajina, den: denSadzby, kde: `Riadok ${cisloRiadku}`, platitel });
        if (ch) {
          zla = ch;
          break;
        }
      } else if (sadzba == null || Number.isNaN(sadzba)) {
        zla = `Riadok ${cisloRiadku}: chýba sadzba DPH (pri doklade bez DPH napíšte 0)`;
        break;
      }
      const s = sadzba ?? 0;
      const dph = samozdanenie ? 0 : (cisloZBunky(r.dph) ?? r2((zaklad * s) / 100));
      const x = po.get(s) ?? { sadzba: s, zaklad: 0, dph: 0, ...(samozdanenie ? { pdp: true } : {}) };
      x.zaklad = r2(x.zaklad + zaklad);
      x.dph = r2(x.dph + dph);
      po.set(s, x);
    }
    if (zla) {
      chyby.push(zla);
      continue;
    }
    const rozpis = zoradPodlaSadzby([...po.values()], "sadzba");
    const zakladSpolu = r2(rozpis.reduce((a, x) => a + x.zaklad, 0));
    const dphSpolu = r2(rozpis.reduce((a, x) => a + x.dph, 0));
    const spolu = r2(zakladSpolu + dphSpolu);
    // Zahraničný dodávateľ bez dane a bez režimu by išiel ako tuzemský nákup bez samozdanenia.
    if (druh === "prijate" && !samozdanenie && zahranicie && !dphSpolu && zakladSpolu) {
      chyby.push(
        `${odkial}: dodávateľ je zo zahraničia a faktúra je bez DPH — vyplňte Režim DPH (nadobudnutie z EÚ, služba zo zahraničia)`,
      );
      continue;
    }
    if (druh === "blocky") {
      doklady.push({
        id,
        supplier_name: text(h.partner, 96),
        supplier_ico: text(h.ico, 15) || null,
        supplier_ic_dph: text(h.icDph, 18) || null,
        document_number: text(h.cislo, 32) || null,
        issue_date: vystavenie,
        currency: mena,
        payment_method: platbaZBunky(h.platba),
        note: text(h.poznamka, 200) || null,
        pohoda_predkontacia: text(h.predkontacia, 30) || null,
        pohoda_clenenie_dph: text(h.clenenie, 30) || null,
        total_amount: spolu,
        net_amount: zakladSpolu,
        vat_amount: dphSpolu,
        vat_breakdown: rozpis,
      });
      continue;
    }
    /*
      Prijatá faktúra ide cez `prijataAkoDoklad` — ten istý prevod ako
      faktúra uložená vo Fakteri: dátum prijatia (`_datumPrijatia`) posúva
      odpočet (V15), samozdanenie a prenesenie nesú `_samozdanenie`/`_pdp`.
    */
    const riadok: Record<string, any> = {
      id,
      company_id: firma?.id ?? null,
      type: "invoice",
      invoice_number: text(h.cislo, 32),
      variable_symbol: vs || null,
      issue_date: vystavenie,
      delivery_date: dodanie || null,
      received_date: datumZBunky(h.dorucenie) || null,
      due_date: datumZBunky(h.splatnost) || null,
      supplier_name: text(h.partner, 96),
      supplier_ico: text(h.ico, 15) || null,
      supplier_dic: text(h.dic, 18) || null,
      supplier_ic_dph: text(h.icDph, 18) || null,
      supplier_street: text(h.ulica, 64) || null,
      supplier_city: text(h.mesto, 45) || null,
      supplier_zip: text(h.psc, 15) || null,
      supplier_country: text(h.krajina, 2).toUpperCase() || null,
      supplier_iban: text(h.iban, 34).replace(/\s/g, "") || null,
      currency: mena,
      exchange_rate: mena !== domaca ? kurz : null,
      payment_method: platbaZBunky(h.platba),
      intro_note: text(h.text, 240) || null,
      note: text(h.poznamka, 200) || null,
      pohoda_predkontacia: text(h.predkontacia, 30) || null,
      pohoda_clenenie_dph: text(h.clenenie, 30) || null,
      amount_without_vat: zakladSpolu,
      vat_amount: dphSpolu,
      amount_total: spolu,
      vat_breakdown: rozpis,
      ...rezimPrijatej,
    };
    if (firma) {
      const v = resolveVatClassificationPrijatej(firma as any, "prijata", riadok, opts.kontextPrijatych ?? {});
      riadok.pohoda_clenenie_dph = v.pohoda_clenenie_dph;
      riadok.kv_clenenie = v.kv_clenenie;
      // Samozdanenie bez členenia by export zapísal ako tuzemský nákup — radšej zastaviť.
      if (samozdanenie && platitel && !v.pohoda_clenenie_dph) {
        chyby.push(
          `${odkial}: členenie DPH pre režim ${text(h.rezim, 30)} sa nedá určiť z číselníka firmy — vyplňte stĺpec Členenie DPH`,
        );
        continue;
      }
    }
    doklady.push(prijataAkoDoklad(riadok));
  }

  return { faktury, doklady, chyby };
}
