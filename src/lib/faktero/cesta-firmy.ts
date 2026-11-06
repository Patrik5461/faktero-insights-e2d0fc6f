/**
 * Cesta k súboru v Storage, ktorá prišla z riadku tabuľky alebo z prehliadača.
 *
 * Člen firmy ju cez RLS vie prepísať, a server ju potom sťahuje servisným
 * kľúčom, ktorý kontrolu priečinka v Storage obchádza. Preto cesta musí
 * začínať priečinkom firmy a nesmie obsahovať nič, čo by sa po ceste
 * (fetch/URL) dalo „vyriešiť“ do iného priečinka:
 *  - segment `.` alebo `..` (aj zakódovaný `%2e`) — URL ho zloží,
 *  - spätné lomítko — v http URL sa správa ako `/`,
 *  - riadiace znaky, prázdne segmenty a `?`/`#` (zmenili by cestu v URL).
 */
export function cestaPatriFirme(
  cesta: string | null | undefined,
  companyId: string | null | undefined,
): cesta is string {
  if (typeof cesta !== "string" || typeof companyId !== "string") return false;
  const firma = companyId.trim();
  if (!firma || firma.includes("/")) return false;
  if (!cesta.startsWith(`${firma}/`)) return false;
  if (/[\\?#\u0000-\u001f\u007f]/.test(cesta)) return false;
  const segmenty = cesta.split("/");
  if (segmenty.length < 2) return false;
  for (const s of segmenty) {
    if (s === "") return false;
    let dekodovany = s;
    try {
      dekodovany = decodeURIComponent(s);
    } catch {
      // Osamotené „%“ v mene súboru URL nechá tak, ako je.
    }
    if (dekodovany === "." || dekodovany === ".." || /[\\/]/.test(dekodovany)) return false;
  }
  return true;
}

/** To isté, ale vráti cestu alebo vyhodí chybu — pre miesta, kde bez súboru niet čo robiť. */
export function overCestuFirmy(
  cesta: string | null | undefined,
  companyId: string | null | undefined,
): string {
  if (!cestaPatriFirme(cesta, companyId)) throw new Error("Súbor nepatrí k tejto firme.");
  return cesta;
}
