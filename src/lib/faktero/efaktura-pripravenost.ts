/*
  Kontrolný zoznam pripravenosti na eFaktúru (/efaktura).

  IČ DPH je povinné len pre platiteľa DPH. Platiteľstvo sa číta z príznaku
  `vat_payer`, nikdy nie z vyplneného IČ DPH (pamäť „platiteľ DPH“) —
  neplatiteľovi by inak zoznam navždy hlásil chýbajúci údaj (D-15).
*/
export type StavPolozky = "done" | "missing";

export function stavIcDph(
  firma: { vat_payer?: boolean | null; ic_dph?: string | null } | null | undefined,
): StavPolozky {
  if (!firma) return "missing";
  if (firma.vat_payer === false) return "done";
  return typeof firma.ic_dph === "string" && firma.ic_dph.trim() ? "done" : "missing";
}
