/**
 * Formátovanie súm s menou.
 *
 * `Intl.NumberFormat` pri neplatnom kóde meny **vyhodí `RangeError`**, nie
 * náhradný text. Kód pritom ide rovno z databázy a nie každý formulár ho
 * kontroluje — stačil jeden riadok s menou „QA položka" a celý prehľad ostal
 * prázdny, lebo výnimka zhodila vykreslenie stránky.
 *
 * Preto sa formátuje cez toto: neznámy kód sa vypíše ako text vedľa čísla,
 * stránka ostane stáť a chyba je vidieť tam, kde vznikla — na sume.
 */

/** ISO 4217 je vždy tri veľké písmená. Nič iné `Intl` neprijme. */
const KOD_MENY = /^[A-Za-z]{3}$/;

export function formatujMenu(hodnota: unknown, mena: unknown, locale = "sk-SK"): string {
  const n = Number(hodnota);
  const cislo = Number.isFinite(n) ? n : 0;
  const kod = typeof mena === "string" && KOD_MENY.test(mena) ? mena.toUpperCase() : null;

  if (!kod) {
    const suma = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cislo);
    // Prázdna mena sa nemá čím doplniť; nezmyselnú je lepšie ukázať, nech je
    // jasné, že v doklade je nesprávny kód.
    const zvysok = typeof mena === "string" && mena.trim() ? ` ${mena.trim()}` : "";
    return `${suma}${zvysok}`;
  }

  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: kod }).format(cislo);
  } catch {
    // Tri písmená, ktoré predsa nie sú mena (napr. „QQQ").
    return `${new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cislo)} ${kod}`;
  }
}

/**
 * Formátovač pre jednu menu — náhrada za `new Intl.NumberFormat(...).format`.
 *
 * Zámerne má rovnaký tvar volania ako pôvodný kód, aby sa dali všetky miesta
 * prepnúť naraz a nič sa pritom neprehliadlo.
 */
export function formatovacMeny(mena: unknown, locale = "sk-SK") {
  return (hodnota: unknown) => formatujMenu(hodnota, mena, locale);
}

/**
 * Meny, ktoré sa dajú na doklade vybrať.
 *
 * Zoznam bol predtým vnútri formulára novej faktúry a inde chýbal — ponuka
 * mala menu ako voľný text, takže sa do databázy dalo napísať čokoľvek.
 * A čokoľvek potom zhodilo formátovanie na každej stránke, kde sa taký
 * doklad objavil.
 */
export const MENY: { code: string; symbol: string; flag: string; name: string }[] = [
  { code: "EUR", symbol: "€", flag: "🇪🇺", name: "Euro" },
  { code: "CZK", symbol: "Kč", flag: "🇨🇿", name: "Česká koruna" },
  { code: "USD", symbol: "$", flag: "🇺🇸", name: "US dolár" },
  { code: "GBP", symbol: "£", flag: "🇬🇧", name: "Libra" },
  { code: "PLN", symbol: "zł", flag: "🇵🇱", name: "Zlotý" },
  { code: "HUF", symbol: "Ft", flag: "🇭🇺", name: "Forint" },
  { code: "CHF", symbol: "₣", flag: "🇨🇭", name: "Frank" },
];
