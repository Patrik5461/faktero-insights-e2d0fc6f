/*
  Samofakturácia (§ 72 ods. 4 zákona o DPH, čl. 224 smernice 2006/112/ES).

  Faktúru za dodávateľa vyhotoví odberateľ — typicky výkupca od drobných
  dodávateľov, provízie obchodným zástupcom alebo autor a vydavateľ. Treba na
  to vopred písomnú dohodu a dodávateľ musí každú takú faktúru odsúhlasiť.
  Faktúra je stále **jeho** — v hlavičke ako dodávateľ, so svojím IČ DPH a
  svojím režimom dane; za správnosť dane zodpovedá on. Pre nás je to prijatá
  faktúra, preto žije v `purchase_invoices` s príznakom `samofakturacia`.

  Do výkazov k DPH ani na úhradu ide až odsúhlasená. Neodsúhlasená je len
  návrh, ktorý si dodávateľ ešte môže rozmyslieť.
*/

/** Veta, ktorú § 74 ods. 1 písm. n) vyžaduje na faktúre vyhotovenej odberateľom. */
export const VETA_SAMOFAKTURACIA = "Vyhotovenie faktúry odberateľom";

export type StavSamofaktury = "koncept" | "caka" | "odsuhlasena" | "zamietnuta";

export const NAZVY_STAVOV: Record<StavSamofaktury, string> = {
  koncept: "Koncept",
  caka: "Čaká na dodávateľa",
  odsuhlasena: "Odsúhlasená",
  zamietnuta: "Dodávateľ nesúhlasí",
};

/** Stav z riadku `purchase_invoices` — koncept nemá stav v databáze. */
export function stavSamofaktury(r: { samofakturacia_stav?: string | null }): StavSamofaktury {
  const s = r.samofakturacia_stav;
  return s === "caka" || s === "odsuhlasena" || s === "zamietnuta" ? s : "koncept";
}

export type DohodaKontaktu = {
  samofakturacia_od?: string | null;
  samofakturacia_do?: string | null;
};

/**
 * Platí dohoda v deň vyhotovenia? Bez dňa „od" dohoda nie je — zákon chce
 * dohodu uzavretú vopred, nie dodatočne.
 */
export function dohodaPlati(k: DohodaKontaktu | null | undefined, den: string): boolean {
  const od = String(k?.samofakturacia_od ?? "").slice(0, 10);
  const doDna = String(k?.samofakturacia_do ?? "").slice(0, 10);
  if (!od || !den) return false;
  if (den < od) return false;
  return !doDna || den <= doDna;
}

/** Prečo sa samofaktúra vystaviť nedá; `null` = dá sa. */
export function chybaDohody(k: DohodaKontaktu | null | undefined, den: string): string | null {
  if (!k?.samofakturacia_od) {
    return "S týmto dodávateľom nemáte zapísanú dohodu o samofakturácii. Doplňte ju v adresári — bez písomnej dohody uzavretej vopred faktúru za dodávateľa vyhotoviť nemôžete.";
  }
  if (den < String(k.samofakturacia_od).slice(0, 10)) {
    return `Dohoda o samofakturácii platí až od ${datumSk(k.samofakturacia_od)} — faktúru s dátumom vyhotovenia ${datumSk(den)} pokryť nemôže.`;
  }
  if (k.samofakturacia_do && den > String(k.samofakturacia_do).slice(0, 10)) {
    return `Dohoda o samofakturácii skončila ${datumSk(k.samofakturacia_do)}. Predĺžte ju v adresári, ak stále platí.`;
  }
  return null;
}

function datumSk(d: string | null | undefined): string {
  const [r, m, dn] = String(d ?? "").slice(0, 10).split("-");
  return r && m && dn ? `${Number(dn)}. ${Number(m)}. ${r}` : String(d ?? "");
}

export type PolozkaSamofaktury = {
  name: string;
  description?: string | null;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  /** Zľava na riadku v %; je už v sume riadku (`total`). */
  discount_percent?: number | null;
  vat_rate: number;
  /** Suma bez DPH za riadok po zľave. */
  total: number;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Riadok s dopočítaným základom; neplatiteľ dane má sadzbu vždy 0.
 *
 * Pri prenesení daňovej povinnosti sadzba ostáva — daň z nej si vypočítame
 * my (samozdanenie), na doklade sa len nevyčísli.
 */
export function prepocitajPolozku(
  p: {
    name?: string;
    description?: string | null;
    quantity?: unknown;
    unit?: string | null;
    unit_price?: unknown;
    discount_percent?: unknown;
    vat_rate?: unknown;
  },
  platitel: boolean,
): PolozkaSamofaktury {
  const quantity = Number(p.quantity) || 0;
  const unit_price = Number(p.unit_price) || 0;
  const zlava = Math.min(Math.max(Number(p.discount_percent) || 0, 0), 100);
  return {
    name: String(p.name ?? "").trim(),
    description: String(p.description ?? "").trim() || null,
    quantity,
    unit: p.unit ? String(p.unit) : null,
    unit_price,
    discount_percent: zlava || null,
    vat_rate: platitel ? Number(p.vat_rate) || 0 : 0,
    total: r2(quantity * unit_price * (1 - zlava / 100)),
  };
}

export type SumySamofaktury = {
  zaklad: number;
  dan: number;
  spolu: number;
  /** Rozpis podľa sadzieb — daň sa počíta zo súčtu za sadzbu, nie po riadkoch. */
  sadzby: { sadzba: number; zaklad: number; dan: number }[];
};

/**
 * Súčty samofaktúry. Zľava na celý doklad (suma bez DPH) sa rozpočíta na
 * sadzby pomerne k ich základu — inak by daň vyšla z nezľavneného základu.
 * Halier zo zaokrúhlenia dorovná posledná sadzba.
 */
export function sumySamofaktury(
  polozky: PolozkaSamofaktury[],
  zlavaDokladu = 0,
): SumySamofaktury & { zlava: number } {
  const mapa = new Map<number, number>();
  for (const p of polozky) mapa.set(p.vat_rate, r2((mapa.get(p.vat_rate) ?? 0) + p.total));
  const povodne = [...mapa.entries()].sort((a, b) => b[0] - a[0]);
  const zakladSpolu = r2(povodne.reduce((s, [, z]) => s + z, 0));
  const zlava = zakladSpolu > 0 ? r2(Math.min(Math.max(zlavaDokladu, 0), zakladSpolu)) : 0;
  const k = zakladSpolu > 0 ? (zakladSpolu - zlava) / zakladSpolu : 1;
  const ciel = r2(zakladSpolu - zlava);
  let pocitane = 0;
  const sadzby = povodne.map(([sadzba, z], i) => {
    const zaklad = i === povodne.length - 1 ? r2(ciel - pocitane) : r2(z * k);
    pocitane = r2(pocitane + zaklad);
    return { sadzba, zaklad, dan: r2((zaklad * sadzba) / 100) };
  });
  const zaklad = r2(sadzby.reduce((s, x) => s + x.zaklad, 0));
  const dan = r2(sadzby.reduce((s, x) => s + x.dan, 0));
  return { zaklad, dan, spolu: r2(zaklad + dan), sadzby, zlava };
}

/** Zľava na doklad v sume bez DPH — z percent alebo pevnej sumy. */
export function zlavaDokladuSuma(
  polozky: PolozkaSamofaktury[],
  typ: string | null | undefined,
  hodnota: unknown,
): number {
  const zaklad = r2(polozky.reduce((s, p) => s + p.total, 0));
  const h = Number(hodnota) || 0;
  if (!typ || h <= 0 || zaklad <= 0) return 0;
  const suma = typ === "percent" ? (zaklad * Math.min(h, 100)) / 100 : h;
  return r2(Math.min(suma, zaklad));
}

/** Dodávateľ je platiteľ, keď má IČ DPH — samofaktúra nesie jeho režim, nie náš. */
export function dodavatelPlatitel(icDph: string | null | undefined): boolean {
  return Boolean(String(icDph ?? "").trim());
}

/**
 * Do výkazov k DPH, na úhradu a do exportov ide samofaktúra až po
 * odsúhlasení. Obyčajná prijatá faktúra prechádza vždy.
 */
export function zapocitatelna(r: {
  samofakturacia?: boolean | null;
  samofakturacia_stav?: string | null;
}): boolean {
  return !r.samofakturacia || r.samofakturacia_stav === "odsuhlasena";
}

export type PrenesenieSamofaktury = {
  reverse_charge?: boolean | null;
  reverse_charge_type?: string | null;
  eu_plnenie?: string | null;
};

/**
 * Režim pre výkazy k DPH z pohľadu nás ako odberateľa.
 *
 * Pri prenesení daňovej povinnosti daň platíme my: tuzemské § 69 ods. 12
 * (kovový šrot, stavebné práce…) aj služba od dodávateľa z EÚ idú do r. 09/10
 * priznania, tovar z EÚ je nadobudnutie (r. 05–08). Neplatiteľ fakturuje bez
 * dane; inak sa režim odhadne podľa IČ DPH dodávateľa (`null`).
 */
export function rezimDphSamofaktury(
  r: PrenesenieSamofaktury,
  platitel: boolean,
): "samozdanenie" | "nadobudnutie" | "bez_dane" | null {
  if (r.reverse_charge) {
    return r.reverse_charge_type === "eu_b2b" && r.eu_plnenie === "tovar"
      ? "nadobudnutie"
      : "samozdanenie";
  }
  return platitel ? null : "bez_dane";
}

/**
 * Sumy, ktoré sa zapíšu na prijatú faktúru. Pri prenesení je daň tá, ktorú
 * si samozdaníme (do výkazu), ale dodávateľovi sa platí len základ.
 */
export function sumyNaZapis(
  sumy: SumySamofaktury,
  prenesenie: boolean,
): { amount_without_vat: number; vat_amount: number; amount_total: number } {
  return {
    amount_without_vat: sumy.zaklad,
    vat_amount: sumy.dan,
    amount_total: prenesenie ? sumy.zaklad : sumy.spolu,
  };
}
