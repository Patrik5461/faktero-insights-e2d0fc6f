import type { BlocekVysledok } from "./blocek.functions";

/**
 * Český bloček: hlavička z QR kódu (EET), položky z fotky.
 *
 * QR je odpísaný z pokladnice, fotka je odhad — suma, dátum, mena a predajca
 * preto idú z QR. Výsledok je bloček s QR kódom pokladnice (`zdroj: "qr"`),
 * aj keď položky prečítala fotka: inak by ho web nahratý zo súboru poslal
 * do Nespracovaných namiesto Bločkov (`jeQrPokladnice`).
 *
 * Keď z fotky nevyšlo nič (na obrázku je len QR, rozmazaná fotka), ostáva
 * to, čo je v QR — predtým sa zahodilo aj to a formulár ostal prázdny.
 */
export function zlucEetSFotkou(
  eet: BlocekVysledok,
  foto: BlocekVysledok | null,
  poznamka?: string,
): BlocekVysledok {
  if (!foto) {
    return {
      ...eet,
      poznamka: "Údaje sú z QR kódu, z fotky sa nepodarilo prečítať položky.",
    };
  }
  const v: BlocekVysledok = { ...foto, zdroj: "qr", overeny: false, poznamka, currency: "CZK" };
  if (eet.qr_raw) v.qr_raw = eet.qr_raw;
  if (eet.total != null) v.total = eet.total;
  if (eet.date) v.date = eet.date;
  if (eet.supplier) v.supplier = eet.supplier;
  if (eet.supplier_address) v.supplier_address = eet.supplier_address;
  if (eet.supplier_ico) v.supplier_ico = eet.supplier_ico;
  if (eet.supplier_dic) v.supplier_dic = eet.supplier_dic;
  if (eet.supplier_ic_dph) v.supplier_ic_dph = eet.supplier_ic_dph;
  return v;
}
