/**
 * Prijaté objednávky od odberateľov (v POHODE Objednávky → Prijaté objednávky).
 * Čistá logika, aby sa dala otestovať bez databázy.
 *
 * Objednávka dopĺňa reťaz **ponuka → objednávka → faktúra**. Ponuka je návrh,
 * ktorý odberateľ ešte neprijal; objednávka je záväzok, ktorý sa vybavuje —
 * postupne, po častiach, viacerými faktúrami.
 *
 * Stav sa **nenastavuje ručne** — počíta sa z toho, koľko je vyfakturované.
 * Ručne nastavený stav by sa skôr či neskôr rozišiel s tým, čo je naozaj
 * vybavené. Rovnaké pravidlo drží aj objednávky u dodávateľov
 * (`objednavky-dodavatel.ts`); nezhoda medzi tými dvoma by pri hľadaní chyby
 * stála hodiny.
 */

export type StavPrijatejObjednavky =
  | "draft"
  | "confirmed"
  | "partially_invoiced"
  | "completed"
  | "cancelled";

export const STAV_POPIS: Record<StavPrijatejObjednavky, string> = {
  draft: "Rozpracovaná",
  confirmed: "Potvrdená",
  partially_invoiced: "Čiastočne vybavená",
  completed: "Vybavená",
  cancelled: "Zrušená",
};

export type PolozkaObjednavky = {
  quantity?: unknown;
  /** Koľko z položky už išlo na faktúru. */
  invoiced_quantity?: unknown;
  unit_price?: unknown;
  vat_rate?: unknown;
};

export function cislo(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/** Množstvá sa zadávajú aj v metroch a kilogramoch — štyri desatinné miesta. */
export function m4(x: number): number {
  return Math.round((x + Number.EPSILON) * 10_000) / 10_000;
}

export function centy(x: number): number {
  return Math.round((cislo(x) + Number.EPSILON) * 100) / 100;
}

/**
 * Koľko z položky ešte treba vyfakturovať. Nikdy záporné — ak sa vyfakturovalo
 * viac, než bolo objednané, nie je to dlh objednávky.
 */
export function zostavaVybavit(p: PolozkaObjednavky): number {
  return m4(Math.max(0, cislo(p.quantity) - cislo(p.invoiced_quantity)));
}

/**
 * Stav podľa toho, čo je naozaj vyfakturované. Zrušenú ani rozpracovanú
 * objednávku faktúra nepreklopí — kým odberateľ objednávku nepotvrdil, nie je
 * čo vybavovať.
 */
export function stavPodlaVybavenia(
  polozky: PolozkaObjednavky[],
  aktualny: StavPrijatejObjednavky,
): StavPrijatejObjednavky {
  if (aktualny === "cancelled" || aktualny === "draft") return aktualny;
  if (polozky.length === 0) return aktualny;

  const vybaveneSpolu = polozky.reduce((s, p) => s + cislo(p.invoiced_quantity), 0);
  const nieceChyba = polozky.some((p) => zostavaVybavit(p) > 0);

  if (!nieceChyba) return "completed";
  if (vybaveneSpolu > 0) return "partially_invoiced";
  return "confirmed";
}

/** Objednávka je v hre, kým nie je vybavená alebo zrušená. */
export function jeOtvorena(stav: StavPrijatejObjednavky): boolean {
  return stav !== "completed" && stav !== "cancelled";
}

/**
 * Zmazať sa dá len rozpracovaná objednávka. Potvrdená je záväzok voči
 * odberateľovi — tá sa ruší, aby po nej ostala stopa.
 */
export function saDaZmazat(stav: StavPrijatejObjednavky): boolean {
  return stav === "draft";
}

/** Rezervovať sklad má zmysel len na potvrdenú a ešte nevybavenú objednávku. */
export function maRezervovat(stav: StavPrijatejObjednavky): boolean {
  return stav === "confirmed" || stav === "partially_invoiced";
}

export type Sucty = {
  subtotal: number;
  vat_total: number;
  total: number;
  /** Hodnota toho, čo ešte nie je vyfakturované — bez DPH. */
  zostava: number;
};

export function suctyObjednavky(polozky: PolozkaObjednavky[]): Sucty {
  let subtotal = 0;
  let vat = 0;
  let zostava = 0;
  for (const p of polozky ?? []) {
    const mnozstvo = cislo(p.quantity);
    const cena = cislo(p.unit_price);
    const zaklad = centy(mnozstvo * cena);
    subtotal += zaklad;
    vat += centy((zaklad * cislo(p.vat_rate)) / 100);
    zostava += centy(zostavaVybavit(p) * cena);
  }
  subtotal = centy(subtotal);
  vat = centy(vat);
  return { subtotal, vat_total: vat, total: centy(subtotal + vat), zostava: centy(zostava) };
}

/**
 * Položky pre faktúru z objednávky — len to, čo ešte zostáva vybaviť. Položka
 * vybavená celá sa na faktúru nedostane, inak by sa odberateľovi fakturovalo
 * druhýkrát to isté.
 */
export function polozkyNaFakturu<T extends PolozkaObjednavky>(polozky: T[]): (T & { quantity: number })[] {
  return (polozky ?? [])
    .map((p) => ({ ...p, quantity: zostavaVybavit(p) }))
    .filter((p) => p.quantity > 0);
}

/**
 * O koľko sa po vystavení faktúry posunie vybavenie položky. Fakturovať sa dá
 * aj menej, než zostávalo; viac než zostáva sa nezapočíta, aby stav objednávky
 * neprepadol cez sto percent.
 */
export function novoVybavene(p: PolozkaObjednavky, fakturovane: unknown): number {
  const zostatok = zostavaVybavit(p);
  const f = Math.max(0, cislo(fakturovane));
  return m4(cislo(p.invoiced_quantity) + Math.min(f, zostatok));
}

/** Koľko percent objednávky je vybavených — na ukazovateľ v zozname. */
export function percentoVybavenia(polozky: PolozkaObjednavky[]): number {
  const objednane = (polozky ?? []).reduce((s, p) => s + cislo(p.quantity), 0);
  if (objednane <= 0) return 0;
  const vybavene = (polozky ?? []).reduce(
    (s, p) => s + Math.min(cislo(p.invoiced_quantity), cislo(p.quantity)),
    0,
  );
  return Math.round((vybavene / objednane) * 100);
}

/**
 * Objednávka je po termíne, keď má požadovaný dátum dodania v minulosti a ešte
 * nie je vybavená. Porovnáva sa reťazcami v tvare RRRR-MM-DD — `new Date()` by
 * na prelome dňa posunul termín o deň.
 */
export function jePoTermine(
  requested_date: string | null | undefined,
  stav: StavPrijatejObjednavky,
  dnes: string,
): boolean {
  if (!requested_date || !dnes) return false;
  if (!jeOtvorena(stav) || stav === "draft") return false;
  return requested_date < dnes;
}
