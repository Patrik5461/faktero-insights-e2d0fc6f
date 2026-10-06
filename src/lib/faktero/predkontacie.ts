/*
  Číselník predkontácií a členení DPH — ako v Doklado.

  Kódy patria Pohode účtovníčky: Faktero ich nevymýšľa, len si ich pamätá,
  aby sa dali vyberať (s popisom) namiesto písania naslepo. Naplní sa troma
  cestami — konektorom, XML súborom z Pohody alebo tabuľkou — a dá sa aj
  ručne doplniť.

  Čisté funkcie bez databázy, aby sa dali skúšať.
*/

export type DruhCiselnika =
  "predkontacia" | "clenenie_dph" | "stredisko" | "cinnost" | "ciselny_rad" | "pokladna";

/** Druhy číselníka v poradí záložiek, s názvom pre ľudí. */
export const DRUHY_CISELNIKA: { kod: DruhCiselnika; nazov: string; jednotne: string }[] = [
  { kod: "predkontacia", nazov: "Predkontácie", jednotne: "predkontáciu" },
  { kod: "clenenie_dph", nazov: "Členenie DPH", jednotne: "členenie" },
  { kod: "stredisko", nazov: "Strediská", jednotne: "stredisko" },
  { kod: "cinnost", nazov: "Činnosti", jednotne: "činnosť" },
  { kod: "ciselny_rad", nazov: "Číselné rady", jednotne: "číselný rad" },
  { kod: "pokladna", nazov: "Pokladne", jednotne: "pokladňu" },
];

export type ZaznamCiselnika = {
  druh: DruhCiselnika;
  kod: string;
  popis: string | null;
  /** Agenda Pohody (`receivedInvoice`…) alebo typ členenia; prázdne = všade. */
  agenda: string;
  ucet_md: string | null;
  ucet_d: string | null;
  pohoda_id: string | null;
  aktivne: boolean;
};

/** Agendy Pohody, ktoré sa v číselníku ukazujú — v poradí, ako ich pozná účtovníčka. */
export const AGENDY: { kod: string; nazov: string }[] = [
  { kod: "issuedInvoice", nazov: "Vydané faktúry" },
  { kod: "issuedAdvanceInvoice", nazov: "Vydané zálohové faktúry" },
  { kod: "receivedInvoice", nazov: "Prijaté faktúry" },
  { kod: "receivedAdvanceInvoice", nazov: "Prijaté zálohové faktúry" },
  { kod: "cashPaid", nazov: "Pokladňa — výdaj" },
  { kod: "cashReceived", nazov: "Pokladňa — príjem" },
  { kod: "bankIssued", nazov: "Banka — výdaj" },
  { kod: "bankReceived", nazov: "Banka — príjem" },
  { kod: "internalDocument", nazov: "Interné doklady" },
  { kod: "claim", nazov: "Ostatné pohľadávky" },
  { kod: "commitment", nazov: "Ostatné záväzky" },
];

export function nazovAgendy(kod: string | null | undefined): string {
  const k = String(kod ?? "").trim();
  if (!k) return "všetky";
  return AGENDY.find((a) => a.kod === k)?.nazov ?? k;
}

/**
 * Predvolené kódy podľa druhu dokladu — stĺpce na `companies`.
 *
 * `agendy` hovorí, ktoré predkontácie sa pri výbere ponúknu prvé: bloček ide do
 * Pohody ako prijatý doklad, ale účtovníčka ho môže chcieť viesť cez pokladňu.
 */
export const PREDVOLENE: {
  kluc: string;
  nazov: string;
  predkontacia: string;
  clenenie?: string;
  agendy: string[];
  /** Členenie DPH sa ponúkne pre prijaté či vydané plnenia. */
  smer: "vstup" | "vystup";
}[] = [
  {
    kluc: "faktura",
    nazov: "Vydaná faktúra",
    predkontacia: "pohoda_predkontacia",
    clenenie: "pohoda_clenenie_dph",
    agendy: ["issuedInvoice"],
    smer: "vystup",
  },
  {
    kluc: "pdp",
    nazov: "Vydaná faktúra — prenesenie daňovej povinnosti",
    predkontacia: "",
    clenenie: "pohoda_clenenie_dph_pdp",
    agendy: ["issuedInvoice"],
    smer: "vystup",
  },
  {
    kluc: "zaloha",
    nazov: "Zálohová faktúra",
    predkontacia: "pohoda_predkontacia_zaloha",
    agendy: ["issuedAdvanceInvoice", "issuedInvoice"],
    smer: "vystup",
  },
  {
    kluc: "dobropis",
    nazov: "Dobropis",
    predkontacia: "pohoda_predkontacia_dobropis",
    agendy: ["issuedInvoice"],
    smer: "vystup",
  },
  {
    kluc: "prijata",
    nazov: "Prijatá faktúra",
    predkontacia: "pohoda_predkontacia_prijata",
    clenenie: "pohoda_clenenie_dph_prijata",
    agendy: ["receivedInvoice"],
    smer: "vstup",
  },
  {
    kluc: "doklady",
    nazov: "Bloček a výdavkový doklad",
    predkontacia: "pohoda_predkontacia_doklady",
    clenenie: "pohoda_clenenie_dph_doklady",
    agendy: ["receivedInvoice", "cashPaid", "internalDocument"],
    smer: "vstup",
  },
  {
    kluc: "pokladna",
    nazov: "Pokladničný doklad",
    predkontacia: "pohoda_predkontacia_pokladna",
    agendy: ["cashPaid", "cashReceived"],
    smer: "vstup",
  },
  {
    kluc: "banka",
    nazov: "Bankový doklad",
    predkontacia: "pohoda_predkontacia_banka",
    agendy: ["bankIssued", "bankReceived"],
    smer: "vstup",
  },
];

/** Stĺpce na `companies`, ktoré stránka predkontácií ukladá. */
export const STLPCE_PREDVOLENYCH = [
  ...PREDVOLENE.flatMap((p) => [p.predkontacia, p.clenenie].filter((x): x is string => !!x)),
  // Hlavička rozúčtovaného dokladu („Rozúčtovať" v Pohode).
  "pohoda_predkontacia_rozuctovat",
  // Číselné rady Pohody (predpony) a predvolené stredisko.
  "pohoda_rad_prijate",
  "pohoda_rad_doklady",
  "pohoda_rad_pokladna",
  "pohoda_rad_interne",
  "pohoda_stredisko",
];

/** Predvolené číselné rady Pohody — stĺpec na firme a pre ktorú agendu. */
export const RADY_POHODY: { stlpec: string; nazov: string; agenda: string }[] = [
  { stlpec: "pohoda_rad_prijate", nazov: "Prijaté faktúry", agenda: "prijate_faktury" },
  { stlpec: "pohoda_rad_doklady", nazov: "Bločky ako prijaté faktúry", agenda: "prijate_faktury" },
  { stlpec: "pohoda_rad_pokladna", nazov: "Pokladňa (hotovostné bločky)", agenda: "pokladna" },
  {
    stlpec: "pohoda_rad_interne",
    nazov: "Interné doklady (bločky kartou)",
    agenda: "interni_doklady",
  },
];

/* ---------------------------------------------------------------- Pohoda */

/** Identifikátory položiek žiadosti — odpoveď sa podľa nich nemýli s dokladmi. */
export const ID_CISELNIKOV = [
  "CIS-PREDKONTACIE",
  "CIS-PREDKONTACIE-JU",
  "CIS-CLENENIE",
  "CIS-STREDISKA",
  "CIS-CINNOSTI",
  "CIS-RADY",
] as const;

export function jeIdCiselnika(id: string | null | undefined): boolean {
  return String(id ?? "").startsWith("CIS-");
}

/**
 * Položky dávky, ktorými sa Pohoda pýta na svoje predkontácie a členenia.
 *
 * Podvojné aj jednoduché účtovníctvo naraz — Pohoda odpovie na to, ktoré
 * firma vedie, a na druhé vráti prázdny zoznam. Overené proti list.xsd.
 */
export function polozkyZiadosti(odsadenie = "  "): string {
  const o = odsadenie;
  return `
${o}<dat:dataPackItem id="CIS-PREDKONTACIE" version="2.0">
${o}  <lst:listAccountingDoubleEntryRequest version="2.0"/>
${o}</dat:dataPackItem>
${o}<dat:dataPackItem id="CIS-PREDKONTACIE-JU" version="2.0">
${o}  <lst:listAccountingSingleEntryRequest version="2.0"/>
${o}</dat:dataPackItem>
${o}<dat:dataPackItem id="CIS-CLENENIE" version="2.0">
${o}  <lst:listClassificationVATRequest version="2.0" classificationVATVersion="2.0">
${o}    <lst:requestClassificationVAT/>
${o}  </lst:listClassificationVATRequest>
${o}</dat:dataPackItem>
${o}<dat:dataPackItem id="CIS-STREDISKA" version="2.0">
${o}  <lst:listCentreRequest version="2.0"/>
${o}</dat:dataPackItem>
${o}<dat:dataPackItem id="CIS-CINNOSTI" version="2.0">
${o}  <lst:listActivityRequest version="2.0"/>
${o}</dat:dataPackItem>
${o}<dat:dataPackItem id="CIS-RADY" version="2.0">
${o}  <lst:listNumericalSeriesRequest version="2.0" numericalSeriesVersion="2.0">
${o}    <lst:requestNumericalSeries/>
${o}  </lst:listNumericalSeriesRequest>
${o}</dat:dataPackItem>`;
}

const xmlEsc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const LST = 'xmlns:lst="http://www.stormware.cz/schema/version_2/list.xsd"';

/** Samostatný súbor na ručný import do Pohody (Súbor → Dátová komunikácia → XML import). */
export function ziadostCiselnikov(ico: string | null | undefined): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<dat:dataPack id="FAKTERO-CISELNIKY" ico="${xmlEsc(String(ico ?? ""))}" application="Faktero" version="2.0" note="Predkontácie a členenia DPH pre Faktero"
  xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd"
  ${LST}
  xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">${polozkyZiadosti()}
</dat:dataPack>
`;
}

/**
 * Pridá žiadosť do hotovej dávky konektora. Prázdna dávka (`""`) dostane
 * vlastnú obálku — konektor sa vtedy pýta len na číselníky.
 */
export function pridajZiadost(xml: string, ico: string | null | undefined): string {
  if (!xml.trim()) return ziadostCiselnikov(ico);
  let s = xml;
  if (!s.includes(LST)) s = s.replace(/(<dat:dataPack\b[^>]*?)(>)/, `$1\n  ${LST}$2`);
  return s.replace(/<\/dat:dataPack>\s*$/, `${polozkyZiadosti()}\n</dat:dataPack>\n`);
}

function odEsc(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function atributy(znacka: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_][\w.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(znacka))) out[m[1]] = odEsc(m[3] ?? m[4] ?? "");
  return out;
}

function prvok(xml: string, nazov: string): string | null {
  const m = new RegExp(
    `<(?:[\\w.-]+:)?${nazov}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${nazov}>`,
    "i",
  ).exec(xml);
  if (!m) return null;
  const t = odEsc(
    m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  return t || null;
}

const orez = (s: string | null | undefined, n: number) => {
  const t = String(s ?? "").trim();
  return t ? t.slice(0, n) : null;
};

/**
 * Predkontácie a členenia z odpovede Pohody (`responsePack`).
 *
 * Podvojné: `itemAccounting` s `code`, `accounting` (text), `agenda`, `debit`,
 * `credit`. Jednoduché: bez účtov, s `accountingType`. Členenie DPH je celý
 * záznam `classificationVAT` so skratkou, názvom a typom; neplatné k dnešku sa
 * uložia ako neaktívne, nech ich výber neponúka.
 */
export function rozoberCiselnikyPohody(xml: string, dnes = new Date()): ZaznamCiselnika[] {
  const out: ZaznamCiselnika[] = [];
  const den = dnes.toISOString().slice(0, 10);

  const reItem = /<(?:[\w.-]+:)?itemAccounting\b([^>]*?)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = reItem.exec(xml))) {
    const a = atributy(m[1]);
    const kod = orez(a.code, 30);
    if (!kod) continue;
    out.push({
      druh: "predkontacia",
      kod,
      popis: orez(a.accounting, 200),
      agenda: orez(a.agenda, 40) ?? "",
      ucet_md: orez(a.debit, 20),
      ucet_d: orez(a.credit, 20),
      pohoda_id: orez(a.id, 20),
      aktivne: true,
    });
  }

  const reVat =
    /<(?:[\w.-]+:)?classificationVAT\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?classificationVAT>/gi;
  while ((m = reVat.exec(xml))) {
    const telo = m[1];
    const hlavicka =
      /<(?:[\w.-]+:)?classificationVATHeader\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?classificationVATHeader>/i.exec(
        telo,
      )?.[1] ?? telo;
    const kod = orez(prvok(hlavicka, "code"), 30);
    if (!kod) continue;
    const platiDo = prvok(hlavicka, "validTill");
    const platiOd = prvok(hlavicka, "validFrom");
    const ponuka = prvok(hlavicka, "offer");
    const aktivne =
      (!platiDo || platiDo >= den) && (!platiOd || platiOd <= den) && ponuka !== "false";
    out.push({
      druh: "clenenie_dph",
      kod,
      popis: orez(prvok(hlavicka, "name"), 200),
      agenda: orez(prvok(hlavicka, "VATType"), 40) ?? "",
      ucet_md: null,
      ucet_d: null,
      pohoda_id: orez(prvok(hlavicka, "id"), 20),
      aktivne,
    });
  }
  /*
    Strediská a činnosti: `itemCentre` / `itemActivity` s atribútmi code a
    name. Číselné rady: celý záznam `numericalSeries` s predponou, názvom,
    agendou a rokom — na doklad sa zadáva predpona.
  */
  const reMeno = /<(?:[\w.-]+:)?item(Centre|Activity)\b([^>]*?)\/?>/gi;
  while ((m = reMeno.exec(xml))) {
    const a = atributy(m[2]);
    const kod = orez(a.code, 30);
    if (!kod) continue;
    out.push({
      druh: m[1].toLowerCase() === "centre" ? "stredisko" : "cinnost",
      kod,
      popis: orez(a.name, 200),
      agenda: "",
      ucet_md: null,
      ucet_d: null,
      pohoda_id: orez(a.id, 20),
      aktivne: true,
    });
  }
  const reRad = /<(?:[\w.-]+:)?numericalSeries\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?numericalSeries>/gi;
  while ((m = reRad.exec(xml))) {
    const telo = m[1];
    const kod = orez(prvok(telo, "prefix"), 30);
    if (!kod) continue;
    const rok = prvok(telo, "year");
    const typ = prvok(telo, "typeOfDocument");
    out.push({
      druh: "ciselny_rad",
      kod,
      popis: orez([prvok(telo, "name"), rok].filter(Boolean).join(" · "), 200),
      agenda: orez([prvok(telo, "agenda"), typ].filter(Boolean).join(":"), 40) ?? "",
      ucet_md: null,
      ucet_d: null,
      pohoda_id: orez(prvok(telo, "id"), 20),
      aktivne: !rok || Number(rok) >= dnes.getFullYear() - 1,
    });
  }
  return bezDuplicit(out);
}

/** Rovnaký kód v rovnakej agende len raz — posledný vyhráva, ako pri upserte. */
export function bezDuplicit(z: ZaznamCiselnika[]): ZaznamCiselnika[] {
  const m = new Map<string, ZaznamCiselnika>();
  for (const x of z) m.set(`${x.druh}|${x.kod}|${x.agenda}`, x);
  return [...m.values()];
}

/* --------------------------------------------------------------- tabuľka */

const bezDiakritiky = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const STLPCE: Record<string, string[]> = {
  kod: ["kod", "skratka", "zkratka", "code", "predkontacia", "predkontace", "oznacenie"],
  popis: ["popis", "nazov", "nazev", "text", "name", "accounting", "poznamka"],
  agenda: ["agenda", "typ dokladu", "druh dokladu", "doklad"],
  ucet_md: ["md", "ma dat", "debit", "ucet md", "strana md"],
  ucet_d: ["d", "dal", "dati", "credit", "ucet d", "ucet dal", "strana d"],
  druh: ["druh", "ciselnik", "typ"],
};

/** Česko-slovenské názvy agend z tabuľky na kódy Pohody. */
function agendaZTextu(t: string): string {
  const s = bezDiakritiky(t);
  if (!s) return "";
  const priamo = AGENDY.find((a) => a.kod.toLowerCase() === s.replace(/\s/g, "").toLowerCase());
  if (priamo) return priamo.kod;
  const zal = /zaloh/.test(s);
  if (/prij|doslo|dosl/.test(s) && /fakt/.test(s))
    return zal ? "receivedAdvanceInvoice" : "receivedInvoice";
  if (/vyd|vyst/.test(s) && /fakt/.test(s)) return zal ? "issuedAdvanceInvoice" : "issuedInvoice";
  if (/poklad/.test(s)) return /prij/.test(s) ? "cashReceived" : "cashPaid";
  if (/bank/.test(s)) return /prij/.test(s) ? "bankReceived" : "bankIssued";
  if (/intern/.test(s)) return "internalDocument";
  if (/pohlad|pohled/.test(s)) return "claim";
  if (/zavaz|zavaz/.test(s)) return "commitment";
  return t.trim().slice(0, 40);
}

/**
 * Riadky tabuľky (CSV/XLSX už rozbité na bunky) na záznamy číselníka.
 *
 * Hlavička sa hľadá v prvých piatich riadkoch — export z Pohody aj ručne
 * písaná tabuľka mávajú nad ňou nadpis. Bez rozpoznaného stĺpca s kódom sa
 * nedá nič, a to sa povie.
 */
export function rozoberTabulku(
  riadky: unknown[][],
  predvolenyDruh: DruhCiselnika = "predkontacia",
): { zaznamy: ZaznamCiselnika[]; chyba: string | null } {
  const bunka = (v: unknown) => String(v ?? "").trim();
  let hlavicka = -1;
  let mapa: Record<string, number> = {};
  for (let i = 0; i < Math.min(riadky.length, 5); i++) {
    const nazvy = (riadky[i] ?? []).map((v) => bezDiakritiky(bunka(v)));
    const m: Record<string, number> = {};
    for (const [pole, mena] of Object.entries(STLPCE)) {
      const j = nazvy.findIndex((n) => mena.includes(n));
      if (j >= 0) m[pole] = j;
    }
    if (m.kod !== undefined) {
      hlavicka = i;
      mapa = m;
      break;
    }
  }
  if (hlavicka < 0) {
    return {
      zaznamy: [],
      chyba: "V tabuľke chýba stĺpec s kódom (Kód, Skratka alebo Predkontácia).",
    };
  }
  const out: ZaznamCiselnika[] = [];
  for (const r of riadky.slice(hlavicka + 1)) {
    const v = (pole: string) => (mapa[pole] === undefined ? "" : bunka(r?.[mapa[pole]]));
    const kod = v("kod").slice(0, 30);
    if (!kod) continue;
    const druhText = bezDiakritiky(v("druh"));
    const druh: DruhCiselnika = /clen|dph|vat/.test(druhText)
      ? "clenenie_dph"
      : /predkont/.test(druhText)
        ? "predkontacia"
        : predvolenyDruh;
    out.push({
      druh,
      kod,
      popis: orez(v("popis"), 200),
      agenda: agendaZTextu(v("agenda")),
      ucet_md: orez(v("ucet_md"), 20),
      ucet_d: orez(v("ucet_d"), 20),
      pohoda_id: null,
      aktivne: true,
    });
  }
  return {
    zaznamy: bezDuplicit(out),
    chyba: out.length ? null : "Tabuľka nemá pod hlavičkou žiadny riadok s kódom.",
  };
}

/** Jednoduché CSV (aj s bodkočiarkou a úvodzovkami) na bunky. */
export function rozdelCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const prvy = t.split(/\r?\n/, 1)[0] ?? "";
  const odd = (prvy.match(/;/g)?.length ?? 0) >= (prvy.match(/,/g)?.length ?? 0) ? ";" : ",";
  const out: string[][] = [];
  let riadok: string[] = [];
  let pole = "";
  let vUvodzovkach = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (vUvodzovkach) {
      if (c === '"' && t[i + 1] === '"') {
        pole += '"';
        i++;
      } else if (c === '"') vUvodzovkach = false;
      else pole += c;
    } else if (c === '"') vUvodzovkach = true;
    else if (c === odd) {
      riadok.push(pole);
      pole = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      riadok.push(pole);
      out.push(riadok);
      riadok = [];
      pole = "";
    } else pole += c;
  }
  if (pole || riadok.length) {
    riadok.push(pole);
    out.push(riadok);
  }
  return out.filter((r) => r.some((x) => x.trim()));
}

/* ----------------------------------------------------------------- výber */

export type MoznostKodu = {
  kod: string;
  popis: string | null;
  agenda: string;
  ucty: string | null;
};

/**
 * Základné členenia DPH slovenskej Pohody — ponúkajú sa, kým si firma
 * nenačíta vlastný číselník z Pohody (ten má potom prednosť). Len kódy
 * overené v dokumentácii Stormware SK; ostatné doplní import číselníka
 * alebo voľba „Iný kód…".
 */
export const ZAKLADNE_CLENENIA_DPH: { kod: string; popis: string; smer: "vydane" | "prijate" }[] = [
  { kod: "UD", popis: "Tuzemské plnenie", smer: "vydane" },
  { kod: "UDpdp", popis: "Prenesenie daňovej povinnosti § 69 ods. 12", smer: "vydane" },
  {
    kod: "UKpdp",
    popis: "Prenesenie daňovej povinnosti § 69 ods. 12 – nezapočítať do koeficientu",
    smer: "vydane",
  },
  { kod: "UNoslob", popis: "Oslobodené plnenie § 65 ods. 7 a § 67 ods. 3", smer: "vydane" },
  { kod: "UN", popis: "Nezahrnovať do priznania DPH", smer: "vydane" },
  { kod: "PD", popis: "Tuzemské plnenie s nárokom na odpočet", smer: "prijate" },
  { kod: "PN", popis: "Nezahrnovať do priznania DPH (bez nároku na odpočet)", smer: "prijate" },
];

/** Druhy dokladov, ktoré sú výstupom (vydané); ostatné sú prijaté. */
const VYDANE_DRUHY = ["faktura", "pdp", "zaloha", "dobropis"];

/**
 * Členenia na výber: z číselníka firmy, a keď ho firma nemá, základné
 * členenia podľa smeru dokladu — aby sa po kliknutí vždy niečo ukázalo.
 */
export function ponukaClenenia(zoCiselnika: MoznostKodu[], preDoklad?: string): MoznostKodu[] {
  if (zoCiselnika.length) return zoCiselnika;
  const smer = preDoklad ? (VYDANE_DRUHY.includes(preDoklad) ? "vydane" : "prijate") : null;
  return ZAKLADNE_CLENENIA_DPH.filter((c) => !smer || c.smer === smer).map((c) => ({
    kod: c.kod,
    popis: c.popis,
    agenda: "",
    ucty: null,
  }));
}

/**
 * Ponuka kódov pre jedno pole: najprv tie z vhodných agend, potom ostatné.
 * Neaktívne sa neponúkajú. Členenie sa filtruje podľa smeru (vstup/výstup),
 * keď ho Pohoda poslala; inak sa ukáže celé.
 */
export function ponuka(
  zaznamy: (Pick<ZaznamCiselnika, "kod" | "popis" | "agenda" | "ucet_md" | "ucet_d"> & {
    druh: string;
    aktivne?: boolean;
    druhy_dokladov?: string[] | null;
  })[],
  druh: DruhCiselnika,
  agendy: string[] = [],
  /** Kľúč druhu dokladu z PREDVOLENE — kód obmedzený na iné druhy sa neponúkne. */
  preDoklad?: string,
): MoznostKodu[] {
  const vhodne = (z: { agenda: string }) => {
    if (!z.agenda) return 1;
    if (druh === "predkontacia") return agendy.includes(z.agenda) ? 0 : 2;
    return 1;
  };
  const videne = new Set<string>();
  return zaznamy
    .filter((z) => z.druh === druh && z.aktivne !== false)
    .filter((z) => !preDoklad || !z.druhy_dokladov?.length || z.druhy_dokladov.includes(preDoklad))
    .sort((a, b) => vhodne(a) - vhodne(b) || a.kod.localeCompare(b.kod, "sk"))
    .filter((z) => (videne.has(z.kod) ? false : (videne.add(z.kod), true)))
    .map((z) => ({
      kod: z.kod,
      popis: z.popis,
      agenda: z.agenda,
      ucty: z.ucet_md || z.ucet_d ? `${z.ucet_md ?? "—"}/${z.ucet_d ?? "—"}` : null,
    }));
}
