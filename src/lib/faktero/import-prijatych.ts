/*
  Import prijatých dokladov z inej aplikácie (Doklado, Pohoda, tabuľka).

  Doklado a podobné služby vedia doklady vyviezť ako XML pre Pohodu, ako
  CSV/XLSX so všetkými položkami a ako ZIP s PDF každého dokladu. Tu je čistá
  časť: z obsahu súborov spraví zoznam dokladov a k nim priradí skeny podľa
  čísla dokladu v mene súboru. Zápis do databázy a čítanie skenov cez AI je
  v `import-prijatych.server.ts`.
*/

export type TypPrijateho = "faktura" | "blocek";

export type PolozkaPrijateho = {
  name: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  total: number;
};

export type PrijatyZaznam = {
  typ: TypPrijateho;
  zdroj: string;
  cislo: string | null;
  dodavatel: string | null;
  ico: string | null;
  dic: string | null;
  icDph: string | null;
  iban: string | null;
  vs: string | null;
  vystavenie: string | null;
  splatnost: string | null;
  zaklad: number | null;
  dph: number | null;
  spolu: number | null;
  mena: string;
  uhrada: "hotovost" | "karta" | "prevod" | null;
  poznamka: string | null;
  /** Dobropis či zálohová faktúra — do poznámky, nech to účtovník vidí. */
  druh: string | null;
  polozky: PolozkaPrijateho[];
};

/* ---------------- pomocníci ---------------- */

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const t = (v as any)["#text"];
    return t == null ? "" : String(t).trim();
  }
  return String(v).trim();
}

function uzol(o: any, ...cesta: string[]): any {
  let cur = o;
  for (const k of cesta) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = Array.isArray(cur) ? cur[0]?.[k] : cur[k];
  }
  return cur;
}

function hodnota(o: any, ...cesta: string[]): string {
  return text(uzol(o, ...cesta));
}

function pole(v: any): any[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Číslo z textu: „1 234,56 €“, „1.234,56“, „1234.56“. Prázdne je `null`. */
export function cisloZTextu(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v ?? "")
    .replace(/[\s ]/g, "")
    .replace(/[^\d,.-]/g, "");
  if (!t || t === "-") return null;
  const norm =
    t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = Number(norm);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Dátum na `YYYY-MM-DD`; čo sa nedá prečítať, je `null` — nikdy `""`. */
export function datumZTextu(v: unknown): string | null {
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Excel ukladá dátum ako počet dní od 30. 12. 1899.
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\s*[.\/]\s*(\d{1,2})\s*[.\/]\s*(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return null;
}

function alebo(s: string): string | null {
  return s ? s : null;
}

function uhradaZTextu(t: string): PrijatyZaznam["uhrada"] {
  const s = normalizuj(t);
  if (!s) return null;
  if (/hotov|cash|pokladn/.test(s)) return "hotovost";
  if (/kart|card/.test(s)) return "karta";
  if (/prevod|prikaz|draft|bank|ucet/.test(s)) return "prevod";
  return null;
}

/** Malé písmená bez diakritiky a nadbytočných medzier. */
export function normalizuj(t: unknown): string {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_\s]+/g, " ")
    .trim();
}

/* ---------------- Pohoda XML ---------------- */

/*
  Prijaté faktúry sú `inv:invoice` s typom `received…`, bločky a pokladničné
  výdavky `vch:voucher` s typom `expense`. Vydané faktúry sa tu preskakujú —
  na tie je import vydaných faktúr.
*/
const TYPY_PRIJATYCH: Record<string, string | null> = {
  receivedinvoice: null,
  receivedcreditnotice: "Dobropis",
  receiveddebitnote: "Ťarchopis",
  receivedadvanceinvoice: "Zálohová faktúra",
};

function suhrnDokladu(suhrn: any) {
  const zaklad =
    (cisloZTextu(hodnota(suhrn, "priceNone")) ?? 0) +
    (cisloZTextu(hodnota(suhrn, "priceLow")) ?? 0) +
    (cisloZTextu(hodnota(suhrn, "priceHigh")) ?? 0) +
    (cisloZTextu(hodnota(suhrn, "price3")) ?? 0);
  const dph =
    (cisloZTextu(hodnota(suhrn, "priceLowVAT")) ?? 0) +
    (cisloZTextu(hodnota(suhrn, "priceHighVAT")) ?? 0) +
    (cisloZTextu(hodnota(suhrn, "price3VAT")) ?? 0);
  const zaokr = cisloZTextu(hodnota(suhrn, "round", "priceRound")) ?? 0;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { zaklad: r2(zaklad), dph: r2(dph), spolu: r2(zaklad + dph + zaokr) };
}

function polozkyPohody(zoznam: any[]): PolozkaPrijateho[] {
  return zoznam
    .map((p) => {
      const m = uzol(p, "homeCurrency") ?? {};
      const zaklad = cisloZTextu(hodnota(m, "price")) ?? 0;
      const dan = cisloZTextu(hodnota(m, "priceVAT")) ?? 0;
      const sadzba = zaklad ? Math.round((dan / zaklad) * 100) : 0;
      return {
        name: hodnota(p, "text"),
        quantity: cisloZTextu(hodnota(p, "quantity")) ?? 1,
        unit_price: cisloZTextu(hodnota(m, "unitPrice")) ?? zaklad,
        vat_rate: sadzba,
        total: cisloZTextu(hodnota(m, "priceSum")) ?? Math.round((zaklad + dan) * 100) / 100,
      };
    })
    .filter((p) => p.name);
}

function partner(h: any) {
  const a = uzol(h, "partnerIdentity", "address") ?? {};
  return {
    dodavatel: alebo(hodnota(a, "company") || hodnota(a, "name")),
    ico: alebo(hodnota(a, "ico")),
    dic: alebo(hodnota(a, "dic")),
    icDph: alebo(hodnota(a, "icDph") || hodnota(a, "vatId")),
  };
}

export function jePohodaXmlObsah(xml: string): boolean {
  const z = xml.slice(0, 5000);
  return /dataPack|responsePack/.test(z) && /stormware/i.test(z);
}

/** Prijaté doklady z Pohoda XML (dataPack aj responsePack), už rozparsovaného. */
export function pohodaPrijate(doc: any): PrijatyZaznam[] {
  const balik = doc?.dataPack ?? doc?.responsePack ?? doc;
  const polozkyBalika = [...pole(uzol(balik, "dataPackItem")), ...pole(uzol(balik, "responsePackItem"))];
  const vysledok: PrijatyZaznam[] = [];

  for (const item of polozkyBalika) {
    // Odpoveď Pohody môže doklady zabaliť do zoznamu (`listInvoice`, `listVoucher`).
    const faktury = [
      ...pole(uzol(item, "invoice")),
      ...pole(uzol(item, "listInvoice", "invoice")),
    ];
    for (const f of faktury) {
      const h = uzol(f, "invoiceHeader") ?? {};
      const typ = hodnota(h, "invoiceType").toLowerCase();
      if (!(typ in TYPY_PRIJATYCH)) continue;
      const s = suhrnDokladu(uzol(f, "invoiceSummary", "homeCurrency") ?? {});
      const zahranicna = uzol(f, "invoiceSummary", "foreignCurrency");
      const mena = hodnota(zahranicna, "currency", "ids") || "EUR";
      vysledok.push({
        typ: "faktura",
        zdroj: "Pohoda XML",
        cislo: alebo(hodnota(h, "originalDocument") || hodnota(h, "number", "numberRequested") || hodnota(h, "symVar")),
        ...partner(h),
        iban: alebo(hodnota(h, "paymentAccount", "accountNo")),
        vs: alebo(hodnota(h, "symVar")),
        vystavenie: datumZTextu(hodnota(h, "date")),
        splatnost: datumZTextu(hodnota(h, "dateDue")),
        ...s,
        mena,
        uhrada: uhradaZTextu(hodnota(h, "paymentType", "paymentType")),
        poznamka: alebo(hodnota(h, "text") || hodnota(h, "note")),
        druh: TYPY_PRIJATYCH[typ] ?? null,
        polozky: polozkyPohody(pole(uzol(f, "invoiceDetail", "invoiceItem"))),
      });
    }

    const pokladnicne = [...pole(uzol(item, "voucher")), ...pole(uzol(item, "listVoucher", "voucher"))];
    for (const v of pokladnicne) {
      const h = uzol(v, "voucherHeader") ?? {};
      if (hodnota(h, "voucherType").toLowerCase() !== "expense") continue;
      const s = suhrnDokladu(uzol(v, "voucherSummary", "homeCurrency") ?? {});
      vysledok.push({
        typ: "blocek",
        zdroj: "Pohoda XML",
        cislo: alebo(hodnota(h, "originalDocument") || hodnota(h, "number", "numberRequested")),
        ...partner(h),
        iban: null,
        vs: null,
        vystavenie: datumZTextu(hodnota(h, "date")),
        splatnost: null,
        ...s,
        mena: "EUR",
        uhrada: "hotovost",
        poznamka: alebo(hodnota(h, "text")),
        druh: null,
        polozky: polozkyPohody(pole(uzol(v, "voucherDetail", "voucherItem"))),
      });
    }
  }
  return vysledok;
}

/* ---------------- CSV / XLSX ---------------- */

type Pole =
  | "typ"
  | "cislo"
  | "dodavatel"
  | "ico"
  | "dic"
  | "icDph"
  | "iban"
  | "vs"
  | "vystavenie"
  | "splatnost"
  | "zaklad"
  | "dph"
  | "spolu"
  | "mena"
  | "uhrada"
  | "poznamka"
  | "polozka"
  | "mnozstvo"
  | "jednotkova"
  | "sadzba"
  | "polozkaSpolu";

/*
  Názvy stĺpcov, ako ich píšu Doklado, Pohoda, Money či Excel od účtovníčky.
  Porovnáva sa celý názov po odstránení diakritiky — „DPH“ nesmie chytiť aj
  „Suma bez DPH“.
*/
const STLPCE: Record<Pole, string[]> = {
  typ: ["typ dokladu", "typ", "druh dokladu", "druh", "agenda", "document type", "type"],
  cislo: [
    "cislo dokladu",
    "cislo faktury",
    "cislo",
    "c. dokladu",
    "externe cislo",
    "povodne cislo",
    "cislo dodavatela",
    "document number",
    "invoice number",
    "number",
  ],
  dodavatel: [
    "dodavatel",
    "nazov dodavatela",
    "dodavatel nazov",
    "obchodny partner",
    "partner",
    "firma",
    "nazov firmy",
    "supplier",
    "vendor",
  ],
  ico: ["ico", "ico dodavatela", "company id", "reg. no."],
  dic: ["dic", "dic dodavatela", "tax id"],
  icDph: ["ic dph", "icdph", "ic dph dodavatela", "vat id", "vat number"],
  iban: ["iban", "cislo uctu", "ucet", "bankovy ucet"],
  vs: ["variabilny symbol", "vs", "var. symbol"],
  vystavenie: ["datum vystavenia", "vystavene", "datum dokladu", "datum", "datum nakupu", "issue date", "date"],
  splatnost: ["datum splatnosti", "splatnost", "splatne", "due date"],
  zaklad: [
    "zaklad",
    "zaklad dane",
    "suma bez dph",
    "celkom bez dph",
    "spolu bez dph",
    "bez dph",
    "cena bez dph",
    "net amount",
    "subtotal",
  ],
  dph: ["dph", "suma dph", "dph spolu", "dan", "vat", "vat amount"],
  spolu: [
    "spolu",
    "suma spolu",
    "celkom",
    "celkom s dph",
    "suma s dph",
    "spolu s dph",
    "cena s dph",
    "suma",
    "k uhrade",
    "celkova suma",
    "total",
    "amount",
  ],
  mena: ["mena", "currency"],
  uhrada: ["forma uhrady", "sposob uhrady", "uhrada", "platba", "payment method"],
  poznamka: ["poznamka", "popis", "text", "note", "description"],
  polozka: ["nazov polozky", "polozka", "text polozky", "item", "item name"],
  mnozstvo: ["mnozstvo", "pocet", "quantity"],
  jednotkova: ["jednotkova cena", "cena za jednotku", "cena za mj", "unit price"],
  sadzba: ["sadzba dph", "sadzba", "dph %", "vat rate"],
  polozkaSpolu: ["polozka spolu", "cena polozky", "spolu za polozku", "item total"],
};

/** Ktorý stĺpec tabuľky je ktoré pole. Nepoznané stĺpce ostanú bokom. */
export function rozpoznajStlpce(hlavicka: unknown[]): Partial<Record<Pole, number>> {
  const mapa: Partial<Record<Pole, number>> = {};
  const nazvy = hlavicka.map((h) => normalizuj(h).replace(/[:*]/g, "").trim());
  for (const [pole, synonyma] of Object.entries(STLPCE) as [Pole, string[]][]) {
    for (const syn of synonyma) {
      const i = nazvy.findIndex((n, j) => n === syn && !Object.values(mapa).includes(j));
      if (i >= 0) {
        mapa[pole] = i;
        break;
      }
    }
  }
  return mapa;
}

/** Jednoduchý CSV parser s úvodzovkami; oddeľovač sa zistí z hlavičky. */
export function citajCsv(obsah: string): string[][] {
  const t = obsah.replace(/^﻿/, "");
  const prvy = t.split(/\r?\n/, 1)[0] ?? "";
  const oddelovac = [";", "\t", ","].reduce((a, b) =>
    prvy.split(b).length > prvy.split(a).length ? b : a,
  );
  const riadky: string[][] = [];
  let riadok: string[] = [];
  let bunka = "";
  let vUvodzovkach = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (vUvodzovkach) {
      if (c === '"' && t[i + 1] === '"') {
        bunka += '"';
        i++;
      } else if (c === '"') vUvodzovkach = false;
      else bunka += c;
    } else if (c === '"') vUvodzovkach = true;
    else if (c === oddelovac) {
      riadok.push(bunka);
      bunka = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      riadok.push(bunka);
      if (riadok.some((b) => b.trim() !== "")) riadky.push(riadok);
      riadok = [];
      bunka = "";
    } else bunka += c;
  }
  riadok.push(bunka);
  if (riadok.some((b) => b.trim() !== "")) riadky.push(riadok);
  return riadky;
}

function typZTextu(t: string, maSplatnost: boolean): TypPrijateho {
  const s = normalizuj(t);
  if (/blok|blocek|pokladn|uctenk|ekasa|receipt/.test(s)) return "blocek";
  if (/faktur|invoice|dobropis|zaloh/.test(s)) return "faktura";
  return maSplatnost ? "faktura" : "blocek";
}

/**
 * Doklady z tabuľky. Tabuľka môže mať riadok na doklad alebo na položku
 * (Doklado „CSV detailný“) — riadky toho istého dokladu sa spoja a
 * položky sa pozbierajú.
 */
export function tabulkaNaZaznamy(riadky: unknown[][], zdroj: string): PrijatyZaznam[] {
  // Hlavička nemusí byť prvý riadok — export býva uvedený názvom firmy.
  let hlavickaI = -1;
  let mapa: Partial<Record<Pole, number>> = {};
  for (let i = 0; i < Math.min(riadky.length, 10); i++) {
    const m = rozpoznajStlpce(riadky[i] ?? []);
    const zakladne = ["cislo", "dodavatel", "spolu", "vystavenie"].filter((p) => p in m).length;
    if (zakladne >= 2) {
      hlavickaI = i;
      mapa = m;
      break;
    }
  }
  if (hlavickaI < 0) return [];

  const bunka = (r: unknown[], p: Pole) => (mapa[p] == null ? "" : text(r[mapa[p]!]));
  const surova = (r: unknown[], p: Pole) => (mapa[p] == null ? undefined : r[mapa[p]!]);
  const doklady = new Map<string, PrijatyZaznam>();

  for (const r of riadky.slice(hlavickaI + 1)) {
    const cislo = alebo(bunka(r, "cislo"));
    const dodavatel = alebo(bunka(r, "dodavatel"));
    const spolu = cisloZTextu(surova(r, "spolu"));
    if (!cislo && !dodavatel && spolu == null) continue;
    const splatnost = datumZTextu(surova(r, "splatnost"));
    const typ = typZTextu(bunka(r, "typ"), Boolean(splatnost || bunka(r, "vs")));
    const kluc = [typ, cislo ?? "", normalizuj(bunka(r, "ico") || dodavatel), datumZTextu(surova(r, "vystavenie")) ?? ""].join("|");

    let d = doklady.get(kluc);
    if (!d) {
      const druhText = normalizuj(bunka(r, "typ"));
      d = {
        typ,
        zdroj,
        cislo,
        dodavatel,
        ico: alebo(bunka(r, "ico").replace(/\s/g, "")),
        dic: alebo(bunka(r, "dic").replace(/\s/g, "")),
        icDph: alebo(bunka(r, "icDph").replace(/\s/g, "")),
        iban: alebo(bunka(r, "iban").replace(/\s/g, "").toUpperCase()),
        vs: alebo(bunka(r, "vs")),
        vystavenie: datumZTextu(surova(r, "vystavenie")),
        splatnost,
        zaklad: cisloZTextu(surova(r, "zaklad")),
        dph: cisloZTextu(surova(r, "dph")),
        spolu,
        mena: (bunka(r, "mena") || "EUR").toUpperCase().slice(0, 3),
        uhrada: uhradaZTextu(bunka(r, "uhrada")),
        poznamka: alebo(bunka(r, "poznamka")),
        druh: /dobropis/.test(druhText) ? "Dobropis" : /zaloh/.test(druhText) ? "Zálohová faktúra" : null,
        polozky: [],
      };
      doklady.set(kluc, d);
    }
    const nazovPolozky = bunka(r, "polozka");
    if (nazovPolozky) {
      const mnozstvo = cisloZTextu(surova(r, "mnozstvo")) ?? 1;
      const jednotkova = cisloZTextu(surova(r, "jednotkova")) ?? 0;
      d.polozky.push({
        name: nazovPolozky,
        quantity: mnozstvo,
        unit_price: jednotkova,
        vat_rate: cisloZTextu(surova(r, "sadzba")) ?? 0,
        total: cisloZTextu(surova(r, "polozkaSpolu")) ?? Math.round(mnozstvo * jednotkova * 100) / 100,
      });
    }
  }
  return [...doklady.values()];
}

/* ---------------- skeny k dokladom ---------------- */

function alnum(t: unknown): string {
  return normalizuj(t).replace(/[^a-z0-9]/g, "");
}

/**
 * Priradí skeny k dokladom podľa čísla dokladu v mene súboru („FA2024001.pdf“,
 * „2024-001_Shell.pdf“). Každý súbor sa použije raz; pri viacerých kandidátoch
 * vyhrá najdlhšie číslo. Vráti mapu index dokladu → index súboru.
 */
export function priradSkeny(
  zaznamy: Pick<PrijatyZaznam, "cislo">[],
  subory: { meno: string }[],
): Map<number, number> {
  const mena = subory.map((s) => alnum(s.meno.replace(/\.[a-z0-9]+$/i, "")));
  const poradie = zaznamy
    .map((z, i) => ({ i, c: alnum(z.cislo) }))
    .filter((x) => x.c.length >= 3)
    .sort((a, b) => b.c.length - a.c.length);
  const pouzite = new Set<number>();
  const mapa = new Map<number, number>();
  for (const { i, c } of poradie) {
    const j = mena.findIndex((m, k) => !pouzite.has(k) && m.includes(c));
    if (j >= 0) {
      mapa.set(i, j);
      pouzite.add(j);
    }
  }
  return mapa;
}

/** Kľúč na odhalenie dokladu, ktorý vo firme už je. */
export function klucDuplicity(z: Pick<PrijatyZaznam, "typ" | "cislo" | "ico" | "dodavatel" | "vystavenie" | "spolu">): string {
  return [
    z.typ,
    alnum(z.cislo),
    alnum(z.ico) || alnum(z.dodavatel),
    z.typ === "blocek" ? `${z.vystavenie ?? ""}|${z.spolu ?? ""}` : "",
  ].join("|");
}

/* ---------------- riadky do databázy ---------------- */

export type StavImportu = "new" | "processed" | "exported";

/** Doplní chýbajúci člen trojice základ + DPH = spolu, nič nedomýšľa nasilu. */
function sumy(z: Pick<PrijatyZaznam, "zaklad" | "dph" | "spolu">) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const spolu = z.spolu ?? (z.zaklad != null && z.dph != null ? r2(z.zaklad + z.dph) : null);
  const dph = z.dph ?? (spolu != null && z.zaklad != null ? r2(spolu - z.zaklad) : null);
  const zaklad = z.zaklad ?? (spolu != null && dph != null ? r2(spolu - dph) : null);
  return { zaklad, dph, spolu };
}

function poznamkaImportu(z: PrijatyZaznam, zdrojAplikacie: string): string {
  return [z.druh, z.poznamka, `Importované z ${zdrojAplikacie} (${z.zdroj}).`].filter(Boolean).join("\n");
}

/**
 * Riadok prijatej faktúry. Dodávateľ, číslo a dátumy sú v databáze povinné —
 * keď chýbajú, doplní sa zrozumiteľná náhrada, nech doklad radšej vznikne
 * neúplný, než aby sa stratil.
 */
export function riadokPrijatejFaktury(
  z: PrijatyZaznam,
  o: { stav: StavImportu; dnes: string; zdrojAplikacie: string },
) {
  const s = sumy(z);
  const vystavenie = z.vystavenie ?? o.dnes;
  return {
    supplier_name: z.dodavatel ?? "Neurčený dodávateľ",
    supplier_ico: z.ico,
    supplier_dic: z.dic,
    supplier_ic_dph: z.icDph,
    supplier_iban: z.iban,
    invoice_number: z.cislo ?? z.vs ?? "bez čísla",
    variable_symbol: z.vs,
    issue_date: vystavenie,
    received_date: vystavenie,
    due_date: z.splatnost ?? vystavenie,
    amount_without_vat: s.zaklad ?? 0,
    vat_amount: s.dph ?? 0,
    amount_total: s.spolu ?? 0,
    currency: z.mena || "EUR",
    payment_method: z.uhrada,
    // Prijatá faktúra nemá stav „odovzdaná" — zaúčtovaná je najbližšie.
    status: o.stav === "new" ? "received" : "booked",
    source: "import",
    note: poznamkaImportu(z, o.zdrojAplikacie),
    items: z.polozky.length
      ? z.polozky.map((p) => ({ ...p, unit: null as string | null }))
      : null,
  };
}

/**
 * Riadok výdavkového dokladu (bločku). Hotovosť ovplyvní stav pokladne —
 * pri presune starých dokladov sa to zväčša nechce, preto `doPokladne`.
 */
export function riadokBlocku(
  z: PrijatyZaznam,
  o: { stav: StavImportu; dnes: string; zdrojAplikacie: string; doPokladne: boolean },
) {
  const s = sumy(z);
  const hotovostMimo = z.uhrada === "hotovost" && !o.doPokladne;
  const now = new Date().toISOString();
  return {
    status: o.stav,
    source: "import",
    supplier_name: z.dodavatel,
    supplier_ico: z.ico,
    supplier_ic_dph: z.icDph,
    document_number: z.cislo,
    issue_date: z.vystavenie ?? o.dnes,
    total_amount: s.spolu,
    vat_amount: s.dph,
    net_amount: s.zaklad,
    currency: z.mena || "EUR",
    payment_method: hotovostMimo ? null : z.uhrada,
    note: [
      poznamkaImportu(z, o.zdrojAplikacie),
      hotovostMimo ? "Platené v hotovosti — do pokladne sa nezapočítalo." : null,
    ]
      .filter(Boolean)
      .join("\n"),
    items: z.polozky.length ? z.polozky : null,
    processed_at: o.stav === "new" ? null : now,
    exported_at: o.stav === "exported" ? now : null,
  };
}

/**
 * Doklad zo skenu, ktorý nemal pár v XML ani v tabuľke — prečítala ho AI.
 * Faktúru od bločku odlíši číslo faktúry, variabilný symbol alebo splatnosť.
 */
export function zaznamZAI(ai: Record<string, unknown>, meno: string): PrijatyZaznam {
  const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const jeFaktura = Boolean(t(ai.invoice_number) || t(ai.variable_symbol) || datumZTextu(ai.due_date));
  const polozky = Array.isArray(ai.items)
    ? (ai.items as any[])
        .filter((p) => p && t(p.name))
        .map((p) => ({
          name: String(p.name).trim(),
          quantity: cisloZTextu(p.quantity) ?? 1,
          unit_price: cisloZTextu(p.unit_price) ?? 0,
          vat_rate: cisloZTextu(p.vat_rate) ?? 0,
          total: cisloZTextu(p.total) ?? 0,
        }))
    : [];
  return {
    typ: jeFaktura ? "faktura" : "blocek",
    zdroj: `sken ${meno}`,
    cislo: t(ai.invoice_number),
    dodavatel: t(ai.supplier_name),
    ico: t(ai.supplier_ico),
    dic: t(ai.supplier_dic),
    icDph: t(ai.supplier_ic_dph),
    iban: t(ai.supplier_iban)?.replace(/\s/g, "").toUpperCase() ?? null,
    vs: t(ai.variable_symbol),
    vystavenie: datumZTextu(ai.issue_date),
    splatnost: datumZTextu(ai.due_date),
    zaklad: cisloZTextu(ai.amount_without_vat),
    dph: cisloZTextu(ai.vat_amount),
    spolu: cisloZTextu(ai.amount_total),
    mena: (t(ai.currency) ?? "EUR").toUpperCase().slice(0, 3),
    uhrada: null,
    poznamka: null,
    druh: null,
    polozky,
  };
}
