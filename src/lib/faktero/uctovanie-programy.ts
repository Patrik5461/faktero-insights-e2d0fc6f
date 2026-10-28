/** Účtovné programy, do ktorých Faktero vie poslať zaúčtované doklady. */

export type ProgramUctovania = "omega" | "money_s3" | "flexi" | "mrp" | "csv" | "datev";
export type AgendaExportu = "vystavena" | "prijata" | "doklad";

export const PROGRAMY_UCTOVANIA: {
  program: ProgramUctovania | "pohoda";
  nazov: string;
  format: string;
  pripona: string;
  mime: string;
  encoding: "utf-8" | "windows-1250" | "windows-1252";
}[] = [
  {
    program: "pohoda",
    nazov: "POHODA",
    format: "pohoda_xml",
    pripona: "xml",
    mime: "application/xml",
    encoding: "utf-8",
  },
  {
    program: "omega",
    nazov: "KROS Omega",
    format: "omega_eud",
    pripona: "txt",
    mime: "text/plain",
    encoding: "windows-1250",
  },
  {
    program: "money_s3",
    nazov: "Money S3",
    format: "money_s3_uct",
    pripona: "xml",
    mime: "application/xml",
    encoding: "utf-8",
  },
  {
    program: "flexi",
    nazov: "ABRA Flexi",
    format: "flexi_uct",
    pripona: "xml",
    mime: "application/xml",
    encoding: "utf-8",
  },
  {
    // MRP-K/S a MRP Autonómny podnik — XML MRP-K/S verzie 2.0 (UTF-8, znaky z Windows-1250).
    program: "mrp",
    nazov: "MRP-K/S",
    format: "mrp_uct",
    pripona: "xml",
    mime: "application/xml",
    encoding: "utf-8",
  },
  {
    // DATEV-Format „Buchungsstapel“ (EXTF 700) — ANSI, teda Windows-1252.
    program: "datev",
    nazov: "DATEV (Buchungsstapel)",
    format: "datev_extf",
    pripona: "csv",
    mime: "text/csv",
    encoding: "windows-1252",
  },
  {
    program: "csv",
    nazov: "Iný program (Helios, Premier…) — súpiska CSV",
    format: "csv_uct",
    pripona: "csv",
    mime: "text/csv",
    encoding: "windows-1250",
  },
];
