/*
  Jedna kamera na doklady v celej appke.

  Doklad sa fotí na viacerých miestach — spúšť na skeneri, „Pridať stranu",
  dávka, prefotenie fotky pri bločku. Predtým každé z nich otvorilo inú
  kameru (systémový skener dokumentov, fotoaparát telefónu) a človek po
  ťuknutí na zelené tlačidlo skončil v druhom skeneri so samozameraním.

  Teraz sa fotí vždy tou istou kamerou v stránke: živý obraz s obrysom
  dokladu, po odfotení „Upraviť doklad" (rohy, filtre, otočenie). Skener ju
  má zabudovanú priamo; ostatné miesta ju otvárajú cez `zachytStrany`, ktoré
  sa sem pýta. Obrazovku s kamerou vykresľuje `KameraDokladuHost` — tu je
  len spojka medzi ním a volajúcim, bez Reactu.

  Keď kamera v stránke nejde (odmietnuté povolenie, prehliadač bez kamery,
  Playwright), zapamätá sa to a ďalej sa ide rovno po starom cez
  `captureReceipt` (fotoaparát / výber súboru). Rovno preto, lebo prehliadač
  pustí výber súboru len krátko po ťuknutí — keby sa najprv čakalo na
  neúspešný pokus o kameru, výber by sa už neotvoril.
*/

export type ZiadostKamery = {
  /** Má zmysel len jedna strana (prefotenie fotky pri bločku). */
  jednaStrana: boolean;
  /** Každá strana je samostatný doklad — mení sa len text tlačidiel. */
  davka: boolean;
};

export type VysledokKamery =
  { stav: "ok"; strany: string[] } | { stav: "zrusene" } | { stav: "nedostupna" };

type Hostitel = (z: ZiadostKamery) => Promise<VysledokKamery>;

let hostitel: Hostitel | null = null;
let kameraNejde = false;

/** Obrazovka s kamerou sa prihlási, keď je appka pripravená ju ukázať. */
export function registrujKameruDokladu(h: Hostitel | null): void {
  hostitel = h;
}

/** Kamera v stránke zlyhala alebo funguje — zapisuje `useKameraQr`. */
export function oznacStavKamery(ide: boolean): void {
  kameraNejde = !ide;
}

export function kameraVStrankeMozna(): boolean {
  return (
    !kameraNejde &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

/**
 * Otvorí kameru dokladu. `undefined` znamená „kamera v stránke tu nie je" —
 * volajúci má siahnuť po náhradnom fotoaparáte.
 */
export async function otvorKameruDokladu(
  z: Partial<ZiadostKamery> = {},
): Promise<VysledokKamery | undefined> {
  if (!hostitel || !kameraVStrankeMozna()) return undefined;
  const r = await hostitel({ jednaStrana: z.jednaStrana ?? false, davka: z.davka ?? false });
  return r.stav === "nedostupna" ? undefined : r;
}
