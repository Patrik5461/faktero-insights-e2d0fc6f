/** Účtovné programy, do ktorých Faktero vie poslať zaúčtované doklady. */

export type ProgramUctovania = "omega" | "money_s3" | "flexi" | "csv";
export type AgendaExportu = "vystavena" | "prijata" | "doklad";

export const PROGRAMY_UCTOVANIA: {
  program: ProgramUctovania | "pohoda";
  nazov: string;
  format: string;
  pripona: string;
  mime: string;
  encoding: "utf-8" | "windows-1250";
}[] = [
  { program: "pohoda", nazov: "POHODA", format: "pohoda_xml", pripona: "xml", mime: "application/xml", encoding: "utf-8" },
  { program: "omega", nazov: "KROS Omega", format: "omega_eud", pripona: "txt", mime: "text/plain", encoding: "windows-1250" },
  { program: "money_s3", nazov: "Money S3", format: "money_s3_uct", pripona: "xml", mime: "application/xml", encoding: "utf-8" },
  { program: "flexi", nazov: "ABRA Flexi", format: "flexi_uct", pripona: "xml", mime: "application/xml", encoding: "utf-8" },
  {
    program: "csv",
    nazov: "Iný program (MRP, Helios, Premier…) — súpiska CSV",
    format: "csv_uct",
    pripona: "csv",
    mime: "text/csv",
    encoding: "windows-1250",
  },
];
