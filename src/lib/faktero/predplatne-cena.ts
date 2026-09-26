/**
 * Cena predplatného, ktorá sa naozaj strhne.
 *
 * V `subscription_plans` sú ceny **bez DPH** (9 € Starter, 19 € Premium) a tak
 * ich uvádza aj cenník. Tobify je platiteľ DPH, takže z karty musí odísť suma
 * s daňou — doteraz brána strhávala 9,00 € a doklad tých istých 9 € považoval
 * za sumu vrátane dane, čiže zákazník platil menej, než čo mu web sľúbil.
 *
 * Jedno miesto pravdy pre oba konce: čo sa strhne a čo sa vyfakturuje.
 */
import { pripocitajMesiace } from "./opakovane";

export const SADZBA_DPH_PREDPLATNEHO = 23;

/** Z ceny bez DPH spraví sumu s DPH, zaokrúhlenú na cent. */
export function sumaSDph(cenaBezDphCentov: number, sadzba = SADZBA_DPH_PREDPLATNEHO): number {
  if (!Number.isFinite(cenaBezDphCentov) || cenaBezDphCentov <= 0) return 0;
  return Math.round(cenaBezDphCentov * (1 + sadzba / 100));
}

/** Opačný smer — z účtovanej sumy vyberie základ a daň. */
export function rozpadSDph(sumaSDphCentov: number, sadzba = SADZBA_DPH_PREDPLATNEHO) {
  const zaklad = Math.round(sumaSDphCentov / (1 + sadzba / 100));
  return { zaklad, dan: sumaSDphCentov - zaklad, spolu: sumaSDphCentov };
}

/**
 * Dátum najbližšej obnovy — o mesiac neskôr, s časom dňa zachovaným.
 *
 * Orezanie dňa na koniec mesiaca (31. 1. → 28. 2., nie 3. 3.) už raz vyriešili
 * opakované faktúry, tak sa to pravidlo neopisuje druhýkrát — len sa k nemu
 * vráti čas, lebo `next_billing_at` je časová pečiatka, nie dátum.
 */
export function oMesiacNeskor(od: Date | string = new Date()): Date {
  const d = od instanceof Date ? new Date(od.getTime()) : new Date(od);
  if (Number.isNaN(d.getTime())) return new Date();
  const den = pripocitajMesiace(d.toISOString().slice(0, 10), 1);
  const cas = d.toISOString().slice(10); // „THH:MM:SS.sssZ"
  return new Date(den + cas);
}
