/**
 * Hľadaný text ako suma — „120“, „120,50“, „1 234,56 €“, „-20.5“. Vráti
 * absolútnu hodnotu (pohyb v banke môže byť príjem aj výdaj), inak null.
 * Text, ktorý obsahuje aj písmená či viac čísel, sumou nie je.
 */
export function sumaZHladania(text: string | null | undefined): number | null {
  let t = String(text ?? "")
    .trim()
    .replace(/(eur|€|czk|kč)$/i, "")
    .trim()
    .replace(/[\s ]/g, "");
  if (!/^[+-]?\d[\d.,]*$/.test(t)) return null;
  t = t.replace(/^[+-]/, "");
  const ciarka = t.lastIndexOf(",");
  const bodka = t.lastIndexOf(".");
  // Posledný oddeľovač s 1–2 číslicami za ním je desatinný, ostatné sú tisícky.
  const posledny = Math.max(ciarka, bodka);
  let cele = t;
  let des = "";
  if (posledny >= 0 && t.length - posledny - 1 <= 2) {
    cele = t.slice(0, posledny);
    des = t.slice(posledny + 1);
  }
  cele = cele.replace(/[.,]/g, "");
  const n = Number(des ? `${cele}.${des}` : cele);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Podmienky PostgREST `or` pre stĺpec sumy (príjem aj výdaj). */
export function podmienkySumy(stlpec: string, suma: number): string[] {
  return [`${stlpec}.eq.${suma}`, `${stlpec}.eq.${-suma}`];
}
