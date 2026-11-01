/**
 * Pravidlá pre platby v hotovosti — podľa krajiny firmy a meny dokladu.
 *
 * Slovensko (EUR):
 *  - celková cena platená v hotovosti sa zaokrúhľuje na päť centov (§ 3 ods. 4
 *    zákona č. 18/1996 Z. z. o cenách, od 1. 7. 2022), lebo jedno- a dvojcentové
 *    mince sa už nevydávajú,
 *  - platba v hotovosti nad 5 000 eur medzi podnikateľmi je zakázaná (zákon
 *    č. 394/2012 Z. z.).
 *
 * Česko (CZK):
 *  - hotovosť sa platí na celé koruny (najmenšia minca je 1 Kč; povinnosť
 *    zaokrúhliť celkovú sumu na platné platidlo má zákon č. 634/1992 Sb.
 *    o ochraně spotřebitele) — rozdiel zo zaokrúhlenia nie je súčasťou základu
 *    DPH (zákon č. 235/2004 Sb.), preto sa ráta mimo súčtu základu a dane,
 *  - platba nad 270 000 Kč za jeden deň je zakázaná (§ 4 zákona č. 254/2004 Sb.
 *    o omezení plateb v hotovosti).
 *
 * Nemecko: ani zaokrúhlenie, ani strop (Bargeldobergrenze neexistuje).
 * Doklad v cudzej mene (napr. CZ firma v eurách) sa nezaokrúhľuje.
 */

/** Zákonný strop platby v hotovosti medzi podnikateľmi (SK, eurá). */
export const STROP_HOTOVOSTI = 5000;

/** Medzi fyzickými osobami mimo podnikania je strop vyšší (SK, eurá). */
export const STROP_HOTOVOSTI_OBCAN = 15000;

/** Český strop za jeden deň (Kč). */
export const STROP_HOTOVOSTI_CZ = 270000;

export function jeHotovost(sposob: string | null | undefined): boolean {
  const s = String(sposob ?? "").toLowerCase();
  return s === "cash" || s === "hotovost" || s === "hotovosť";
}

/** Zaokrúhlenie na najbližších päť centov — matematicky, teda 2,52 aj 2,53 na 2,55. */
export function zaokruhliNaPatCentov(suma: number): number {
  const n = Number(suma);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 20) / 20;
}

/** Rozdiel, ktorý zaokrúhlenie spôsobí — na doklade sa uvádza samostatne. */
export function rozdielZaokruhlenia(suma: number): number {
  return Math.round((zaokruhliNaPatCentov(suma) - Number(suma)) * 100) / 100;
}

/**
 * Krok zaokrúhlenia „retail“ podľa meny dokladu: koruny na celé, všetko
 * ostatné na päť centov (doterajšie správanie).
 */
export function krokZaokruhleniaHotovosti(mena: string | null | undefined): number {
  return String(mena ?? "").toUpperCase() === "CZK" ? 1 : 0.05;
}

/** Zaokrúhli celkovú sumu hotovosti krokom meny. */
export function zaokruhliHotovost(suma: number, mena?: string | null): number {
  const n = Number(suma);
  if (!Number.isFinite(n)) return 0;
  // Násobenie (× 20), nie delenie krokom 0,05 — 2,525 / 0,05 vyjde 50,4999….
  return krokZaokruhleniaHotovosti(mena) === 1 ? Math.round(n) : zaokruhliNaPatCentov(n);
}

/**
 * Zaokrúhľuje sa hotovosť tejto firmy v tejto mene? SK len eurá na 0,05,
 * CZ len koruny na celé; DE a cudzia mena nie.
 */
export function zaokruhlujeHotovost(
  krajina: string | null | undefined,
  mena: string | null | undefined,
): boolean {
  const k = String(krajina ?? "SK").toUpperCase();
  const m = String(mena ?? "").toUpperCase();
  return (k === "SK" && m === "EUR") || (k === "CZ" && m === "CZK");
}

/**
 * Spôsob zaokrúhlenia po zmene spôsobu platby alebo meny. Hotovosť prepne na
 * „retail“ len tam, kde to krajina a mena žiadajú; pri odchode z hotovosti
 * (alebo do meny, ktorá sa nezaokrúhľuje) vráti „retail“ späť na celý doklad.
 * Ručne zvolené „po položkách“ ostáva.
 */
export function zaokruhlenieDokladu<T extends string>(
  aktualne: T,
  sposob: string | null | undefined,
  krajina: string | null | undefined,
  mena: string | null | undefined,
): T | "retail" | "per_document" {
  if (jeHotovost(sposob) && zaokruhlujeHotovost(krajina, mena)) return "retail";
  return aktualne === "retail" ? "per_document" : aktualne;
}

export type StropHotovosti = {
  /** Slovenský kľúč pre `t()`. */
  kluc: string;
  parametre: Record<string, string>;
};

const fmt = (n: number, locale: string) => n.toLocaleString(locale);

/**
 * Prekročený zákonný strop hotovosti podľa krajiny firmy a meny dokladu.
 * Suma v inej mene než domácej sa porovná len vtedy, keď volajúci pozná jej
 * prepočet (`sumaDomaca`) — bez kurzu sa radšej nehlási nič, ako hlásiť zle.
 */
export function prekrocenyStropHotovosti(
  suma: number,
  sposob: string | null | undefined,
  kontext: { krajina?: string | null; mena?: string | null; sumaDomaca?: number | null } = {},
): StropHotovosti | null {
  if (!jeHotovost(sposob)) return null;
  const k = String(kontext.krajina ?? "SK").toUpperCase();
  const m = String(kontext.mena ?? (k === "CZ" ? "CZK" : "EUR")).toUpperCase();
  if (k === "DE") return null;
  const domaca = k === "CZ" ? "CZK" : "EUR";
  const vDomacej =
    m === domaca ? Number(suma) : kontext.sumaDomaca == null ? null : Number(kontext.sumaDomaca);
  if (vDomacej == null || !Number.isFinite(vDomacej)) return null;
  if (k === "CZ") {
    if (Math.abs(vDomacej) <= STROP_HOTOVOSTI_CZ) return null;
    return {
      kluc: "Platba v hotovosti nad {strop} Kč za jeden deň je zakázaná (§ 4 zákona č. 254/2004 Sb. o obmedzení platieb v hotovosti).",
      parametre: { strop: fmt(STROP_HOTOVOSTI_CZ, "cs-CZ") },
    };
  }
  if (Math.abs(vDomacej) <= STROP_HOTOVOSTI) return null;
  return {
    kluc: "Platba v hotovosti nad {strop} € je medzi podnikateľmi zakázaná (zákon č. 394/2012 Z. z.). Medzi fyzickými osobami mimo podnikania je strop {stropObcan} €.",
    parametre: {
      strop: fmt(STROP_HOTOVOSTI, "sk-SK"),
      stropObcan: fmt(STROP_HOTOVOSTI_OBCAN, "sk-SK"),
    },
  };
}

/** Prekročený zákonný strop? Vracia text upozornenia (SK, eurá), inak null. */
export function prekrocenyStrop(suma: number, sposob: string | null | undefined): string | null {
  const s = prekrocenyStropHotovosti(suma, sposob, { krajina: "SK", mena: "EUR" });
  if (!s) return null;
  return s.kluc.replace(/\{(\w+)\}/g, (_, k) => s.parametre[k] ?? "");
}
