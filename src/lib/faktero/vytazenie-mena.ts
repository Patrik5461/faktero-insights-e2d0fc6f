/*
  Uprednostnenie domácej meny pri vyťažení dokladu (ako v Doklado).

  Faktúra od zahraničného dodávateľa často nesie sumy v dvoch menách —
  napríklad česká faktúra v CZK s prepočtom DPH na EUR, alebo faktúra v EUR
  s rekapituláciou v CZK. Keď to má firma zapnuté, AI vráti sumy v domácej
  mene firmy (SK EUR, CZ CZK), ak ich doklad uvádza. Doklad len v jednej mene
  sa číta ako doteraz.

  Čisté funkcie — pokyn sa skladá tu, aby sa dal otestovať bez volania AI.
*/

import { domacaMena } from "./kurzy";

export type VolbyCitania = {
  /** Domáca mena firmy, ktorú má AI uprednostniť (null = neuprednostňovať). */
  domacaMena?: string | null;
};

/** Mena, ktorú má vyťaženie uprednostniť — podľa nastavenia a krajiny firmy. */
export function menaPreVytazenie(
  zapnute: boolean,
  country: string | null | undefined,
): string | null {
  return zapnute ? domacaMena(country) : null;
}

/** Doplnok pokynu pre AI o domácej mene (prázdny, keď sa nemá uprednostňovať). */
export function pokynDomacejMeny(mena: string | null | undefined): string {
  const m = String(mena ?? "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(m)) return "";
  return `
Mena: do "currency" daj vždy kód meny (ISO 4217), v ktorej sú sumy, čo vraciaš.
Keď sú na doklade sumy vo VIAC menách (napr. faktúra v cudzej mene s prepočtom na ${m},
rekapitulácia DPH v ${m} alebo súčty v ${m} vedľa súčtov v inej mene), vráť "amount_without_vat",
"vat_amount" a "amount_total" v mene ${m} a do "currency" daj "${m}". Ceny položiek v "items"
nechaj tak, ako sú vytlačené, a do "items_currency" daj ich menu. Do "original_currency" daj
pôvodnú menu dokladu a do "original_amount_total" jeho sumu spolu v tej mene.
Keď je doklad len v jednej mene, sumy ani menu nemeň, nič neprepočítavaj sám a
"items_currency", "original_currency" aj "original_amount_total" nechaj null.`;
}

/** Celý pokyn pre AI — základný pokyn a prípadný doplnok o domácej mene. */
export function pokynCitania(zaklad: string, volby?: VolbyCitania | null): string {
  const doplnok = pokynDomacejMeny(volby?.domacaMena);
  if (!doplnok) return zaklad;
  // Záverečná veta „nič si nevymýšľaj“ má ostať posledná.
  const zaver = "Čo na doklade nie je, nechaj null — nič si nevymýšľaj.";
  const i = zaklad.lastIndexOf(zaver);
  return i >= 0
    ? `${zaklad.slice(0, i).trimEnd()}${doplnok}\n${zaklad.slice(i)}`
    : `${zaklad}${doplnok}`;
}
