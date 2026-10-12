/*
  Import odberateľov zo súboru — beží v prehliadači, zapisuje cez RLS.

  Rozpoznáva:
  - Pohoda XML: adresár (addressbook) aj partnerov z exportu faktúr,
    objednávok či ponúk (partnerIdentity),
  - Money S3 XML (SeznamFirem / Firma),
  - CSV, TSV a Excel z ostatných systémov (SuperFaktúra, iDoklad, Fakturoid,
    KROS, Omega, mPOHODA, vlastná tabuľka) — stĺpce podľa hlavičky.

  Párovanie s existujúcimi: IČO, a keď ho niet, názov. Existujúci odberateľ
  sa nikdy neprepisuje — najviac sa mu doplnia prázdne údaje.
*/
import { XMLParser } from "fast-xml-parser";
import { kodKrajiny } from "./company-autofill";

export type Odberatel = {
  name: string;
  ico: string | null;
  dic: string | null;
  ic_dph: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  contact_person: string | null;
  external_id: string | null;
  typ: "firma" | "fyzicka";
};

export type Pole = Exclude<keyof Odberatel, "typ">;

export const POLIA: { pole: Pole; nazov: string }[] = [
  { pole: "name", nazov: "Názov / meno" },
  { pole: "ico", nazov: "IČO" },
  { pole: "dic", nazov: "DIČ" },
  { pole: "ic_dph", nazov: "IČ DPH" },
  { pole: "street", nazov: "Ulica" },
  { pole: "city", nazov: "Mesto" },
  { pole: "zip", nazov: "PSČ" },
  { pole: "country", nazov: "Krajina" },
  { pole: "email", nazov: "E-mail" },
  { pole: "phone", nazov: "Telefón" },
  { pole: "contact_person", nazov: "Kontaktná osoba" },
  { pole: "external_id", nazov: "Kód v pôvodnom systéme" },
];

export type Vysledok =
  | { druh: "xml"; zdroj: string; odberatelia: Odberatel[] }
  | {
      druh: "tabulka";
      zdroj: string;
      hlavicka: string[];
      riadky: string[][];
      mapovanie: Record<number, Pole>;
    };

const txt = (v: unknown): string | null => {
  if (v == null) return null;
  if (typeof v === "object") {
    const t = (v as any)["#text"];
    return t != null ? txt(t) : null;
  }
  const s = String(v).replace(/\s+/g, " ").trim();
  return s || null;
};

const bezDiakritiky = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ─── čistenie hodnôt ──────────────────────────────────────────────────────────

const lenCislice = (v: string | null) => (v ? v.replace(/\s+/g, "") || null : null);

function vycisti(
  o: Partial<Record<Pole, string | null>>,
  typ?: Odberatel["typ"],
): Odberatel | null {
  const name = txt(o.name);
  if (!name) return null;
  const ico = lenCislice(txt(o.ico));
  const dic = lenCislice(txt(o.dic));
  const icDph = lenCislice(txt(o.ic_dph))?.toUpperCase() ?? null;
  const krajina =
    kodKrajiny(txt(o.country)) ?? (icDph && /^[A-Z]{2}/.test(icDph) ? icDph.slice(0, 2) : null);
  return {
    name,
    ico,
    dic,
    ic_dph: icDph,
    street: txt(o.street),
    city: txt(o.city),
    zip: txt(o.zip)?.replace(/\s+/g, " ") ?? null,
    country: krajina && krajina.length === 2 ? krajina.toUpperCase() : krajina,
    email: txt(o.email)?.replace(/^mailto:/i, "") ?? null,
    phone: txt(o.phone),
    contact_person: txt(o.contact_person),
    external_id: txt(o.external_id),
    typ: typ ?? "firma",
  };
}

// ─── XML ──────────────────────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  textNodeName: "#text",
});

/** Všetky objekty v strome, ktoré majú daný kľúč. */
function najdi(uzol: any, kluc: string, out: any[] = []): any[] {
  if (!uzol || typeof uzol !== "object") return out;
  if (Array.isArray(uzol)) {
    for (const x of uzol) najdi(x, kluc, out);
    return out;
  }
  if (kluc in uzol) out.push(uzol);
  for (const [k, v] of Object.entries(uzol)) if (k !== kluc) najdi(v, kluc, out);
  return out;
}

const pole = <T>(v: T | T[] | undefined | null): T[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];

/** Pohoda `typ:address` (adresár, faktúra, objednávka…). */
function pohodaAdresa(a: any): Partial<Record<Pole, string | null>> & { _firma: boolean } {
  const firma = txt(a?.company);
  const meno = txt(a?.name);
  const divizia = txt(a?.division);
  return {
    _firma: Boolean(firma),
    name: firma ? (divizia ? `${firma} — ${divizia}` : firma) : meno,
    contact_person: firma ? meno : null,
    ico: txt(a?.ico),
    dic: txt(a?.dic),
    ic_dph: txt(a?.icDph),
    street: txt(a?.street),
    city: txt(a?.city),
    zip: txt(a?.zip),
    country: txt(a?.country?.ids) ?? txt(a?.country),
    email: txt(a?.email),
    phone: txt(a?.phone) ?? txt(a?.mobilPhone),
  };
}

function zPohody(d: any): Odberatel[] {
  const out: Odberatel[] = [];
  // Adresár: addressbookHeader → identity/address + kontakty v hlavičke.
  for (const u of najdi(d, "addressbookHeader")) {
    const h = u.addressbookHeader;
    const a = pohodaAdresa(h?.identity?.address);
    const o = vycisti(
      {
        ...a,
        email: a.email ?? txt(h?.email),
        phone: a.phone ?? txt(h?.phone) ?? txt(h?.mobil),
        external_id: txt(h?.identity?.id) ?? txt(h?.id),
      },
      a._firma || a.ico ? "firma" : "fyzicka",
    );
    if (o) out.push(o);
  }
  if (out.length) return out;
  // Doklady: partnerIdentity v hlavičke faktúry, objednávky, ponuky…
  for (const u of najdi(d, "partnerIdentity")) {
    const a = pohodaAdresa(u.partnerIdentity?.address);
    const o = vycisti(a, a._firma || a.ico ? "firma" : "fyzicka");
    if (o) out.push(o);
  }
  return out;
}

function zMoneyS3(d: any): Odberatel[] {
  const out: Odberatel[] = [];
  for (const u of najdi(d, "Firma")) {
    for (const f of pole(u.Firma)) {
      if (!f || typeof f !== "object") continue;
      const adr = (f as any).Adresa ?? (f as any).FaktAdresa ?? (f as any).ObchAdresa ?? {};
      const tel = (f as any).Tel1 ?? (f as any).Tel ?? (f as any).Telefon;
      const telText =
        tel && typeof tel === "object"
          ? [txt(tel.Pred), txt(tel.Cislo), txt(tel.Klap)].filter(Boolean).join(" ") || txt(tel)
          : txt(tel);
      const osoba = pole((f as any).SeznamOsob?.Osoba ?? (f as any).Osoba)[0] as any;
      const o = vycisti({
        name: txt((f as any).Nazev) ?? txt((f as any).ObchNazev) ?? txt((f as any).FaktNazev),
        ico: txt((f as any).ICO),
        dic: txt((f as any).DIC),
        ic_dph: txt((f as any).ICDPH) ?? txt((f as any).IcDph) ?? txt((f as any).DICSK),
        street: txt(adr.Ulice),
        city: txt(adr.Misto),
        zip: txt(adr.PSC),
        country: txt(adr.KodStatu) ?? txt(adr.Stat),
        email: txt((f as any).Email) ?? txt((f as any).EMail),
        phone: telText,
        contact_person: osoba
          ? [txt(osoba.Jmeno), txt(osoba.Prijmeni)].filter(Boolean).join(" ") || null
          : null,
        external_id: txt((f as any).Zkrat) ?? txt((f as any).KodFirmy),
      });
      if (o) out.push(o);
    }
  }
  return out;
}

export function rozparsujXml(text: string): { zdroj: string; odberatelia: Odberatel[] } {
  const d = parser.parse(text);
  if (najdi(d, "MoneyData").length || d.MoneyData) {
    return { zdroj: "Money S3", odberatelia: zMoneyS3(d) };
  }
  const pohoda = zPohody(d);
  if (pohoda.length) return { zdroj: "Pohoda", odberatelia: pohoda };
  const money = zMoneyS3(d);
  if (money.length) return { zdroj: "Money S3", odberatelia: money };
  return { zdroj: "XML", odberatelia: [] };
}

// ─── tabuľka (CSV / Excel) ────────────────────────────────────────────────────

/*
  Hlavičky zo SuperFaktúry, iDokladu, Fakturoidu, KROSu, Omegy, Pohody
  (export tabuľky do Excelu) a bežných vlastných tabuliek. Porovnáva sa bez
  diakritiky a bez interpunkcie; prvá zhoda vyhráva.
*/
const HLAVICKY: [Pole, RegExp][] = [
  ["ic_dph", /^(ic ?dph|icdph|vat ?(id|no|number)|ic pre dph|dic dph|dic ?\(dph\))$/],
  [
    "ico",
    /^(ico|ic|ic\.|id ?no|company ?id|registration ?no|reg ?no|ico firmy|identifikacne cislo)$/,
  ],
  ["dic", /^(dic|tax ?id|tax ?no|danove identifikacne cislo|local vat no)$/],
  ["email", /(^|\b)(e ?-?mail|email)(\b|$)/],
  ["phone", /(telefon|tel\.?$|^tel\b|phone|mobil|mobile)/],
  [
    "contact_person",
    /(kontaktna osoba|kontaktni osoba|kontakt osoba|contact ?person|osoba|jmeno a prijmeni|meno a priezvisko)/,
  ],
  ["zip", /^(psc|zip|zip ?code|postal ?code|postcode|psc\.)$/],
  ["city", /^(mesto|obec|mesto\/obec|city|town|misto|sidlo mesto)$/],
  [
    "street",
    /^(ulica|ulice|adresa|ulica a cislo|ulice a cislo|street|address|address ?line ?1|sidlo ulica)$/,
  ],
  ["country", /^(krajina|stat|zeme|country|country ?code|kod krajiny|kod statu)$/],
  [
    "external_id",
    /^(kod|kód|id|zkratka|skratka|cislo zakaznika|customer ?id|external ?id|interne cislo)$/,
  ],
  [
    "name",
    /^(nazov|nazev|nazov firmy|nazev firmy|firma|obchodne meno|obchodni jmeno|meno|jmeno|name|company|company ?name|odberatel|zakaznik|klient|customer|nazov odberatela)$/,
  ],
];

export function navrhniMapovanie(hlavicka: string[]): Record<number, Pole> {
  const out: Record<number, Pole> = {};
  const pouzite = new Set<Pole>();
  hlavicka.forEach((h, i) => {
    const n = bezDiakritiky(h)
      .replace(/[_*:]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    for (const [p, re] of HLAVICKY) {
      if (!pouzite.has(p) && re.test(n)) {
        out[i] = p;
        pouzite.add(p);
        return;
      }
    }
  });
  return out;
}

export function zTabulky(riadky: string[][], mapovanie: Record<number, Pole>): Odberatel[] {
  return riadky
    .map((r) => {
      const o: Partial<Record<Pole, string | null>> = {};
      for (const [i, p] of Object.entries(mapovanie)) {
        const v = r[Number(i)];
        if (v != null && String(v).trim()) o[p] = String(v);
      }
      return vycisti(o);
    })
    .filter((x): x is Odberatel => Boolean(x));
}

/** Prečíta súbor: XML podľa obsahu, inak tabuľka cez SheetJS (CSV, TSV, XLS, XLSX, ODS). */
export async function rozparsujSubor(subor: File): Promise<Vysledok> {
  const bajty = new Uint8Array(await subor.arrayBuffer());
  const zaciatok = new TextDecoder("utf-8")
    .decode(bajty.slice(0, 400))
    .replace(/^﻿/, "")
    .trimStart();
  if (zaciatok.startsWith("<")) {
    const text = dekoduj(bajty);
    const r = rozparsujXml(text);
    return { druh: "xml", ...r };
  }
  const XLSX = await import("xlsx");
  const jeText = /\.(csv|txt|tsv)$/i.test(subor.name);
  const wb = jeText
    ? XLSX.read(dekoduj(bajty), { type: "string", raw: true })
    : XLSX.read(bajty, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const vsetko = XLSX.utils
    .sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" })
    .map((r) => r.map((x) => String(x ?? "")));
  // Hlavička je prvý riadok, v ktorom sa niečo rozpoznalo (Excel z Pohody má nad ňou nadpis).
  let idx = vsetko.findIndex((r) => Object.keys(navrhniMapovanie(r)).length >= 2);
  if (idx < 0) idx = 0;
  const hlavicka = (vsetko[idx] ?? []).map((h) => h.trim());
  const riadky = vsetko.slice(idx + 1).filter((r) => r.some((x) => x.trim()));
  return {
    druh: "tabulka",
    zdroj: jeText ? "CSV" : "Excel",
    hlavicka,
    riadky,
    mapovanie: navrhniMapovanie(hlavicka),
  };
}

/** UTF-8, a keď v ňom vyjdú náhradné znaky, Windows-1250 (Pohoda, Money, Omega). */
export function dekoduj(bajty: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bajty);
  const xmlKodovanie = /^<\?xml[^>]*encoding=["']([^"']+)/i
    .exec(utf8.slice(0, 200))?.[1]
    ?.toLowerCase();
  if (xmlKodovanie && xmlKodovanie !== "utf-8") {
    try {
      return new TextDecoder(xmlKodovanie).decode(bajty);
    } catch {
      /* neznáme kódovanie — skúsi sa odhad */
    }
  }
  if ((utf8.match(/�/g) ?? []).length < 3) return utf8.replace(/^﻿/, "");
  try {
    return new TextDecoder("windows-1250").decode(bajty);
  } catch {
    return utf8;
  }
}

// ─── párovanie s existujúcimi ─────────────────────────────────────────────────

export const klucOdberatela = (o: { name: string; ico: string | null }) =>
  o.ico
    ? `ico:${o.ico.replace(/\s+/g, "")}`
    : `nazov:${bezDiakritiky(o.name)
        .replace(/[^a-z0-9]+/g, " ")
        .trim()}`;

export type Plan = {
  novi: Odberatel[];
  doplnit: { id: string; zmena: Partial<Odberatel>; name: string }[];
  existujuci: number;
  duplicityVSubore: number;
};

/**
 * Čo sa založí a čo doplní. Rovnaký odberateľ v súbore viackrát (typicky
 * partneri z faktúr) sa zlúči; existujúcemu sa doplnia len prázdne polia.
 */
export function naplanuj(
  odberatelia: Odberatel[],
  existujuci: (Partial<Odberatel> & { id: string; name: string; ico: string | null })[],
  doplnitPrazdne: boolean,
): Plan {
  const zoSuboru = new Map<string, Odberatel>();
  let duplicity = 0;
  for (const o of odberatelia) {
    const k = klucOdberatela(o);
    const uz = zoSuboru.get(k);
    if (!uz) zoSuboru.set(k, { ...o });
    else {
      duplicity += 1;
      for (const p of Object.keys(o) as (keyof Odberatel)[]) {
        if (uz[p] == null && o[p] != null) (uz as any)[p] = o[p];
      }
    }
  }
  const mame = new Map<string, (typeof existujuci)[number]>();
  for (const e of existujuci) {
    mame.set(klucOdberatela(e), e);
    // Odberateľ s IČO sa nájde aj podľa názvu — v súbore IČO chýbať môže.
    if (e.ico) mame.set(klucOdberatela({ name: e.name, ico: null }), e);
  }
  const plan: Plan = { novi: [], doplnit: [], existujuci: 0, duplicityVSubore: duplicity };
  for (const o of zoSuboru.values()) {
    // Podľa IČO, inak podľa názvu — ale firma s iným IČO a rovnakým názvom je iná firma.
    const podlaNazvu = mame.get(klucOdberatela({ name: o.name, ico: null }));
    const e =
      mame.get(klucOdberatela(o)) ??
      (podlaNazvu && !(podlaNazvu.ico && o.ico && podlaNazvu.ico !== o.ico)
        ? podlaNazvu
        : undefined);
    if (!e) {
      plan.novi.push(o);
      continue;
    }
    plan.existujuci += 1;
    if (!doplnitPrazdne) continue;
    const zmena: Partial<Odberatel> = {};
    for (const { pole: p } of POLIA) {
      if (p === "name") continue;
      const stare = (e as any)[p];
      if ((stare == null || String(stare).trim() === "") && o[p] != null) (zmena as any)[p] = o[p];
    }
    if (Object.keys(zmena).length) plan.doplnit.push({ id: e.id, zmena, name: e.name });
  }
  return plan;
}
