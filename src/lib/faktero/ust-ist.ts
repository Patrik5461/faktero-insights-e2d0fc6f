/**
 * Ist-Versteuerung (§ 20 UStG) — daň z vystavených faktúr podľa prijatých platieb.
 *
 * Pri Soll-Versteuerung (predvolené) vzniká daň uplynutím obdobia, v ktorom
 * bolo plnenie dodané (§ 13 Abs. 1 Nr. 1 Buchst. a S. 1 UStG). Firma, ktorej
 * Finanzamt povolil zdaňovanie podľa prijatých platieb (§ 20 — obrat do
 * 800 000 € alebo slobodné povolanie), priznáva daň až v období, keď peniaze
 * prišli (§ 13 Abs. 1 Nr. 1 Buchst. b). Pri čiastočnej úhrade ide do obdobia
 * pomerná časť dane: platba je hrubá suma, daň v nej je v rovnakom pomere
 * ako na faktúre.
 *
 * Čo sa pri Ist **nemení**:
 *  - **Vorsteuer** (KZ 66) — odpočet podľa § 15 Abs. 1 Nr. 1 UStG vzniká
 *    dodaním a faktúrou, nie zaplatením dodávateľovi. (Návrh viazať odpočet
 *    Ist-firmy na zaplatenie z Wachstumschancengesetz 2024 neprešiel —
 *    overiť, či sa medzičasom nezmenilo.) Výnimkou je záloha dodávateľovi:
 *    odpočet až po zaplatení (§ 15 Abs. 1 Nr. 1 S. 3) — prijatá zálohová
 *    faktúra do výkazu nejde vôbec, rieši ju ostrá faktúra.
 *  - **Prenesenie a oslobodené plnenia** (KZ 41, 21, 43, 45, 60) — daň
 *    nevyberá dodávateľ, hlásia sa podľa dodania (pri dodaní do EÚ podľa
 *    § 18a a § 13 Abs. 1 Nr. 6); nezdaniteľné riadky faktúry sa preto
 *    nechávajú podľa dátumu dodania.
 *  - **Zálohy** (Mindest-Ist-Versteuerung, § 13 Abs. 1 Nr. 1 Buchst. a S. 4) —
 *    daň zo zálohy vzniká jej prijatím pri Soll aj Ist. Vo Fakture ju nesie
 *    doklad k prijatej platbe (`advance_payment`), ktorý je datovaný dňom
 *    platby; ostrá faktúra si ho odpočíta. Platba na zálohovú faktúru bez
 *    dokladu k prijatej platbe sa ukáže ako výtka.
 */

export type Platba = { suma: number; datum: string };

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Podiel hrubej sumy faktúry uhradený v období `od`–`do_` (0 až 1).
 * Platby sa sčítavajú chronologicky a zastropujú sumou faktúry — preplatok
 * nezvýši daň a súčet podielov za všetky obdobia nikdy neprekročí 1.
 */
export function podielUhradyVObdobi(
  platby: Platba[],
  hruba: number,
  od: string,
  do_: string,
): number {
  if (!(hruba > 0)) return 0;
  let predtym = 0;
  let doKonca = 0;
  for (const p of platby) {
    const d = String(p.datum ?? "").slice(0, 10);
    const s = Number(p.suma) || 0;
    if (!d) continue;
    if (d < od) predtym += s;
    if (d <= do_) doKonca += s;
  }
  const a = Math.min(hruba, Math.max(0, predtym));
  const b = Math.min(hruba, Math.max(0, doKonca));
  return b > a ? r6((b - a) / hruba) : 0;
}

/** Uhradené do dňa vrátane (hrubá suma v mene faktúry). */
export function uhradeneDo(platby: Platba[], den: string): number {
  return platby
    .filter((p) => String(p.datum ?? "").slice(0, 10) <= den)
    .reduce((a, p) => a + (Number(p.suma) || 0), 0);
}

/**
 * Platby faktúry. Úhrady z tabuľky `payments` (banka, ručný zápis, brána);
 * keď žiadne nie sú a faktúra je označená ako uhradená, berie sa celá suma
 * k dátumu `paid_at` (hromadné „Označiť ako uhradené“, API).
 */
export function platbyFaktury(
  f: { status?: string | null; paid_at?: string | null; total?: unknown },
  zTabulky: Platba[],
): Platba[] {
  if (zTabulky.length) return zTabulky;
  if (f.status === "paid" && f.paid_at)
    return [{ suma: Number(f.total ?? 0), datum: String(f.paid_at).slice(0, 10) }];
  return [];
}

/** Riadky vynásobené podielom úhrady (základ aj daň na centy). */
export function riadkyPodielom<T extends { sadzba: number; zaklad: number; dan: number }>(
  riadky: T[],
  podiel: number,
): T[] {
  const c = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  return riadky.map((r) => ({ ...r, zaklad: c(r.zaklad * podiel), dan: c(r.dan * podiel) }));
}
