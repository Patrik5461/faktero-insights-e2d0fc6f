/*
  XML pre Pohodu zo zoznamu bločkov — jedno miesto pre ZIP (pohoda.xml vedľa
  skenov) aj pre samotný súbor na stiahnutie. Obsah je v oboch prípadoch ten
  istý, líši sa len názov súboru.
*/
import { buildPohodaExpensesXml, podlaRoka } from "./export.server";
import { prekazkaDokladu } from "./pohoda-kontrola";

export type XmlBlockovRoka = {
  /** Názov v ZIP-e (`pohoda.xml`, pri prelome rokov `pohoda-<rok>.xml`). */
  nazov: string;
  /** Názov samostatného súboru na stiahnutie. */
  fileName: string;
  xml: string;
  doklady: any[];
};

/**
 * Kontrola pred odovzdaním a tvorba XML podľa rokov. Doklad, ktorý by Pohoda
 * zaúčtovala zle, do XML nejde a neoznačí sa. Odovzdaný doklad sa druhýkrát
 * neoznačí — v Pohode by bol dvakrát.
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
}): { subory: XmlBlockovRoka[]; preskocene: string[] } {
  const { firma, nastavenia } = opts;
  const preskocene: string[] = [];
  const doXml = opts.rows.filter((r: any) => {
    if (opts.oznacit && r.exported_at) {
      preskocene.push(
        `${r.document_number || "bloček"} — už je odovzdaný do Pohody — znova ho pošlete až po vrátení (Vrátiť z Pohody)`,
      );
      return false;
    }
    const dovod = prekazkaDokladu(r, firma ?? {}, nastavenia);
    if (dovod) preskocene.push(dovod);
    return !dovod;
  });
  // Prelom rokov: každý rok do vlastného súboru (Pohoda importuje do jedného roka).
  const roky = opts.datumZauctovania
    ? [{ rok: "", doklady: doXml }]
    : podlaRoka(doXml, (r: any) => r.issue_date);
  const subory: XmlBlockovRoka[] = [];
  for (const r of roky) {
    if (!r.doklady.length) continue;
    const viac = roky.length > 1;
    subory.push({
      nazov: viac ? `pohoda-${r.rok}.xml` : "pohoda.xml",
      fileName: viac
        ? `pohoda-blocky-${r.rok}-${opts.obdobie}.xml`
        : `pohoda-blocky-${opts.obdobie}.xml`,
      xml: buildPohodaExpensesXml({ company: firma ?? {}, doklady: r.doklady, nastavenia }),
      doklady: r.doklady,
    });
  }
  return { subory, preskocene };
}
