/*
  Zdrojový e-mail (ako v Doklado): klienti do mailu s dokladom píšu veci, ktoré
  na doklade nie sú — „to je za september", „zaplatené kartou", „zákazka
  Novák". Text mailu sa preto uloží a pri doklade sa dá kedykoľvek ukázať.
*/

/** Najviac toľko znakov sa uloží — dlhé reťazce odpovedí nikto nečíta. */
export const MAX_TEXT_MAILU = 20_000;

/** Z HTML spraví čitateľný text so zachovanými odsekmi. */
export function htmlNaText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/gi, "&");
}

/**
 * Text mailu na uloženie: čistý text, keď ho mail má, inak prepis HTML.
 * Prázdne riadky sa zlúčia a výsledok sa skráti. Prázdny mail = `null`.
 */
export function textMailu(text?: string | null, html?: string | null): string | null {
  const zdroj = String(text ?? "").trim() ? String(text) : htmlNaText(String(html ?? ""));
  const t = zdroj
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!t) return null;
  return t.length > MAX_TEXT_MAILU ? `${t.slice(0, MAX_TEXT_MAILU)}\n…` : t;
}
