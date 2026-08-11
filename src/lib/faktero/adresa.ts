/**
 * Riadky poštovej adresy.
 *
 * Odberateľ nemusí mať vyplnenú ulicu ani mesto — pri novej firme sa často
 * založí len s názvom. Skladanie natvrdo („{PSČ} {mesto}, {krajina}") potom
 * na doklade vypíše osamotenú čiarku pred kódom krajiny. Prázdne časti sa
 * preto vynechávajú a keď nie je vyplnené nič, nevznikne ani riadok.
 */
export function adresaRiadky(
  ulica?: string | null,
  psc?: string | null,
  mesto?: string | null,
  krajina?: string | null,
): string[] {
  const riadky: string[] = [];
  const u = ulica?.trim();
  if (u) riadky.push(u);

  const obec = [psc?.trim(), mesto?.trim()].filter(Boolean).join(" ");
  if (obec) riadky.push(obec);

  const k = krajina?.trim();
  // Samotný kód krajiny bez zvyšku adresy nikomu nič nepovie.
  if (k && riadky.length) riadky.push(k);

  return riadky;
}
