/**
 * J-04: ktorý mesiac ukazuje karta „Km tento mesiac“ v prehľade jázd.
 * Pri aktuálnom roku je to dnešný mesiac v Bratislave (nie podľa UTC),
 * pri minulom roku posledný mesiac toho roka – inak by karta ukazovala
 * vždy nulu, lebo jazdy sú načítané len za zvolený rok.
 */
export function mesiacKarty(rok: number, dnes: string): { od: string; aktualny: boolean } {
  const dnesnyRok = Number(dnes.slice(0, 4));
  if (rok === dnesnyRok) return { od: `${dnes.slice(0, 7)}-01`, aktualny: true };
  return { od: `${rok}-12-01`, aktualny: false };
}
