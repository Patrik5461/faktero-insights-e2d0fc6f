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
  quantity: number;
  unit?: string | null;
  unit_price: number;
  vat_rate: number;
  /** Suma bez DPH za riadok. */
  total: number;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Riadok s dopočítaným základom; neplatiteľ dane má sadzbu vždy 0. */
export function prepocitajPolozku(
  p: { name?: string; quantity?: unknown; unit?: string | null; unit_price?: unknown; vat_rate?: unknown },
  platitel: boolean,
): PolozkaSamofaktury {
  const quantity = Number(p.quantity) || 0;
  const unit_price = Number(p.unit_price) || 0;
  return {
    name: String(p.name ?? "").trim(),
    quantity,
    unit: p.unit ? String(p.unit) : null,
    unit_price,
    vat_rate: platitel ? Number(p.vat_rate) || 0 : 0,
    total: r2(quantity * unit_price),
  };
}

export type SumySamofaktury = {
  zaklad: number;
  dan: number;
  spolu: number;
  /** Rozpis podľa sadzieb — daň sa počíta zo súčtu za sadzbu, nie po riadkoch. */
  sadzby: { sadzba: number; zaklad: number; dan: number }[];
};

export function sumySamofaktury(polozky: PolozkaSamofaktury[]): SumySamofaktury {
  const mapa = new Map<number, number>();
  for (const p of polozky) mapa.set(p.vat_rate, r2((mapa.get(p.vat_rate) ?? 0) + p.total));
  const sadzby = [...mapa.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([sadzba, zaklad]) => ({ sadzba, zaklad, dan: r2((zaklad * sadzba) / 100) }));
  const zaklad = r2(sadzby.reduce((s, x) => s + x.zaklad, 0));
  const dan = r2(sadzby.reduce((s, x) => s + x.dan, 0));
  return { zaklad, dan, spolu: r2(zaklad + dan), sadzby };
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
