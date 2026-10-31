/*
  Rozpis daňového dokladu k prijatej platbe.

  Prijatá platba je suma VRÁTANE dane, preto sa daň počíta z nej (suma ×
  sadzba / (100 + sadzba)) a základ je zvyšok. Predtým sa základ zobral zo
  zálohy a daň sa k nemu dopočítala — pri zálohe 8 000,00 € so základom
  6 504,07 € tak vyšla daň 1 495,94 € a doklad na 8 000,01 €, hoci prišlo
  presne 8 000,00 €.

  Viac položiek: prijatá suma sa rozdelí podľa súm položiek zálohy s DPH
  a halier, ktorý ostane po zaokrúhlení, ide k najväčšej položke — súčet
  dokladu tak vždy presne sedí s prijatou sumou.
*/

import { datumNaDoklade, jazykDokladu } from "./faktura-jazyk";

/**
 * Poznámka na doklade k prijatej platbe v jazyku dokladu (preberá ho zo
 * zálohy). Predtým bola vždy slovenská a s dátumom „2026-10-30“ — aj na
 * českom doklade.
 */
export function poznamkaDokladuKPlatbe(
  jazyk: unknown,
  datumPlatby: string,
  cisloZalohy: string,
): string {
  const j = jazykDokladu(jazyk);
  const d = datumNaDoklade(datumPlatby, j);
  switch (j) {
    case "cs":
      return `Daňový doklad k platbě přijaté ${d} k zálohové faktuře ${cisloZalohy}.`;
    case "en":
      return `Tax document for the payment received on ${d} for advance invoice ${cisloZalohy}.`;
    case "de":
      return `Rechnung über die am ${d} erhaltene Anzahlung zur Vorauszahlungsrechnung ${cisloZalohy}.`;
    case "hu":
      return `Adóügyi bizonylat a(z) ${cisloZalohy} számú előlegszámlához ${d}-án/én beérkezett fizetésről.`;
    default:
      return `Daňový doklad k platbe prijatej ${d} k zálohovej faktúre ${cisloZalohy}.`;
  }
}

export type PolozkaZalohy = {
  quantity: number;
  unit_price: number;
  vat_rate: number;
  /** Suma položky s DPH, ako je na zálohe (ak chýba, dopočíta sa). */
  total?: number | null;
};

export type RiadokDokladu = {
  quantity: number;
  unit_price: number;
  vat_rate: number;
  subtotal: number;
  vat_amount: number;
  total: number;
};

const naCenty = (n: number) => Math.round(n * 100) / 100;

function sumaSDph(p: PolozkaZalohy): number {
  if (p.total != null && Number.isFinite(Number(p.total))) return Number(p.total);
  const zaklad = naCenty(p.quantity * p.unit_price);
  return naCenty(zaklad + naCenty((zaklad * p.vat_rate) / 100));
}

export function rozpisDokladuKPlatbe(polozky: PolozkaZalohy[], prijate: number) {
  const brutto = polozky.map(sumaSDph);
  const spolu = brutto.reduce((a, b) => a + b, 0);
  const cielCenty = Math.round(prijate * 100);

  // Rozdelenie prijatej sumy na položky v centoch, zvyšok k najväčšej.
  const centy = brutto.map((b) =>
    spolu > 0 ? Math.round((b / spolu) * cielCenty) : Math.round(cielCenty / brutto.length),
  );
  const rozdiel = cielCenty - centy.reduce((a, b) => a + b, 0);
  if (rozdiel !== 0 && centy.length) {
    let naj = 0;
    for (let i = 1; i < brutto.length; i++)
      if (Math.abs(brutto[i]) > Math.abs(brutto[naj])) naj = i;
    centy[naj] += rozdiel;
  }

  const riadky: RiadokDokladu[] = polozky.map((p, i) => {
    const total = centy[i] / 100;
    const dan = naCenty((total * p.vat_rate) / (100 + p.vat_rate));
    const zaklad = naCenty(total - dan);
    const mnozstvo = p.quantity || 1;
    return {
      quantity: mnozstvo,
      unit_price: Math.round((zaklad / mnozstvo) * 100000) / 100000,
      vat_rate: p.vat_rate,
      subtotal: zaklad,
      vat_amount: dan,
      total,
    };
  });

  const subtotal = naCenty(riadky.reduce((a, r) => a + r.subtotal, 0));
  const vat_total = naCenty(riadky.reduce((a, r) => a + r.vat_amount, 0));
  return { riadky, subtotal, vat_total, total: naCenty(subtotal + vat_total) };
}
