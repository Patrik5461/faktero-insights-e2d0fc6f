/*
  DIČ a adresa dodávateľa bločku z eKasy/QR — do Pohody idú v adrese
  pokladničného dokladu. Stĺpce pridáva migrácia
  `expense_documents_dodavatel_adresa`; kým nie je aplikovaná, zápis sa
  potichu nepodarí a export si adresu doplní z adresára či registra
  (`blocek-pohoda.server.ts`). Uloženie dokladu to nikdy nezastaví.
*/
import { rozdelAdresu } from "./blocek-pohoda";

export async function ulozDodavatelaBlocku(
  supabase: any,
  id: string,
  z: { dic?: string | null; adresa?: string | null },
): Promise<void> {
  const a = rozdelAdresu(z.adresa);
  const zmena = Object.fromEntries(
    Object.entries({
      supplier_dic: String(z.dic ?? "").trim() || null,
      supplier_street: a.street ?? null,
      supplier_city: a.city ?? null,
      supplier_zip: a.zip ?? null,
      supplier_country: a.country ?? null,
    }).filter(([, v]) => v),
  );
  if (!Object.keys(zmena).length) return;
  const { error } = await supabase.from("expense_documents").update(zmena).eq("id", id);
  // 42703 / PGRST204 = stĺpec ešte neexistuje (migrácia nie je aplikovaná).
  if (error && !["42703", "PGRST204"].includes(String(error.code))) {
    console.warn("[blocek] adresa dodávateľa:", error.message);
  }
}
