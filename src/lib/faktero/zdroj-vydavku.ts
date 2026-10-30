/**
 * Zdroj bločku (`expense_documents.source`) podľa toho, čo pri ňom naozaj je.
 *
 * Formulár na webe aj appka začínali s „photo“, takže doklad zapísaný ručne
 * bez jediného obrázka mal v zozname zdroj „fotka“. Fotka alebo nahraný súbor
 * bez súboru nedáva zmysel — taký doklad je ručný zápis (`web`). QR kód ostáva
 * QR aj bez fotky: údaje prišli z Finančnej správy.
 */
export type ZdrojVydavku = "photo" | "qr" | "upload" | "web";

export function zdrojVydavku(zdroj: string | null | undefined, maSubor: boolean): ZdrojVydavku {
  if (zdroj === "qr") return "qr";
  if (!maSubor) return "web";
  return zdroj === "upload" ? "upload" : "photo";
}
