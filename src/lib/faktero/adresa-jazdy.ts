/**
 * Skracovanie adries z knihy jázd.
 *
 * GPS jednotka posiela plnú adresu („Hlavná 26/51, 919 26 Zavar, Slovensko"),
 * ktorá sa do riadka na telefóne nezmestí a v zozname jázd aj tak nikto nečíta
 * ulicu — orientuje sa podľa mesta. Berie sa preto časť s PSČ, lebo za ním
 * nasleduje obec; keď PSČ chýba, ostáva prvá zmysluplná časť.
 */

/** Krajina na konci adresy je pri domácich jazdách len šum. */
const KRAJINY =
  /^(slovensko|slovakia|česko|cesko|czechia|rakúsko|rakusko|austria|maďarsko|madarsko|hungary|poľsko|polsko|poland|nemecko|germany)$/i;

/** „Hlavná 26/51, 919 26 Zavar, Slovensko" → „Zavar" */
export function mestoZAdresy(adresa: string | null | undefined): string | null {
  if (!adresa) return null;
  const casti = adresa
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .filter((c) => !KRAJINY.test(c));
  if (!casti.length) return null;

  for (const cast of casti) {
    // PSČ býva v tvare „919 26" aj „91926"; za ním je obec.
    const m = /^\d{3}\s?\d{2}\s+(.+)$/.exec(cast);
    if (m?.[1]) return m[1].trim();
  }

  // Bez PSČ: časť bez čísla domu je bližšie k obci než ulica s číslom.
  const bezCisla = casti.find((c) => !/\d/.test(c));
  return (bezCisla ?? casti[0]).trim();
}

/** „Zavar → Boleráz“. Keď chýba jedna strana, vráti aspoň tú druhú. */
export function trasa(
  start: string | null | undefined,
  ciel: string | null | undefined,
): string | null {
  const a = mestoZAdresy(start);
  const b = mestoZAdresy(ciel);
  if (a && b) return a === b ? a : `${a} → ${b}`;
  return a ?? b ?? null;
}

/** Trvanie jazdy v sekundách na „1 h 25 min“. */
export function trvanieJazdy(sekundy: number | null | undefined): string | null {
  if (!sekundy || sekundy <= 0) return null;
  const minuty = Math.round(sekundy / 60);
  if (minuty < 60) return `${minuty} min`;
  return `${Math.floor(minuty / 60)} h ${minuty % 60} min`;
}
