import { citajBankoveXml } from "./vypis-xml";
import { zostatkyVypisu } from "./vypis-pohyby";
import type { VypisPohyb } from "./export.server";

/**
 * Bankový výpis zo súboru do evidencie pohybov.
 *
 * Akcenta ani ďalší poskytovatelia nedajú Fakteru priamy prístup k účtu bez
 * licencie AISP, ale výpis si klient stiahne sám. Čítanie je to isté, aké už
 * používa most na Pohodu (`vypis-xml.ts`) — zámerne, aby sa ten istý súbor
 * nikde nečítal dvakrát inak.
 */

export type PohybNaImport = {
  booking_date: string;
  amount: number;
  currency: string;
  variable_symbol: string | null;
  counterparty: string | null;
  description: string | null;
  transaction_reference: string;
};

export type RozborVypisu = {
  ucet: string | null;
  mena: string | null;
  format: string;
  odDna: string | null;
  doDna: string | null;
  pohyby: PohybNaImport[];
  varovanie: string | null;
  /** Konečný zostatok, keď ho výpis uvádza — pri zakladaní účtu je z čoho vyjsť. */
  konecnyZostatok: number | null;
};

/**
 * Stabilný odtlačok pohybu.
 *
 * camt.053 síce referenciu banky nesie, ale `vypis-xml` ju do pohybu neberie —
 * na Pohodu netreba. Bez akejkoľvek referencie by sa dal ten istý výpis nahrať
 * dvakrát a pohyby by pribudli druhýkrát; jedinečný index v databáze stráži
 * práve toto pole. Odtlačok preto skladáme z toho, čo pohyb jednoznačne určuje.
 *
 * Zámerne je v ňom aj poradie v rámci dňa: dva rovnaké odvody v ten istý deň
 * na to isté konto sú bežné a zlúčiť sa nesmú.
 */
export function odtlacok(p: VypisPohyb, poradie: number): string {
  const casti = [
    p.datum,
    p.suma.toFixed(2),
    p.vs ?? "",
    (p.protiucet ?? "").replace(/\s+/g, ""),
    (p.protistrana ?? "").slice(0, 40),
    String(poradie),
  ];
  let h = 0;
  const s = casti.join("|");
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `import:${p.datum}:${(h >>> 0).toString(36)}`;
}

/** Prevedie prečítaný výpis na riadky, ktoré sa dajú zapísať. */
export function rozberVypis(obsah: string, menaUctu?: string | null): RozborVypisu {
  const { vypis, varovanie, format } = citajBankoveXml(obsah);

  /*
    Poradie v rámci dňa. Odtlačok ho potrebuje, aby dva rovnaké pohyby v ten
    istý deň neskončili ako jeden — ale musí sa počítať po dňoch, nie cez celý
    súbor. Inak by ten istý pohyb dostal iný odtlačok len preto, že sa výpis
    stiahol za iné obdobie a pred ním je iný počet riadkov.
  */
  const vDni = new Map<string, number>();
  const pohyby = vypis.pohyby.map((p) => {
    const n = (vDni.get(p.datum) ?? 0) + 1;
    vDni.set(p.datum, n);
    return {
      booking_date: p.datum,
      // Smer je vo výpise vlastným poľom; suma je v camt vždy kladná.
      amount: p.smer === "vydaj" ? -Math.abs(p.suma) : Math.abs(p.suma),
      currency: (vypis.mena ?? menaUctu ?? "EUR").toUpperCase(),
      variable_symbol: p.vs ?? null,
      counterparty: p.protistrana ?? p.protiucet ?? null,
      description: p.popis ?? null,
      transaction_reference: odtlacok(p, n),
    };
  });

  const datumy = pohyby.map((p) => p.booking_date).sort();
  const zostatky = zostatkyVypisu(vypis.pohyby);
  return {
    konecnyZostatok: zostatky?.konecny ?? null,
    ucet: vypis.ucet,
    mena: vypis.mena,
    format,
    odDna: datumy[0] ?? null,
    doDna: datumy[datumy.length - 1] ?? null,
    pohyby,
    varovanie,
  };
}

/** Porovnanie účtov cez holé znaky — výpisy píšu IBAN s medzerami aj bez nich. */
export function rovnakyUcet(a?: string | null, b?: string | null): boolean {
  const o = (v?: string | null) => (v ?? "").replace(/[\s-]/g, "").toUpperCase();
  const x = o(a);
  const y = o(b);
  if (!x || !y) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
}
