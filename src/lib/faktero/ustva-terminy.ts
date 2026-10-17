/**
 * Obdobie a termín Umsatzsteuer-Voranmeldung (UStVA).
 *
 *  - Voranmeldungszeitraum je štvrťrok, mesiac pri dani za minulý rok nad
 *    9 000 € (§ 18 Abs. 2 UStG, hranica od 2025 — predtým 7 500 €; overiť).
 *    Rozhoduje Finanzamt, vo Fakture je to nastavenie firmy.
 *  - Termín: 10. deň po skončení obdobia (§ 18 Abs. 1 S. 1 UStG). S
 *    Dauerfristverlängerung o mesiac neskôr (§ 46 UStDV).
 *  - Keď termín padne na sobotu, nedeľu alebo sviatok, končí sa najbližší
 *    pracovný deň (§ 108 Abs. 3 AO). Počítajú sa len celoštátne sviatky —
 *    krajinské (napr. Fronleichnam, Reformationstag) nie, preto je termín
 *    v takých prípadoch o deň prísnejší, nikdy neskorší.
 *  - Mesačný platiteľ s Dauerfristverlängerung platí Sondervorauszahlung —
 *    1/11 súčtu záloh za minulý rok, prihlási ju do 10. 2. (tlačivo USt 1 H)
 *    a odpočíta v decembrovej UStVA v KZ 39 (§ 47 UStDV). Štvrťročný ju neplatí.
 */

export type ObdobieUstva = "mesacne" | "stvrtrocne";

export type NastaveniaUstva = {
  obdobie: ObdobieUstva;
  dauerfrist: boolean;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (r: number, m: number, d: number) => new Date(Date.UTC(r, m - 1, d));

/** Veľkonočná nedeľa (gregoriánsky výpočet, Meeus/Jones/Butcher). */
function velkaNoc(rok: number): Date {
  const a = rok % 19;
  const b = Math.floor(rok / 100);
  const c = rok % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mesiac = Math.floor((h + l - 7 * m + 114) / 31);
  const den = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(rok, mesiac, den);
}

/** Celoštátne sviatky v Nemecku (bez krajinských). */
export function sviatkyDe(rok: number): Set<string> {
  const vn = velkaNoc(rok);
  const posun = (dni: number) => {
    const d = new Date(vn);
    d.setUTCDate(d.getUTCDate() + dni);
    return iso(d);
  };
  return new Set([
    `${rok}-01-01`, // Neujahr
    posun(-2), // Karfreitag
    posun(1), // Ostermontag
    `${rok}-05-01`, // Tag der Arbeit
    posun(39), // Christi Himmelfahrt
    posun(50), // Pfingstmontag
    `${rok}-10-03`, // Tag der Deutschen Einheit
    `${rok}-12-25`,
    `${rok}-12-26`,
  ]);
}

/** Najbližší pracovný deň od `datum` vrátane (§ 108 Abs. 3 AO). */
export function pracovnyDen(datum: string): string {
  const d = new Date(`${datum}T00:00:00Z`);
  for (;;) {
    const den = d.getUTCDay();
    const s = iso(d);
    if (den !== 0 && den !== 6 && !sviatkyDe(d.getUTCFullYear()).has(s)) return s;
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

/** Posledný mesiac obdobia (1–12). */
function koniecObdobia(o: { mesiac?: number | null; stvrtrok?: number | null }): number {
  if (o.stvrtrok) return o.stvrtrok * 3;
  return o.mesiac ?? 12;
}

/**
 * Termín podania UStVA (a zaplatenia zálohy) za obdobie.
 * Vracia aj zákonný deň pred posunom na pracovný deň.
 */
export function terminUstva(
  o: { rok: number; mesiac?: number | null; stvrtrok?: number | null },
  dauerfrist: boolean,
): { termin: string; zakonny: string } {
  const posledny = koniecObdobia(o);
  // 10. deň mesiaca po skončení obdobia (+ 1 mesiac pri Dauerfristverlängerung).
  const d = utc(o.rok, posledny + 1 + (dauerfrist ? 1 : 0), 10);
  const zakonny = iso(d);
  return { termin: pracovnyDen(zakonny), zakonny };
}

/** Termín prihlásenia a zaplatenia Sondervorauszahlung za rok (10. 2.). */
export function terminSondervorauszahlung(rok: number): string {
  return pracovnyDen(`${rok}-02-10`);
}

/** Či sa firme platí Sondervorauszahlung — len mesačne s Dauerfristverlängerung. */
export function maSondervorauszahlung(n: NastaveniaUstva): boolean {
  return n.obdobie === "mesacne" && n.dauerfrist;
}

/** Normalizácia hodnoty z databázy. */
export function nastaveniaUstva(
  firma:
    | {
        de_ustva_obdobie?: string | null;
        de_dauerfrist?: boolean | null;
      }
    | null
    | undefined,
): NastaveniaUstva {
  return {
    obdobie: firma?.de_ustva_obdobie === "stvrtrocne" ? "stvrtrocne" : "mesacne",
    dauerfrist: Boolean(firma?.de_dauerfrist),
  };
}
