/*
  Export faktúr v Exportoch a odovzdanie do účtovníctva.

  Export dávno neznamená len Pohodu: ten istý súbor ide do Money, Omegy,
  Flexi, MRP, ISDOC-u alebo do súpisky CSV. Doklad sa po exporte označí ako
  odovzdaný (`export_logs` so stavom `ok` → spúšťač nastaví `exported_at` a
  faktúra sa zamkne) len vtedy, keď to používateľ chce — predvolene len pre
  program, ktorý firma vedie ako účtovný (`companies.uctovny_program`).
  ISDOC, súpiska CSV a Peppol BIS sú formáty „na pozretie / pre kohokoľvek“,
  tie doklady predvolene nezamykajú.

  Hláška zámku musí povedať, kam doklad naozaj odišiel — „odovzdaná do
  Pohody“ pri faktúre poslanej do Money mätie. Texty sú doslovne tie isté
  ako v spúšťači (`hlaska_zamku_faktury` v migrácii), aby ich preložil `t()`.
*/
import type { ExportFormat } from "./export.functions";

/** Účtovný program, do ktorého daný formát exportu faktúr patrí (null = univerzálny formát). */
export const PROGRAM_FORMATU: Record<ExportFormat, string | null> = {
  pohoda_xml: "pohoda",
  omega_txt: "omega",
  money_s3_xml: "money_s3",
  flexi_xml: "flexi",
  mrp_xml: "mrp",
  isdoc_zip: null,
  bis_zip: null,
  csv_univerzal: null,
};

/**
 * Predvolený stav zaškrtávacieho poľa „Označiť ako odovzdané“: zapnuté len
 * pre formát programu, ktorý firma používa ako účtovný.
 */
export function predvoleneOznacit(
  format: ExportFormat,
  uctovnyProgram: string | null | undefined,
): boolean {
  const p = PROGRAM_FORMATU[format];
  return !!p && p === (uctovnyProgram || "pohoda");
}

/**
 * Názov programu podľa `export_jobs.format` — exporty faktúr aj zaúčtovaných
 * dokladov (`uctovanie-programy.ts`). Pohoda (aj neznámy formát) = `null`.
 */
export function nazovProgramuExportu(format: string | null | undefined): string | null {
  switch (format) {
    case "omega_txt":
    case "omega_eud":
      return "KROS Omega";
    case "money_s3_xml":
    case "money_s3_uct":
      return "Money S3";
    case "flexi_xml":
    case "flexi_uct":
      return "ABRA Flexi";
    case "mrp_xml":
    case "mrp_uct":
      return "MRP-K/S";
    case "datev_extf":
      return "DATEV";
    case "isdoc_zip":
      return "ISDOC";
    case "bis_zip":
      return "Peppol BIS";
    case "csv_univerzal":
    case "csv_uct":
      return "súpiska CSV";
    default:
      return null;
  }
}

/** Všetky názvy, ktoré `nazovProgramuExportu` vracia (pre testy a slovníky). */
export const NAZVY_PROGRAMOV_EXPORTU = [
  "KROS Omega",
  "Money S3",
  "ABRA Flexi",
  "MRP-K/S",
  "DATEV",
  "ISDOC",
  "Peppol BIS",
  "súpiska CSV",
] as const;

/** Hláška zámku vydanej faktúry podľa formátu posledného exportu. */
export function hlaskaZamkuFaktury(format: string | null | undefined): string {
  const nazov = nazovProgramuExportu(format);
  if (!nazov)
    return "Faktúra už bola odovzdaná do Pohody — najprv ju vráťte z Pohody (Exporty → Vrátiť), potom ju upravte.";
  return `Faktúra už bola odovzdaná do účtovníctva (${nazov}) — najprv ju vráťte (Exporty → Vrátiť), potom ju upravte.`;
}

/** Riadok „vynechané“ pri faktúre, ktorá už odovzdaná je. */
export function uzOdovzdanaRiadok(cislo: string, format: string | null | undefined): string {
  const nazov = nazovProgramuExportu(format);
  return nazov
    ? `${cislo} — už je odovzdaná do účtovníctva (${nazov}) — znova ju pošlete až po vrátení (Exporty → Vrátiť)`
    : `${cislo} — už je odovzdaná do Pohody — znova ju pošlete až po vrátení (Vrátiť z Pohody)`;
}
