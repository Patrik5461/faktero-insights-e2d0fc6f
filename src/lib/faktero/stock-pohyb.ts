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
