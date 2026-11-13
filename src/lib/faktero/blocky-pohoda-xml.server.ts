/*
  XML pre Pohodu zo zoznamu bločkov — jedno miesto pre ZIP (pohoda.xml vedľa
  skenov) aj pre samotný súbor na stiahnutie. Obsah je v oboch prípadoch ten
  istý, líši sa len názov súboru.
*/
import { buildPohodaExpensesXml, podlaRoka } from "./export.server";
import { prekazkaDokladu, prekazkaStavuDokladu } from "./pohoda-kontrola";

export type XmlBlockovRoka = {
  /** Názov v ZIP-e (`pohoda.xml`, pri prelome rokov `pohoda-<rok>.xml`). */
  nazov: string;
  /** Názov samostatného súboru na stiahnutie. */
  fileName: string;
  xml: string;
  doklady: any[];
};

/**
 * Kontrola pred odovzdaním a tvorba XML podľa rokov. Odovzdaný doklad sa
 * druhýkrát neoznačí — v Pohode by bol dvakrát; duplicita ani cudzí doklad do
 * XML nejdú nikdy. Doklad, ktorý by Pohoda mohla zaúčtovať zle (obsahová
 * prekážka), bez `ajSPrekazkami` do XML nejde (`preskocene`); s ním ide a
 * dôvod je v `zavazne` (ručný export po potvrdení, Patrik 13. 11. 2026).
 */
export function pohodaXmlBlockov(opts: {
  firma: any;
  rows: any[];
  nastavenia: any;
  oznacit: boolean;
  /** Pevný dátum zaúčtovania — všetko ide do jedného súboru. */
  datumZauctovania: string | null;
  /** Obdobie do názvu súboru (`2026-10`). */
  obdobie: string;
  /** Doklady so závažnou (obsahovou) chybou pustiť do XML a vrátiť v `zavazne`. */
  ajSPrekazkami?: boolean;
}): { subory: XmlBlockovRoka[]; preskocene: string[]; zavazne: string[] } {
  const { firma } = opts;
  const nastavenia = { ...(opts.nastavenia ?? {}), ajSPrekazkami: Boolean(opts.ajSPrekazkami) };
  const preskocene: string[] = [];
  const zavazne: string[] = [];
  const doXml = opts.rows.filter((r: any) => {
    if (opts.oznacit && r.exported_at) {
      preskocene.push(
        `${r.document_number || "bloček"} — už je odovzdaný do Pohody — znova ho pošlete až po vrátení (Vrátiť z Pohody)`,
      );
      return false;
    }
    const stav = prekazkaStavuDokladu(r);
    if (stav) return preskocene.push(stav), false;
    const dovod = prekazkaDokladu(r, firma ?? {}, nastavenia);
    if (!dovod) return true;
    if (opts.ajSPrekazkami) return zavazne.push(dovod), true;
    preskocene.push(dovod);
    return false;
  });
  // Prelom rokov: každý rok do vlastného súboru (Pohoda importuje do jedného roka).
  const roky = opts.datumZauctovania
    ? [{ rok: "", doklady: doXml }]
    : podlaRoka(doXml, (r: any) => r.issue_date);
  const subory: XmlBlockovRoka[] = [];
  for (const r of roky) {
    if (!r.doklady.length) continue;
    const xml = buildPohodaExpensesXml({ company: firma ?? {}, doklady: r.doklady, nastavenia });
    // Prázdny dataPack by Pohoda neprijala — taký súbor nevznikne.
    if (!xml) continue;
    const viac = roky.length > 1;
    subory.push({
      nazov: viac ? `pohoda-${r.rok}.xml` : "pohoda.xml",
      fileName: viac
        ? `pohoda-blocky-${r.rok}-${opts.obdobie}.xml`
        : `pohoda-blocky-${opts.obdobie}.xml`,
      xml,
      doklady: r.doklady,
    });
  }
  return { subory, preskocene, zavazne };
}
