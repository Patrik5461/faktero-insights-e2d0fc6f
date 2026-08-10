/**
 * Cenník — akú cenu dostane konkrétny odberateľ za konkrétny produkt.
 *
 * Zdroje ceny, od najsilnejšieho po najslabší:
 *
 *   1. **Individuálna cena odberateľa** — dohodnutá cena pre tohto odberateľa.
 *      Platí bez ohľadu na to, či je vyššia alebo nižšia ako základná. Práve
 *      preto tu nemôže vyhrávať „najnižšia cena": stáli odberatelia majú občas
 *      dohodnutú cenu vyššiu (servis, prioritné dodanie) a tá musí prejsť.
 *   2. **Cena cenovej skupiny** — veľkoobchod, stavebníci, e-shop.
 *   3. **Zľava v percentách** zo základnej ceny. Zľava odberateľa prebíja zľavu
 *      skupiny; nesčítavajú sa.
 *   4. **Základná cena produktu.**
 *
 * Cenová akcia sa vyhodnocuje až nad týmto výsledkom a **uplatní sa len vtedy,
 * keď je výhodnejšia**. Akcia je marketing, nemá odberateľovi zdvihnúť cenu,
 * ktorú má dohodnutú.
 *
 * Množstevné ceny: z cien pre daného odberateľa/skupinu sa vyberie tá s
 * najvyšším `min_quantity`, ktoré ešte nepresahuje objednané množstvo.
 *
 * Sumy z PostgREST chodia ako reťazce (`numeric` sa neserializuje na číslo),
 * takže všetko ide cez `cislo()`.
 */

/** `numeric` chodí z PostgREST ako reťazec, prázdne pole z formulára ako "". */
export type Ciselna = number | string | null | undefined;

export type Cena = {
  /** Presne jedno z dvojice je vyplnené — buď cena pre odberateľa, alebo pre skupinu. */
  customer_id?: string | null;
  price_group_id?: string | null;
  product_id?: string | null;
  unit_price?: Ciselna;
  min_quantity?: Ciselna;
};

export type Akcia = {
  id?: string;
  name?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  /** Zľava v % zo základnej ceny produktu. */
  discount_percent?: Ciselna;
  /** Pevná akciová cena. Ak je vyplnená, percentá sa ignorujú. */
  unit_price?: Ciselna;
  product_id?: string | null;
  active?: boolean | null;
};

export type ZdrojCeny =
  | "zakladna"
  | "individualna"
  | "skupina"
  | "zlava-odberatel"
  | "zlava-skupina"
  | "akcia";

export type Vysledok = {
  cena: number;
  zdroj: ZdrojCeny;
  /** Ľudský popis do formulára — „Akcia Jarný výpredaj −15 %". */
  dovod: string;
  /** Základná cena, aby sa dal ukázať preškrtnutý pôvodok. */
  zakladna: number;
  akcia?: { id?: string; name?: string | null } | null;
};

export function cislo(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Ceny sa zaokrúhľujú na centy — faktúra ich aj tak zobrazuje na dve miesta. */
export function centy(n: number): number {
  return Math.round((cislo(n) + Number.EPSILON) * 100) / 100;
}

/** Zľava mimo rozsahu 0–100 je vždy chyba v zadaní; radšej ju orežeme, než by cena vyšla záporná. */
export function zlavaVRozsahu(v: unknown): number {
  const n = cislo(v);
  if (n <= 0) return 0;
  return n >= 100 ? 100 : n;
}

export function poZlave(zakladna: number, percent: unknown): number {
  return centy(cislo(zakladna) * (1 - zlavaVRozsahu(percent) / 100));
}

/**
 * Platí akcia k dátumu dokladu? Obe hranice sú vrátane — akcia „od 1. do 31."
 * platí aj prvého, aj posledného. Prázdne `valid_to` znamená bez konca.
 */
export function akciaPlati(a: Akcia, datum: string): boolean {
  if (a.active === false) return false;
  if (!datum) return false;
  if (a.valid_from && datum < a.valid_from) return false;
  if (a.valid_to && datum > a.valid_to) return false;
  return true;
}

/** Cena z akcie. `null` znamená, že akcia pre tento produkt cenu neurčuje. */
export function cenaZAkcie(a: Akcia, zakladna: number): number | null {
  if (a.unit_price !== null && a.unit_price !== undefined && a.unit_price !== "") {
    return centy(Math.max(0, cislo(a.unit_price)));
  }
  const z = zlavaVRozsahu(a.discount_percent);
  if (z === 0) return null;
  return poZlave(zakladna, z);
}

/**
 * Z cien pre jedného adresáta (odberateľ alebo skupina) vyberie tú, ktorá
 * zodpovedá objednanému množstvu — teda s najvyšším `min_quantity`, ktoré ešte
 * množstvo nepresahuje. Bez množstevných cien je `min_quantity` nula a vyhrá
 * jediný riadok.
 */
export function cenaPodlaMnozstva(ceny: Cena[], mnozstvo: number): Cena | null {
  let najlepsia: Cena | null = null;
  let najvyssiPrah = -1;
  for (const c of ceny) {
    const prah = cislo(c.min_quantity);
    if (prah > cislo(mnozstvo)) continue;
    if (prah > najvyssiPrah) {
      najvyssiPrah = prah;
      najlepsia = c;
    }
  }
  return najlepsia;
}

export type Vstup = {
  /** Základná cena produktu z katalógu. */
  zakladna: Ciselna;
  /** Ceny, ktoré sa týkajú tohto produktu — pre odberateľa aj pre jeho skupinu. */
  ceny?: Cena[];
  /** Akcie, ktoré sa týkajú tohto produktu (alebo platia na všetko). */
  akcie?: Akcia[];
  customer_id?: string | null;
  price_group_id?: string | null;
  /** Zľava odberateľa v %. */
  zlavaOdberatela?: Ciselna;
  /** Zľava cenovej skupiny v %. */
  zlavaSkupiny?: Ciselna;
  /** Dátum dokladu — podľa neho sa posudzuje platnosť akcií. */
  datum?: string;
  mnozstvo?: Ciselna;
};

export function cenaPreOdberatela(v: Vstup): Vysledok {
  const zakladna = centy(Math.max(0, cislo(v.zakladna)));
  const mnozstvo = cislo(v.mnozstvo ?? 1);
  const ceny = v.ceny ?? [];

  let cena = zakladna;
  let zdroj: ZdrojCeny = "zakladna";
  let dovod = "Základná cena";

  // 1.–2. dohodnutá cena. Cena odberateľa prebíja cenu skupiny.
  const preOdberatela = v.customer_id
    ? cenaPodlaMnozstva(
        ceny.filter((c) => c.customer_id && c.customer_id === v.customer_id),
        mnozstvo,
      )
    : null;
  const preSkupinu = v.price_group_id
    ? cenaPodlaMnozstva(
        ceny.filter((c) => c.price_group_id && c.price_group_id === v.price_group_id),
        mnozstvo,
      )
    : null;

  if (preOdberatela) {
    cena = centy(Math.max(0, cislo(preOdberatela.unit_price)));
    zdroj = "individualna";
    dovod =
      cislo(preOdberatela.min_quantity) > 0
        ? `Individuálna cena od ${cislo(preOdberatela.min_quantity)} ks`
        : "Individuálna cena odberateľa";
  } else if (preSkupinu) {
    cena = centy(Math.max(0, cislo(preSkupinu.unit_price)));
    zdroj = "skupina";
    dovod =
      cislo(preSkupinu.min_quantity) > 0
        ? `Cena cenovej skupiny od ${cislo(preSkupinu.min_quantity)} ks`
        : "Cena cenovej skupiny";
  } else {
    // 3. percentuálna zľava. Odberateľova prebíja skupinovú, nesčítavajú sa.
    const zo = zlavaVRozsahu(v.zlavaOdberatela);
    const zs = zlavaVRozsahu(v.zlavaSkupiny);
    if (zo > 0) {
      cena = poZlave(zakladna, zo);
      zdroj = "zlava-odberatel";
      dovod = `Zľava odberateľa ${formatZlava(zo)} %`;
    } else if (zs > 0) {
      cena = poZlave(zakladna, zs);
      zdroj = "zlava-skupina";
      dovod = `Zľava cenovej skupiny ${formatZlava(zs)} %`;
    }
  }

  // 4. akcia — len ak je výhodnejšia než to, čo odberateľ dostal doteraz.
  const datum = v.datum ?? "";
  let najlepsiaAkcia: { a: Akcia; cena: number } | null = null;
  for (const a of v.akcie ?? []) {
    if (!akciaPlati(a, datum)) continue;
    const ca = cenaZAkcie(a, zakladna);
    if (ca === null) continue;
    if (!najlepsiaAkcia || ca < najlepsiaAkcia.cena) najlepsiaAkcia = { a, cena: ca };
  }

  if (najlepsiaAkcia && najlepsiaAkcia.cena < cena) {
    const a = najlepsiaAkcia.a;
    const zl = zlavaVRozsahu(a.discount_percent);
    const maPevnu = a.unit_price !== null && a.unit_price !== undefined && a.unit_price !== "";
    return {
      cena: najlepsiaAkcia.cena,
      zdroj: "akcia",
      dovod: `Akcia ${a.name ?? ""}`.trim() + (!maPevnu && zl > 0 ? ` −${formatZlava(zl)} %` : ""),
      zakladna,
      akcia: { id: a.id, name: a.name ?? null },
    };
  }

  return { cena, zdroj, dovod, zakladna, akcia: null };
}

function formatZlava(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
}

/** Koľko odberateľ ušetril oproti základnej cene. Záporné číslo znamená príplatok. */
export function uspora(v: Vysledok): number {
  return centy(v.zakladna - v.cena);
}

/**
 * Podklady pre celý doklad — server ich pošle raz a formulár z nich počíta
 * cenu každého riadku zvlášť. Musí to byť takto: množstevná cena závisí od
 * množstva na riadku, takže cena spočítaná na serveri „pre jeden kus" by
 * veľkoodberateľom nikdy nezabrala.
 */
export type Podklady = {
  customer_id?: string | null;
  price_group_id?: string | null;
  zlavaOdberatela?: Ciselna;
  zlavaSkupiny?: Ciselna;
  datum: string;
  /** Dohodnuté ceny, ktoré sa tohto odberateľa a jeho skupiny týkajú. */
  ceny: (Cena & { product_id?: string | null })[];
  akcie: (Akcia & {
    applies_to_all?: boolean | null;
    produkty?: { product_id: string; unit_price?: Ciselna }[];
  })[];
};

export const PRAZDNE_PODKLADY: Podklady = { datum: "", ceny: [], akcie: [] };

/** Ceny, ktoré sa týkajú daného produktu — z akcií vyberie tú správnu vetvu. */
export function akcieNaProdukt(p: Podklady, productId: string): Akcia[] {
  const out: Akcia[] = [];
  for (const a of p.akcie ?? []) {
    const polozka = (a.produkty ?? []).find((x) => x.product_id === productId);
    if (polozka) {
      // Akciová cena na položke prebíja percentá celej akcie.
      out.push({ ...a, unit_price: polozka.unit_price ?? undefined });
    } else if (a.applies_to_all) {
      out.push({ ...a, unit_price: undefined });
    }
  }
  return out;
}

export function cenaZPodkladov(
  p: Podklady,
  produkt: { id: string; unit_price: Ciselna },
  mnozstvo: Ciselna = 1,
): Vysledok {
  return cenaPreOdberatela({
    zakladna: produkt.unit_price,
    ceny: (p.ceny ?? []).filter((c) => c.product_id === produkt.id),
    akcie: akcieNaProdukt(p, produkt.id),
    customer_id: p.customer_id ?? null,
    price_group_id: p.price_group_id ?? null,
    zlavaOdberatela: p.zlavaOdberatela,
    zlavaSkupiny: p.zlavaSkupiny,
    datum: p.datum,
    mnozstvo,
  });
}
