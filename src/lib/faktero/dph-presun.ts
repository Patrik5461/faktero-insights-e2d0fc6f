/**
 * Rozpis DPH pri presune dokladu medzi prijatými faktúrami a bločkami
 * (`vratenie.functions.ts`, `doklad-presun.functions.ts`). Doklad nesie DPH
 * po zákonných sadzbách (`dph-pravidlo.ts`), presun ju nesmie pokaziť:
 *  - platný uložený rozpis sa prenesie, ako je,
 *  - bez rozpisu (alebo s rozpisom, ktorý nesedí s hlavičkou) jednoriadkový
 *    rozpis len vtedy, keď je DPH hlavičky čistá jedna zákonná sadzba,
 *  - DPH 0 → bez rozpisu,
 *  - inak null — nič sa nevymýšľa; spúšťač zápis odmietne s vetou, čo opraviť.
 */
import { dphZoZakladu, rozpisPreKontrolu, skontrolujDph, zakonneSadzby, type RiadokDph } from "./dph-pravidlo";
import { krajinaDane } from "./vat-rates";

export function rozpisPrePresun(
  ulozeny: unknown,
  zaklad: number,
  dph: number,
  o: { krajina?: string | null; den?: string | null; icDph?: string | null; krajinaDodavatela?: string | null },
): RiadokDph[] | null {
  const krajina = krajinaDane(o.krajina);
  const kontrola = (rozpis: RiadokDph[] | null) =>
    skontrolujDph({
      rozpis,
      zaklad,
      dph,
      krajina,
      den: o.den ?? null,
      krajinaDodavatela: o.krajinaDodavatela,
      icDphDodavatela: o.icDph,
    });
  const r = rozpisPreKontrolu(ulozeny);
  if (Array.isArray(ulozeny) && ulozeny.length && r?.length && !kontrola(r).length) return ulozeny as RiadokDph[];
  if (Math.abs(dph) < 0.005) return null;
  if (Math.abs(zaklad) < 0.005) return null;
  const sadzba = zakonneSadzby(krajina, o.den ?? null).find(
    (s) => s > 0 && Math.abs(dphZoZakladu(zaklad, s) - dph) <= 0.02 + 1e-9,
  );
  return sadzba != null ? [{ sadzba, zaklad, dph }] : null;
}
