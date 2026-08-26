/**
 * Sadzby DPH podľa krajiny registrácie firmy.
 *
 * Dovtedy tu boli natvrdo slovenské sadzby a česká firma si 21 % nemala kde
 * vybrať — faktúra jej vyšla nesprávne a vývoz do Pohody ju zaúčtoval do
 * cudzej priehradky, ticho a bez hlásenia.
 *
 * Režim sa nikde nenastavuje ručne. Vyplýva z poľa `country` na firme, a to
 * je jediné miesto pravdy: krajina registrácie určuje, aké sadzby firma
 * uplatňuje.
 *
 * Historické sadzby musia ostať dostupné pre opravné doklady k plneniam spred
 * zmeny — dobropis k faktúre z roku 2024 nesie sadzbu, ktorá vtedy platila.
 */

export type KrajinaDane = "SK" | "CZ";

/** Tabuľka sadzieb platná od daného dňa. `third` má len krajina s treťou sadzbou. */
type Tabulka = { od: string; high: number; low: number; third: number | null };

/*
  Zoradené od najnovšej. `kuDnu` berie prvú, ktorá už platí — nová sadzba tak
  pribudne pridaním jedného riadku a stará ostane pre opravné doklady.

  SK: do 2024 20/10, od 1. 1. 2025 23/19/5 (§ 27 zákona č. 222/2004 Z. z.).
  CZ: do 2023 21/15/10, od 1. 1. 2024 sa obe znížené zlúčili na 12 %.
*/
const TABULKY: Record<KrajinaDane, Tabulka[]> = {
  SK: [
    { od: "2025-01-01", high: 23, low: 19, third: 5 },
    { od: "0000-01-01", high: 20, low: 10, third: null },
  ],
  CZ: [
    { od: "2024-01-01", high: 21, low: 12, third: null },
    { od: "0000-01-01", high: 21, low: 15, third: 10 },
  ],
};

const NAZVY: Record<KrajinaDane, string> = { SK: "Slovensko", CZ: "Česko" };

/**
 * Krajina dane z poľa `country`.
 *
 * Pole je voľný text a naozaj v ňom býva všeličo — „SK", „Slovensko", „SVK".
 * Čo nepoznáme, ide na SK: taká bola doteraz jediná možnosť a existujúce firmy
 * sa touto zmenou nesmú rozsypať.
 */
export function krajinaDane(country?: string | null): KrajinaDane {
  const s = String(country ?? "")
    .trim()
    .toUpperCase();
  if (/^(CZ|CZE|ČESK|CESK|CZECH)/.test(s)) return "CZ";
  return "SK";
}

export function nazovKrajinyDane(krajina: KrajinaDane): string {
  return NAZVY[krajina];
}

/** Krajiny, pre ktoré sú sadzby doplnené — do výberu pri zakladaní firmy. */
export const KRAJINY_DANE: { kod: KrajinaDane; nazov: string }[] = [
  { kod: "SK", nazov: "Slovensko" },
  { kod: "CZ", nazov: "Česko" },
];

function dnes(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Sadzby platné v daný deň. Pohoda ich potrebuje ako priehradky, nie percentá. */
export function sadzbyKuDnu(
  krajina: KrajinaDane,
  den?: string | null,
): { high: number; low: number; third: number | null } {
  const d = String(den || dnes());
  const t =
    TABULKY[krajina].find((x) => d >= x.od) ?? TABULKY[krajina][TABULKY[krajina].length - 1];
  return { high: t.high, low: t.low, third: t.third };
}

/** Sadzby do výberu: platné v daný deň, od najvyššej, vrátane nuly. */
export function sadzbyKrajiny(krajina: KrajinaDane, den?: string | null): number[] {
  const t = sadzbyKuDnu(krajina, den);
  const s = [t.high, t.low, ...(t.third == null ? [] : [t.third]), 0];
  return [...new Set(s)].sort((a, b) => b - a);
}

/** Základná sadzba — predvolená pre novú položku. */
export function zakladnaSadzba(krajina: KrajinaDane, den?: string | null): number {
  return sadzbyKuDnu(krajina, den).high;
}

/** Všetko, čo v krajine niekedy platilo — na rozpoznanie sadzby z opravného dokladu. */
function vsetkySadzby(krajina: KrajinaDane): number[] {
  const s = TABULKY[krajina].flatMap((t) => [t.high, t.low, ...(t.third == null ? [] : [t.third])]);
  return [...new Set([...s, 0])];
}

/**
 * Prilepí dopočítanú sadzbu k najbližšej sadzbe krajiny.
 * Prijaté faktúry majú uložený len základ a daň; podiel preto kvôli
 * zaokrúhľovaniu na centy vyjde napr. 22,97 % namiesto 23 %. Tolerancia je
 * 0,5 percentuálneho bodu — dosť na zaokrúhlenie, málo na zámenu 19 a 23.
 */
export function najblizsiaSadzba(vypocitana: number, krajina: KrajinaDane = "SK"): number {
  const n = Number(vypocitana);
  if (!Number.isFinite(n)) return 0;
  const znama = vsetkySadzby(krajina).find((r) => Math.abs(r - n) <= 0.5);
  return znama ?? Math.round(n * 100) / 100;
}

export function vatBucketKey(rate: number | null | undefined): string {
  // `Number(null)` je 0, takže bez tejto kontroly by sa neznáma sadzba tvárila
  // ako nulová — a to sú v priznaní dva rôzne riadky.
  if (rate == null) return "exempt";
  const n = Number(rate);
  if (!Number.isFinite(n) || n < 0) return "exempt";
  // Zdanené plnenie nesmie nikdy skončiť medzi oslobodenými — aj neznámu alebo
  // historickú sadzbu preto dostane vlastný riadok. Inak by sa 19 % a 20 %
  // (opravné doklady k plneniam spred 2025) ticho spadli medzi oslobodené
  // plnenia a súčty v priznaní by nesedeli.
  return String(n);
}

/**
 * Poradie riadkov v prehľade DPH: najprv platné sadzby, potom sadzby, ktoré sa
 * naozaj vyskytli v dátach (historické alebo zahraničné), a nakoniec
 * oslobodené plnenia a prenos daňovej povinnosti.
 */
export function vatBucketOrder(seenKeys: Iterable<string>, krajina: KrajinaDane = "SK"): string[] {
  const zaklad = sadzbyKrajiny(krajina).map(String);
  const navyse = [...new Set(seenKeys)]
    .filter((k) => k !== "exempt" && k !== "pdp" && !zaklad.includes(k))
    .sort((a, b) => Number(b) - Number(a));
  return [...zaklad, ...navyse, "exempt", "pdp"];
}

export function vatBucketLabel(key: string, krajina: KrajinaDane = "SK"): string {
  if (key === "exempt") return "Oslobodené";
  if (key === "pdp") return "PDP (prenos daňovej povinnosti)";
  const n = Number(key);
  if (n === 0) return "0 % (nulová)";
  const t = sadzbyKuDnu(krajina);
  if (n === t.high) return `${n} % (základná)`;
  if (n === t.low || (t.third != null && n === t.third)) return `${n} % (znížená)`;
  return `${n} % (historická)`;
}

/**
 * Sadzby do rozbaľovacieho zoznamu.
 * Sadzba, ktorú položka už nesie a dnes neplatí, sa pridá — inak by sa pri
 * úprave staršieho dokladu ticho prepla na inú.
 */
export function vatRateOptions(
  krajina: KrajinaDane = "SK",
  currentRate?: number | null,
  den?: string | null,
): number[] {
  const base = sadzbyKrajiny(krajina, den);
  const cur = currentRate == null ? null : Number(currentRate);
  if (cur != null && Number.isFinite(cur) && !base.includes(cur)) {
    return [...base, cur].sort((a, b) => b - a);
  }
  return base;
}

/* Ponechané pre miesta, ktoré firmu po ruke nemajú. Slovenské, ako doteraz. */
export const SK_VAT_RATES = sadzbyKrajiny("SK");
export const DEFAULT_VAT_RATE = zakladnaSadzba("SK");
