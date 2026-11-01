/**
 * Znamienko skladového pohybu.
 *
 * V tabuľke `stock_movements` je množstvo uložené **kladne** aj pri výdaji —
 * o smer sa stará stĺpec `type` a databázový trigger, ktorý podľa neho zmení
 * stav skladu. Kto sčítava alebo zobrazuje `quantity` samotné, dostane výdaj
 * ako prírastok: v zozname pohybov potom svieti „+3" zeleným aj pri výdajke.
 *
 * Pravidlo je rovnaké ako v triggeri `stock_movements`:
 * príjem a dobropis pridávajú, výdaj a faktúra uberajú, oprava a inventúra
 * nesú znamienko samy v sebe.
 */

export type PohybTyp = "prijem" | "vydaj" | "oprava" | "inventura" | "faktura" | "dobropis";

export function pohybDelta(typ: string | null | undefined, mnozstvo: unknown): number {
  const q = Number(mnozstvo);
  if (!Number.isFinite(q)) return 0;
  switch (typ) {
    case "prijem":
    case "dobropis":
      return Math.abs(q);
    case "vydaj":
    case "faktura":
      return -Math.abs(q);
    default:
      // Oprava a inventúra sa zapisujú aj so záporným množstvom.
      return q;
  }
}

/** Názvy pohybov tak, ako ich má vidieť človek. */
export const POHYB_NAZOV: Record<string, string> = {
  prijem: "Príjem",
  vydaj: "Výdaj",
  oprava: "Oprava",
  inventura: "Inventúra",
  faktura: "Faktúra",
  dobropis: "Dobropis",
};

export function pohybNazov(typ: string | null | undefined): string {
  return POHYB_NAZOV[String(typ ?? "")] ?? String(typ ?? "—");
}

/**
 * Hodnota pohybu v nákladovej cene.
 *
 * `total_value` je pri výdaji uložené v **predajnej** cene (výdajka si pamätá,
 * za koľko tovar odchádza), takže v prehľade skladu sedelo množstvo a vážená
 * cena, ale hodnota riadku bola z iného sveta: 10 ks × 9,13 € svietilo ako
 * 125 €. Kde poznáme `unit_cost`, počítame z neho.
 */
export function hodnotaPohybu(p: {
  quantity?: unknown;
  unit_cost?: unknown;
  total_value?: unknown;
}): number {
  const mnozstvo = Math.abs(Number(p.quantity) || 0);
  const jednotkova = Number(p.unit_cost);
  if (Number.isFinite(jednotkova) && jednotkova > 0) return jednotkova * mnozstvo;
  const hodnota = Number(p.total_value);
  return Number.isFinite(hodnota) ? Math.abs(hodnota) : 0;
}

/** „+3" / „−3" — mínus je typografické, nie spojovník. */
export function pohybText(typ: string | null | undefined, mnozstvo: unknown): string {
  const d = pohybDelta(typ, mnozstvo);
  const cislo = new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 3 }).format(Math.abs(d));
  if (d > 0) return `+${cislo}`;
  if (d < 0) return `−${cislo}`;
  return cislo;
}

/**
 * Cena, ktorou sa oceňuje zásoba: vážená nákupná (`avg_purchase_price`), a kým
 * karta priemer nemá (žiadny príjem), posledná nákupná.
 *
 * Jedno miesto pre Prehľad skladu, Hodnotu skladu, detail karty aj export.
 * Detail karty a export predtým násobili poslednou nákupnou cenou, takže na
 * 23 kartách ukazovali iné číslo než Prehľad.
 */
export function cenaOcenenia(karta: {
  avg_purchase_price?: unknown;
  purchase_price?: unknown;
}): number {
  const priemer = Number(karta.avg_purchase_price);
  if (Number.isFinite(priemer) && priemer > 0) return priemer;
  const nakup = Number(karta.purchase_price);
  return Number.isFinite(nakup) && nakup > 0 ? nakup : 0;
}

/** Hodnota zásoby = množstvo × cena ocenenia. */
export function hodnotaZasoby(
  mnozstvo: unknown,
  karta: { avg_purchase_price?: unknown; purchase_price?: unknown },
): number {
  const q = Number(mnozstvo);
  return (Number.isFinite(q) ? q : 0) * cenaOcenenia(karta);
}

/**
 * Jednotková cena pohybu v nákladovej cene — tá istá, z ktorej ráta
 * `hodnotaPohybu`. `unit_price` je pri výdaji predajná cena.
 */
export function nakladovaCenaPohybu(p: { unit_cost?: unknown; unit_price?: unknown }): number {
  const c = Number(p.unit_cost);
  if (Number.isFinite(c) && c > 0) return c;
  const u = Number(p.unit_price);
  return Number.isFinite(u) ? u : 0;
}

/**
 * Hranice filtra „Od – Do“ (RRRR-MM-DD) ako ISO časy v miestnom čase.
 * `new Date("2026-11-01")` je polnoc UTC, teda 01:00/02:00 v Bratislave —
 * pohyby z prvej hodiny dňa „Od“ z filtra vypadli (SA-16).
 */
export function hraniceDniPohybov(
  od?: string | null,
  po?: string | null,
): { od: string | null; po: string | null } {
  const den = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? [Number(m[1]), Number(m[2]) - 1, Number(m[3])] : null;
  };
  const a = od ? den(od) : null;
  const b = po ? den(po) : null;
  return {
    od: a ? new Date(a[0], a[1], a[2], 0, 0, 0, 0).toISOString() : null,
    po: b ? new Date(b[0], b[1], b[2], 23, 59, 59, 999).toISOString() : null,
  };
}
