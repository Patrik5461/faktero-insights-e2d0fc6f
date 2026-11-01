/*
  Formuláre na stránke Predkontácie (Predvolené, Nastavenia exportu) sa plnia
  z riadku firmy. Po uložení hocičoho sa firma načíta znova (nový objekt) —
  keby sa formulár resetoval pri každej zmene objektu, zmizli by neuložené
  zmeny v druhej karte (E-22). Reset preto ide len vtedy, keď sa zmenili
  hodnoty, ktoré daný formulár zobrazuje: porovnáva sa ich otlačok.
*/
import { nastaveniaNespracovanych } from "./nespracovane-nastavenia";
import { STLPCE_PREDVOLENYCH } from "./predkontacie";

/** JSON s kľúčmi zoradenými abecedne — rovnaký obsah = rovnaký text. */
export function otlacok(v: unknown): string {
  const zorad = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(zorad);
    if (x && typeof x === "object")
      return Object.fromEntries(
        Object.keys(x as Record<string, unknown>)
          .sort()
          .map((k) => [k, zorad((x as Record<string, unknown>)[k])]),
      );
    return x;
  };
  return JSON.stringify(zorad(v ?? null));
}

export type PovinnePole = "zakazka" | "stredisko" | "cinnost";

/** Stav karty „Predvolené“ z riadku firmy. */
export function predvoleneZFirmy(firma: Record<string, any>) {
  return {
    nesp: nastaveniaNespracovanych(firma.uctovanie_nastavenia),
    h: Object.fromEntries(STLPCE_PREDVOLENYCH.map((s) => [s, String(firma[s] ?? "")])) as Record<
      string,
      string
    >,
    oznaceni: {
      ...((firma.pohoda_predkontacie_oznaceni as Record<string, string> | null) ?? {}),
    } as Record<string, string>,
    blockyAgenda: (firma.pohoda_blocky_agenda === "faktura" ? "faktura" : "podla_platby") as
      "faktura" | "podla_platby",
    pokladna: String(firma.pohoda_pokladna ?? ""),
    odkazNaDoklady: firma.pohoda_odkaz_na_doklady !== false,
    polozkyBlockov: Boolean(firma.pohoda_polozky_blockov),
    ine: {
      parovaciSymbol: ((firma.pohoda_parovaci_symbol as any) || "vs") as
        "vs" | "dodaci_list" | "cislo",
      predkontaciaZaokruhlenie: String(firma.pohoda_predkontacia_zaokruhlenie ?? ""),
      qrDoNespracovanych: Boolean(firma.qr_blocky_do_nespracovanych),
      povinnePolia: (Array.isArray(firma.povinne_polia_dokladu)
        ? firma.povinne_polia_dokladu
        : []) as PovinnePole[],
    },
  };
}
