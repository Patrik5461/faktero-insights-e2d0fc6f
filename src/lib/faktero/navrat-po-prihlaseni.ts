/**
 * Cesta, kam sa smie po prihlásení vrátiť — len stránka tohto webu.
 *
 * `//zly.sk` aj `/\zly.sk` prehliadač chápe ako inú doménu, takže by z
 * prihlásenia urobili presmerovanie na cudzí web. Návrat na samotné
 * prihlásenie by sa točil v kruhu.
 */
export function bezpecnyNavrat(cesta: string | null | undefined): string | null {
  const d = String(cesta ?? "").trim();
  // eslint-disable-next-line no-control-regex
  if (!d.startsWith("/") || d.startsWith("//") || d.includes("\\") || /[\u0000-\u001f]/.test(d))
    return null;
  if (/^\/(prihlasenie|registracia|odhlasenie)(\/|\?|#|$)/.test(d)) return null;
  return d.length > 2000 ? null : d;
}
