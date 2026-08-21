/*
  `Math.sumPrecise` je novinka, ktorú Node 22 ešte nemá — a pdf.js (cez `unpdf`)
  ju volá, keď hľadá náhradu za font, ktorý v PDF nie je priložený. Chybu si
  síce prehltne, ale do logu padá `TypeError: Math.sumPrecise is not a function`
  a šírky znakov sa dopočítajú horšie, takže z takého PDF vyjde rozsypanejší
  text. Doplní sa presný súčet (Neumaierova oprava drží aj čísla veľmi rôznych
  rádov). Načíta sa hneď na vstupe servera, teda skôr, než sa dostane na rad
  prvá požiadavka.
*/
if (typeof (Math as { sumPrecise?: unknown }).sumPrecise !== "function") {
  (Math as { sumPrecise?: (cisla: Iterable<number>) => number }).sumPrecise = (cisla) => {
    let sucet = 0;
    let oprava = 0;
    for (const c of cisla) {
      const novy = sucet + c;
      oprava += Math.abs(sucet) >= Math.abs(c) ? sucet - novy + c : c - novy + sucet;
      sucet = novy;
    }
    return sucet + oprava;
  };
}
