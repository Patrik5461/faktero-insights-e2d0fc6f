/**
 * Kurz do vkladaného dokladu v cudzej mene (importy, API, bločky).
 * Pravidlá výberu kurzu sú v `kurzy.server.ts` (`kurzPreDoklad`), tu sa len
 * dopĺňajú do riadku; čistá časť je v `kurz-dokladu.ts`.
 */
import { potrebujeKurz, stlpceKurzu, udajeNaKurz, type TabulkaKurzu } from "./kurz-dokladu";
import type { KrajinaKurzu, NastavenieKurzuDe, ZdrojKurzu } from "./kurzy";

type Riadok = Record<string, any>;
type Pravidlo = { krajina: KrajinaKurzu; nastavenieDe: NastavenieKurzuDe | null };
type Najdeny = { kurz: number; den: string; zdroj: ZdrojKurzu } | null;

/**
 * Doplňovač kurzov pre jednu firmu. Pri hromadnom importe sa ten istý kurz
 * (mena + deň) hľadá raz, nie pri každom doklade.
 */
export function doplnovacKurzov(companyId: string) {
  let pravidlo: Promise<Pravidlo> | null = null;
  const pamat = new Map<string, Promise<Najdeny>>();
  return async function kurzDoRiadku(tabulka: TabulkaKurzu, riadok: Riadok): Promise<Riadok> {
    try {
      const { pravidloKurzuFirmy, kurzPreDoklad } = await import("./kurzy.server");
      pravidlo ??= pravidloKurzuFirmy(companyId);
      const p = await pravidlo;
      if (!potrebujeKurz(tabulka, riadok, p.krajina)) return {};
      const { mena, datum } = udajeNaKurz(tabulka, riadok);
      const kluc = `${mena}|${datum.slice(0, 10)}`;
      if (!pamat.has(kluc))
        pamat.set(kluc, kurzPreDoklad(mena, datum.slice(0, 10), p.krajina, p.nastavenieDe));
      const k = await pamat.get(kluc)!;
      return k ? stlpceKurzu(tabulka, riadok, k, p.krajina) : {};
    } catch (e) {
      // Kurz je doplnok — doklad sa uloží aj bez neho (exporty ho potom ohlásia).
      console.warn("[kurz-dokladu]", String((e as Error)?.message ?? e));
      return {};
    }
  };
}
