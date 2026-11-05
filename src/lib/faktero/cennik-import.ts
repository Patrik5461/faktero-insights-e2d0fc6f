/*
  Hromadný export a import cenníka — produkty so základnou cenou a cenami
  cenových hladín (`price_groups` + `product_prices` s `price_group_id`).

  Všetko tu je čistá logika bez siete: čítanie a zápis tabuľky, rozpoznanie
  hlavičky, parsovanie čísel, párovanie s produktmi a plán zmien (náhľad).
  Zápis robí jedna databázová funkcia `importuj_cennik` v jednej transakcii.

  Exportovaný súbor sa musí dať bez úprav naimportovať naspäť — preto export
  aj import používajú tie isté názvy stĺpcov a prázdna bunka ceny hladiny
  znamená „nemeniť“, nie „zmazať“.

  Cena hladiny = riadok `product_prices` s `price_group_id`, bez odberateľa,
  s `min_quantity` 0 alebo 1 (cena od prvého kusu). Množstevné ceny (vyšší
  prah) export ani import nevidí a nemení ich.
*/

export type PoleProduktu = "code" | "name" | "unit" | "vat_rate" | "unit_price" | "external_id";

export const POLIA_PRODUKTU: { pole: PoleProduktu; nazov: string }[] = [
  { pole: "code", nazov: "Kód" },
  { pole: "name", nazov: "Názov" },
  { pole: "unit", nazov: "MJ" },
  { pole: "vat_rate", nazov: "Sadzba DPH" },
  { pole: "unit_price", nazov: "Základná cena bez DPH" },
  { pole: "external_id", nazov: "Externé ID" },
];

/** Predpona stĺpca s cenou hladiny v exporte: „Cena – Veľkoobchod“. */
export const PREDPONA_HLADINY = "Cena – ";

/**
 * Cieľ stĺpca v mapovaní ako reťazec (hodí sa priamo do `<select>`):
 * `pole:code`, `hladina:<uuid>` alebo `nova:<názov>` (hladina sa založí).
 */
export type Ciel = `pole:${PoleProduktu}` | `hladina:${string}` | `nova:${string}`;
export type Mapovanie = Record<number, Ciel>;

export type Hladina = { id: string; name: string };
export type ExistujuciProdukt = {
  id: string;
  code: string | null;
  name: string;
  unit: string | null;
  unit_price: number | string | null;
  vat_rate: number | string | null;
  external_id: string | null;
};
export type CenaHladiny = {
  product_id: string;
  price_group_id: string | null;
  customer_id?: string | null;
  unit_price: number | string;
  min_quantity?: number | string | null;
};

// ─── čísla ────────────────────────────────────────────────────────────────────

/**
 * Číslo z bunky: „1 234,50“, „1234.5“, „1.234,50“, „1,234.50“, „12,5 €“,
 * „23 %“. Vráti `null` pre prázdnu bunku a `NaN` pre nezmysel — volajúci
 * musí tieto dva prípady rozlíšiť (prázdna = nemeniť, nezmysel = chyba).
 */
export function parsujCislo(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  let s = String(v)
    .replace(/[\s\u00a0\u202f\u2007']/g, "")
    .replace(/(€|eur|kč|czk|%)$/i, "")
    .replace(/^(€|eur)/i, "")
    .replace(/[−–]/g, "-");
  if (!s) return null;
  const ciarka = s.lastIndexOf(",");
  const bodka = s.lastIndexOf(".");
  if (ciarka >= 0 && bodka >= 0) {
    // Oba oddeľovače: desatinný je ten posledný, druhý oddeľuje tisícky.
    s = ciarka > bodka ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (ciarka >= 0) {
    // Viac čiarok = tisícky (1,234,567), jedna = desatinná čiarka.
    s = (s.match(/,/g) ?? []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, "");
  }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}

/** Dve čísla sa rovnajú, keď sa nelíšia na 6. desatinnom mieste (ceny majú najviac 5). */
export const rovnakeCislo = (a: unknown, b: unknown) =>
  a != null && b != null && Math.abs(Number(a) - Number(b)) < 5e-7;

/** Cena do CSV so slovenskou desatinnou čiarkou — Excel ju s „;“ otvorí ako číslo. */
export function cisloDoCsv(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "";
  const x = Number(n);
  const s = Number.isInteger(Math.round(x * 100 * 1e6) / 1e6) ? x.toFixed(2) : String(x);
  return s.replace(".", ",");
}

// ─── hlavička ─────────────────────────────────────────────────────────────────

export const normalizuj = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_*:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const HLAVICKY: [PoleProduktu, RegExp][] = [
  ["external_id", /^(externe id|external ?id|ext\.? ?id|id v e-?shope|id)$/],
  [
    "code",
    /^(kod|kod produktu|kod polozky|kod tovaru|katalogove cislo|kat\.? ?cislo|objednavacie cislo|cislo produktu|cislo polozky|sku|code|product ?code|item ?code|plu|artikel ?nr\.?|artikelnummer)$/,
  ],
  [
    "name",
    /^(nazov|nazev|nazov produktu|nazev produktu|nazov polozky|nazev polozky|nazov tovaru|produkt|polozka|tovar|name|product|product ?name|bezeichnung|artikel)$/,
  ],
  ["unit", /^(mj|m\.? ?j\.?|jednotka|merna jednotka|mer\. jednotka|unit|einheit|me)$/],
  [
    "vat_rate",
    /^(sadzba dph|sazba dph|dph|dph ?%|dph \(%\)|sadzba dph ?%|sadzba|vat|vat ?rate|vat ?%|ust|mwst\.?|steuersatz)$/,
  ],
  [
    "unit_price",
    /^(zakladna cena bez dph|zakladni cena bez dph|zakladna cena|cena bez dph|cena|jednotkova cena|jednotkova cena bez dph|predajna cena|predajna cena bez dph|prodejni cena|mo cena|price|unit ?price|preis|netto ?preis|nettopreis)$/,
  ],
];

/**
 * Názov hladiny v hlavičke stĺpca s cenou: „Cena – Veľkoobchod“,
 * „Cena - VIP“, „Cena (VIP)“, „Cena VIP“. Vráti pôvodný text bez predpony
 * (s diakritikou), alebo `null`, keď stĺpec cenou hladiny nie je.
 */
export function hladinaZHlavicky(h: string): string | null {
  const t = h.trim();
  const m =
    /^cena\s*[–—-]\s*(.+)$/i.exec(t) ??
    /^cena\s*\((.+)\)$/i.exec(t) ??
    /^cena\s*hladiny\s*[:–—-]?\s*(.+)$/i.exec(t);
  return m ? m[1].trim() || null : null;
}

/**
 * Predvyplnenie mapovania podľa názvov stĺpcov. Stĺpec s cenou hladiny sa
 * priradí existujúcej hladine (bez ohľadu na veľkosť písmen a diakritiku);
 * neznámu hladinu z hlavičky „Cena – X“ navrhne založiť. Stĺpec pomenovaný
 * presne ako existujúca hladina („Veľkoobchod“) je tiež jej cena.
 */
export function navrhniMapovanie(hlavicka: string[], hladiny: Hladina[]): Mapovanie {
  const out: Mapovanie = {};
  const pouzite = new Set<string>();
  const podlaNazvu = new Map(hladiny.map((g) => [normalizuj(g.name), g]));
  hlavicka.forEach((h, i) => {
    const n = normalizuj(h ?? "");
    if (!n) return;
    const nazovHladiny = hladinaZHlavicky(h);
    if (nazovHladiny) {
      const g = podlaNazvu.get(normalizuj(nazovHladiny));
      const ciel: Ciel = g ? `hladina:${g.id}` : `nova:${nazovHladiny}`;
      const kluc = g ? ciel : `nova:${normalizuj(nazovHladiny)}`;
      if (!pouzite.has(kluc)) {
        out[i] = ciel;
        pouzite.add(kluc);
      }
      return;
    }
    for (const [p, re] of HLAVICKY) {
      if (!pouzite.has(`pole:${p}`) && re.test(n)) {
        out[i] = `pole:${p}`;
        pouzite.add(`pole:${p}`);
        return;
      }
    }
    const g = podlaNazvu.get(n);
    if (g && !pouzite.has(`hladina:${g.id}`)) {
      out[i] = `hladina:${g.id}`;
      pouzite.add(`hladina:${g.id}`);
    }
  });
  return out;
}

/** Riadok hlavičky = prvý, v ktorom sa rozpoznali aspoň dva stĺpce (nad ním býva nadpis). */
export function najdiHlavicku(riadky: string[][], hladiny: Hladina[]): number {
  const i = riadky
    .slice(0, 20)
    .findIndex((r) => Object.keys(navrhniMapovanie(r, hladiny)).length >= 2);
  return i < 0 ? 0 : i;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

/** Oddeľovač podľa prvého riadku: najčastejší z ; , a tabulátora mimo úvodzoviek. */
function zistiOddelovac(text: string): string {
  const pocty: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let vUvodzovkach = false;
  for (const ch of text) {
    if (ch === '"') vUvodzovkach = !vUvodzovkach;
    else if (!vUvodzovkach && (ch === "\n" || ch === "\r")) break;
    else if (!vUvodzovkach && ch in pocty) pocty[ch] += 1;
  }
  const [najcastejsi, pocet] = Object.entries(pocty).sort((a, b) => b[1] - a[1])[0];
  return pocet > 0 ? najcastejsi : ";";
}

/** CSV podľa RFC 4180 (úvodzovky, zdvojené úvodzovky, nové riadky v bunke). */
export function parsujCsv(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, "");
  let sep = zistiOddelovac(t);
  let zaciatok = 0;
  // Excel si vie oddeľovač zapísať do prvého riadku: „sep=;“.
  const sepRiadok = /^sep=(.)\r?\n/i.exec(t);
  if (sepRiadok) {
    sep = sepRiadok[1];
    zaciatok = sepRiadok[0].length;
  }
  const out: string[][] = [];
  let riadok: string[] = [];
  let bunka = "";
  let vUvodzovkach = false;
  for (let i = zaciatok; i < t.length; i++) {
    const ch = t[i];
    if (vUvodzovkach) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          bunka += '"';
          i++;
        } else vUvodzovkach = false;
      } else bunka += ch;
    } else if (ch === '"') vUvodzovkach = true;
    else if (ch === sep) {
      riadok.push(bunka);
      bunka = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      riadok.push(bunka);
      out.push(riadok);
      riadok = [];
      bunka = "";
    } else bunka += ch;
  }
  if (bunka !== "" || riadok.length) {
    riadok.push(bunka);
    out.push(riadok);
  }
  return out;
}

const doCsvBunky = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV pre Excel: UTF-8 s BOM, oddeľovač „;“, riadky CRLF. */
export function vytvorCsv(riadky: unknown[][]): string {
  return "\uFEFF" + riadky.map((r) => r.map(doCsvBunky).join(";")).join("\r\n") + "\r\n";
}

// ─── export ───────────────────────────────────────────────────────────────────

/** Cena od prvého kusu: bez odberateľa, s hladinou a s prahom 0 alebo 1. */
export const jeZakladnaCenaHladiny = (c: CenaHladiny) =>
  !!c.price_group_id && !c.customer_id && Number(c.min_quantity ?? 0) <= 1;

/** Mapa „produkt|hladina“ → cena od prvého kusu (pri dvoch vyhrá nižší prah). */
export function mapaCienHladin(ceny: CenaHladiny[]): Map<string, number> {
  const prah = new Map<string, number>();
  const out = new Map<string, number>();
  for (const c of ceny) {
    if (!jeZakladnaCenaHladiny(c)) continue;
    const k = `${c.product_id}|${c.price_group_id}`;
    const mq = Number(c.min_quantity ?? 0);
    if (!prah.has(k) || mq < prah.get(k)!) {
      prah.set(k, mq);
      out.set(k, Number(c.unit_price));
    }
  }
  return out;
}

export const zoradHladiny = <T extends { name: string }>(h: T[]) =>
  [...h].sort((a, b) => a.name.localeCompare(b.name, "sk"));

export type ExportCennika = {
  hlavicka: string[];
  /** Kód, Názov, MJ, Sadzba DPH, Základná cena, ceny hladín (null = bez ceny). */
  riadky: (string | number | null)[][];
};

export function exportCennika(
  produkty: ExistujuciProdukt[],
  hladiny: Hladina[],
  ceny: CenaHladiny[],
): ExportCennika {
  const h = zoradHladiny(hladiny);
  const mapa = mapaCienHladin(ceny);
  const zoradene = [...produkty].sort(
    (a, b) =>
      (a.code ?? "").localeCompare(b.code ?? "", "sk", { numeric: true }) ||
      a.name.localeCompare(b.name, "sk"),
  );
  return {
    hlavicka: [
      ...POLIA_PRODUKTU.filter((p) => p.pole !== "external_id").map((p) => p.nazov),
      ...h.map((g) => PREDPONA_HLADINY + g.name),
    ],
    riadky: zoradene.map((p) => [
      p.code ?? "",
      p.name,
      p.unit ?? "",
      p.vat_rate == null ? null : Number(p.vat_rate),
      p.unit_price == null ? null : Number(p.unit_price),
      ...h.map((g) => mapa.get(`${p.id}|${g.id}`) ?? null),
    ]),
  };
}

/** Riadky exportu ako text pre CSV (čísla s desatinnou čiarkou). */
export function exportDoCsv(e: ExportCennika): string {
  return vytvorCsv([
    e.hlavicka,
    ...e.riadky.map((r) =>
      r.map((v, i) =>
        typeof v === "number" ? (i === 3 ? String(v).replace(".", ",") : cisloDoCsv(v)) : v,
      ),
    ),
  ]);
}

// ─── plán importu ─────────────────────────────────────────────────────────────

export type ZmenaCeny = {
  riadok: number;
  produkt: string;
  /** „Základná cena“ alebo názov hladiny. */
  co: string;
  stara: number | null;
  /** `null` = cena hladiny sa zmaže. */
  nova: number | null;
};

export type ChybaRiadku = { riadok: number; hodnoty: string[]; chyba: string };

/** Jedna položka pre `importuj_cennik` — posiela sa len to, čo sa mení. */
export type PolozkaImportu = {
  riadok: number;
  product_id: string | null;
  code?: string;
  name?: string;
  unit?: string;
  vat_rate?: number;
  unit_price?: number;
  external_id?: string;
  /** `cena: null` = zmazať cenu hladiny. */
  ceny: { hladina_id?: string; hladina?: string; cena: number | null }[];
};

export type PlanImportu = {
  /** Riadky so súborom spárované alebo nové, bez chyby. */
  spracovane: number;
  noveProdukty: { riadok: number; code: string; name: string }[];
  zmeneneCeny: ZmenaCeny[];
  /** Produkty, ktorým sa mení názov, MJ, sadzba DPH, kód alebo externé ID. */
  zmeneneUdaje: number;
  nezmenene: number;
  chyby: ChybaRiadku[];
  noveHladiny: string[];
  polozky: PolozkaImportu[];
};

export type MoznostiImportu = {
  vytvoritChybajuce: boolean;
  prazdnaZmaze: boolean;
  /** Sadzba DPH pre nový produkt, keď ju súbor nemá. */
  predvolenaSadzba: number;
  predvolenaMj?: string;
};

const textBunky = (v: unknown) => {
  const s = v == null ? "" : String(v).replace(/\s+/g, " ").trim();
  return s || null;
};
const klucKodu = (s: string) => s.trim().toLowerCase();

export function naplanujImport(
  hlavicka: string[],
  riadky: string[][],
  mapovanie: Mapovanie,
  produkty: ExistujuciProdukt[],
  hladiny: Hladina[],
  ceny: CenaHladiny[],
  m: MoznostiImportu,
  /** Číslo prvého dátového riadku v súbore — do hlášok a chybových riadkov. */
  prvyRiadok = 2,
): PlanImportu {
  const nazovHladiny = new Map(hladiny.map((g) => [g.id, g.name]));
  const mapa = mapaCienHladin(ceny);

  const stlpecPola = new Map<PoleProduktu, number>();
  const stlpceHladin: { i: number; id?: string; nova?: string; nazov: string }[] = [];
  const noveHladiny: string[] = [];
  for (const [k, ciel] of Object.entries(mapovanie)) {
    const i = Number(k);
    if (ciel.startsWith("pole:")) stlpecPola.set(ciel.slice(5) as PoleProduktu, i);
    else if (ciel.startsWith("hladina:")) {
      const id = ciel.slice(8);
      if (nazovHladiny.has(id)) stlpceHladin.push({ i, id, nazov: nazovHladiny.get(id)! });
    } else if (ciel.startsWith("nova:")) {
      const nazov = ciel.slice(5).trim();
      if (!nazov) continue;
      // Hladina medzitým založená ručne — rovno jej id.
      const g = hladiny.find((x) => normalizuj(x.name) === normalizuj(nazov));
      if (g) stlpceHladin.push({ i, id: g.id, nazov: g.name });
      else {
        stlpceHladin.push({ i, nova: nazov, nazov });
        if (!noveHladiny.some((n) => normalizuj(n) === normalizuj(nazov))) noveHladiny.push(nazov);
      }
    }
  }

  // Indexy existujúcich produktov. Dvojznačný kľúč (dva produkty s rovnakým
  // kódom alebo názvom) sa nepáruje — radšej chyba než prepis cudzej ceny.
  const index = (kluc: (p: ExistujuciProdukt) => string | null) => {
    const out = new Map<string, ExistujuciProdukt | "viac">();
    for (const p of produkty) {
      const k = kluc(p);
      if (!k) continue;
      out.set(k, out.has(k) ? "viac" : p);
    }
    return out;
  };
  const podlaKodu = index((p) => (p.code?.trim() ? klucKodu(p.code) : null));
  const podlaExt = index((p) => p.external_id?.trim() || null);
  const podlaNazvu = index((p) => p.name?.trim() || null);

  const plan: PlanImportu = {
    spracovane: 0,
    noveProdukty: [],
    zmeneneCeny: [],
    zmeneneUdaje: 0,
    nezmenene: 0,
    chyby: [],
    noveHladiny,
    polozky: [],
  };
  const pouziteProdukty = new Map<string, number>();
  const noveKody = new Map<string, number>();

  riadky.forEach((r, idx) => {
    const cisloRiadku = prvyRiadok + idx;
    if (!r.some((x) => String(x ?? "").trim())) return;
    const hodnoty = hlavicka.map((_, i) => String(r[i] ?? ""));
    for (let i = hlavicka.length; i < r.length; i++) hodnoty.push(String(r[i] ?? ""));
    const chyba = (text: string) => plan.chyby.push({ riadok: cisloRiadku, hodnoty, chyba: text });
    const bunka = (p: PoleProduktu) => {
      const i = stlpecPola.get(p);
      return i == null ? null : textBunky(r[i]);
    };

    const code = bunka("code");
    const name = bunka("name");
    const unit = bunka("unit");
    const externalId = bunka("external_id");

    // Čísla — prázdna bunka = nemeniť, nezmysel = chyba celého riadku.
    const chybyCisel: string[] = [];
    const cislo = (text: string | null, stlpec: string, max?: number) => {
      if (text == null) return null;
      const n = parsujCislo(text);
      if (n == null) return null;
      if (Number.isNaN(n)) chybyCisel.push(`Neplatné číslo v stĺpci „${stlpec}“: ${text}`);
      else if (n < 0) chybyCisel.push(`Záporné číslo v stĺpci „${stlpec}“: ${text}`);
      else if (max != null && n > max)
        chybyCisel.push(`Hodnota v stĺpci „${stlpec}“ je mimo rozsahu: ${text}`);
      else return n;
      return null;
    };
    const nazovStlpca = (p: PoleProduktu) => {
      const i = stlpecPola.get(p);
      return (i != null && hlavicka[i]) || POLIA_PRODUKTU.find((x) => x.pole === p)!.nazov;
    };
    const vatRate = cislo(bunka("vat_rate"), nazovStlpca("vat_rate"), 100);
    const unitPrice = cislo(bunka("unit_price"), nazovStlpca("unit_price"));
    const cenyHladin = stlpceHladin.map((s) => {
      const text = textBunky(r[s.i]);
      return {
        ...s,
        cena: cislo(text, hlavicka[s.i] || PREDPONA_HLADINY + s.nazov),
        prazdna: text == null,
      };
    });
    if (chybyCisel.length) return chyba(chybyCisel.join("; "));

    if (!code && !externalId && !name) return chyba("Chýba kód aj názov produktu.");

    // Párovanie: kód → externé ID → presný názov. Pri externom ID a názve
    // sa nespáruje produkt s iným vyplneným kódom — to je iný tovar.
    let produkt: ExistujuciProdukt | undefined;
    const iny = (p: ExistujuciProdukt) =>
      !!code && !!p.code?.trim() && klucKodu(p.code) !== klucKodu(code);
    if (code) {
      const p = podlaKodu.get(klucKodu(code));
      if (p === "viac") return chyba(`Kód ${code} má vo Fakteri viac produktov.`);
      produkt = p;
    }
    if (!produkt && externalId) {
      const p = podlaExt.get(externalId);
      if (p && p !== "viac" && !iny(p)) produkt = p;
    }
    if (!produkt && name) {
      const p = podlaNazvu.get(name);
      if (p === "viac" && !code && !externalId)
        return chyba(`Názov „${name}“ má vo Fakteri viac produktov — doplňte kód.`);
      if (p && p !== "viac" && !iny(p)) produkt = p;
    }

    if (produkt) {
      const uz = pouziteProdukty.get(produkt.id);
      if (uz != null) return chyba(`Produkt je v súbore viackrát (prvý výskyt v riadku ${uz}).`);
      pouziteProdukty.set(produkt.id, cisloRiadku);
    }

    const polozka: PolozkaImportu = {
      riadok: cisloRiadku,
      product_id: produkt?.id ?? null,
      ceny: [],
    };
    const nazovProduktu = produkt?.name ?? name ?? code ?? "";
    const zmenyCien: ZmenaCeny[] = [];
    let zmenaUdajov = false;

    if (!produkt) {
      if (!m.vytvoritChybajuce)
        return chyba("Produkt sa vo Fakteri nenašiel (zapnite „Vytvoriť chýbajúce produkty“).");
      if (!code) return chyba("Chýba kód — nový produkt sa bez kódu nezaloží.");
      if (!name) return chyba("Chýba názov — nový produkt sa bez názvu nezaloží.");
      const uz = noveKody.get(klucKodu(code));
      if (uz != null)
        return chyba(`Kód ${code} je v súbore viackrát (prvý výskyt v riadku ${uz}).`);
      noveKody.set(klucKodu(code), cisloRiadku);
      polozka.code = code;
      polozka.name = name;
      polozka.unit = unit ?? m.predvolenaMj ?? "ks";
      polozka.vat_rate = vatRate ?? m.predvolenaSadzba;
      polozka.unit_price = unitPrice ?? 0;
      if (externalId) polozka.external_id = externalId;
      for (const c of cenyHladin) {
        if (c.cena == null) continue;
        polozka.ceny.push(
          c.id ? { hladina_id: c.id, cena: c.cena } : { hladina: c.nova!, cena: c.cena },
        );
      }
      plan.noveProdukty.push({ riadok: cisloRiadku, code, name });
      plan.polozky.push(polozka);
      plan.spracovane += 1;
      return;
    }

    // Existujúci produkt — mení sa len to, čo je v súbore vyplnené a iné.
    if (name && name !== produkt.name) {
      polozka.name = name;
      zmenaUdajov = true;
    }
    if (unit && unit !== (produkt.unit ?? "")) {
      polozka.unit = unit;
      zmenaUdajov = true;
    }
    if (vatRate != null && !rovnakeCislo(vatRate, produkt.vat_rate)) {
      polozka.vat_rate = vatRate;
      zmenaUdajov = true;
    }
    // Kód a externé ID sa len doplnia, existujúce sa neprepisujú (sú kľúčom párovania).
    if (code && !produkt.code?.trim()) {
      polozka.code = code;
      zmenaUdajov = true;
    }
    if (externalId && !produkt.external_id?.trim()) {
      polozka.external_id = externalId;
      zmenaUdajov = true;
    }
    if (unitPrice != null && !rovnakeCislo(unitPrice, produkt.unit_price)) {
      polozka.unit_price = unitPrice;
      zmenyCien.push({
        riadok: cisloRiadku,
        produkt: nazovProduktu,
        co: "Základná cena",
        stara: produkt.unit_price == null ? null : Number(produkt.unit_price),
        nova: unitPrice,
      });
    }
    for (const c of cenyHladin) {
      const stara = c.id ? (mapa.get(`${produkt.id}|${c.id}`) ?? null) : null;
      if (c.cena != null) {
        if (stara != null && rovnakeCislo(stara, c.cena)) continue;
        polozka.ceny.push(
          c.id ? { hladina_id: c.id, cena: c.cena } : { hladina: c.nova!, cena: c.cena },
        );
        zmenyCien.push({
          riadok: cisloRiadku,
          produkt: nazovProduktu,
          co: c.nazov,
          stara,
          nova: c.cena,
        });
      } else if (c.prazdna && m.prazdnaZmaze && stara != null && c.id) {
        polozka.ceny.push({ hladina_id: c.id, cena: null });
        zmenyCien.push({
          riadok: cisloRiadku,
          produkt: nazovProduktu,
          co: c.nazov,
          stara,
          nova: null,
        });
      }
    }

    plan.spracovane += 1;
    if (!zmenaUdajov && !zmenyCien.length) {
      plan.nezmenene += 1;
      return;
    }
    if (zmenaUdajov) plan.zmeneneUdaje += 1;
    plan.zmeneneCeny.push(...zmenyCien);
    plan.polozky.push(polozka);
  });

  // Nová hladina, do ktorej nejde ani jedna cena, sa nezakladá.
  plan.noveHladiny = noveHladiny.filter((n) =>
    plan.polozky.some((p) => p.ceny.some((c) => c.hladina === n)),
  );
  return plan;
}

/** Chybové riadky na stiahnutie: pôvodné stĺpce + „Chyba“, dajú sa opraviť a nahrať znova. */
export function chybyDoCsv(hlavicka: string[], chyby: ChybaRiadku[]): string {
  const sirka = Math.max(hlavicka.length, ...chyby.map((c) => c.hodnoty.length));
  const h = Array.from({ length: sirka }, (_, i) => hlavicka[i] ?? "");
  return vytvorCsv([
    ["Riadok", ...h, "Chyba"],
    ...chyby.map((c) => [
      c.riadok,
      ...Array.from({ length: sirka }, (_, i) => c.hodnoty[i] ?? ""),
      c.chyba,
    ]),
  ]);
}

// ─── súbory (SheetJS sa načíta až keď treba) ─────────────────────────────────

/** Bunky prvého hárku ako text. Čísla z Excelu idú ako čísla („12.5“), nie podľa formátu bunky. */
export async function citajTabulku(bajty: Uint8Array, nazovSuboru: string): Promise<string[][]> {
  if (/\.(csv|txt|tsv)$/i.test(nazovSuboru)) {
    const { dekoduj } = await import("./import-odberatelov");
    return parsujCsv(dekoduj(bajty));
  }
  const XLSX = await import("xlsx");
  const wb = XLSX.read(bajty, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils
    .sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" })
    .map((r) => r.map((x) => (x == null ? "" : String(x))));
}

/** XLSX s cenníkom — kód ako text (úvodné nuly), ceny ako čísla. */
export async function exportDoXlsx(e: ExportCennika): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([e.hlavicka, ...e.riadky.map((r) => r.map((v) => v ?? ""))]);
  // Kód vždy ako text, aby Excel nezjedol úvodné nuly ani dlhé čísla.
  for (let r = 1; r <= e.riadky.length; r++) {
    const adresa = XLSX.utils.encode_cell({ r, c: 0 });
    const c = ws[adresa];
    if (c) {
      c.t = "s";
      c.v = String(c.v ?? "");
    }
  }
  ws["!cols"] = e.hlavicka.map((h, i) => ({ wch: i === 1 ? 40 : Math.max(10, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cenník");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}
