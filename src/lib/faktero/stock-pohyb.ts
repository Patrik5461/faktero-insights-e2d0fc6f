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

/** „+3" / „−3" — mínus je typografické, nie spojovník. */
export function pohybText(typ: string | null | undefined, mnozstvo: unknown): string {
  const d = pohybDelta(typ, mnozstvo);
  const cislo = new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 3 }).format(Math.abs(d));
  if (d > 0) return `+${cislo}`;
  if (d < 0) return `−${cislo}`;
  return cislo;
}
