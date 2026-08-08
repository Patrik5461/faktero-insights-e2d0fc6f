/**
 * Objednávky u dodávateľov — čistá logika, aby sa dala otestovať bez databázy.
 *
 * Objednávka žije v piatich stavoch. `draft` sa dá voľne meniť aj zmazať;
 * odoslaním prechádza do `sent` a odvtedy je to doklad, ktorý sa už nemaže, len
 * ruší. Príjmom tovaru sa dostane do `partially_received` alebo `received`.
 *
 * Stav sa **neurčuje ručne** — počíta sa z prijatých množstiev. Ručne nastavený
 * stav by sa skôr či neskôr rozišiel s tým, čo je naozaj na sklade.
 */

export type StavObjednavky =
  | "draft"
  | "sent"
  | "partially_received"
  | "received"
  | "cancelled";

export type PolozkaObjednavky = {
  quantity: number;
  received_quantity: number;
  unit_price?: number;
  vat_rate?: number;
};

function cislo(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/** Zaokrúhlenie na štyri desatinné miesta — množstvá sa zadávajú aj v metroch. */
function m4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}

/** Koľko z položky ešte neprišlo. Nikdy záporné — nadmerný príjem nie je dlh. */
export function zostavaPrijat(p: PolozkaObjednavky): number {
  return m4(Math.max(0, cislo(p.quantity) - cislo(p.received_quantity)));
}

/**
 * Stav podľa toho, čo naozaj prišlo. Zrušenú objednávku príjem nevzkriesi.
 */
export function stavPodlaPrijatia(
  polozky: PolozkaObjednavky[],
  aktualny: StavObjednavky,
): StavObjednavky {
  if (aktualny === "cancelled" || aktualny === "draft") return aktualny;
  if (polozky.length === 0) return aktualny;

  const prijateSpolu = polozky.reduce((s, p) => s + cislo(p.received_quantity), 0);
  const chyba = polozky.some((p) => zostavaPrijat(p) > 0);

  if (!chyba) return "received";
  if (prijateSpolu > 0) return "partially_received";
  return "sent";
}

/** Objednávka je v hre, kým nie je vybavená alebo zrušená. */
export function jeOtvorena(stav: StavObjednavky): boolean {
  return stav === "sent" || stav === "partially_received";
}

/**
 * Množstvo na ceste pre návrh doobjednania — teda to, čo je objednané a ešte
 * neprišlo. Rozpracované objednávky (`draft`) sa nerátajú: nikto ich neodoslal,
 * takže tovar nikto neposiela.
 */
export function objednaneNaCeste(
  polozky: Array<PolozkaObjednavky & { stock_item_id: string | null; stav: StavObjednavky }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of polozky) {
    if (!p.stock_item_id || !jeOtvorena(p.stav)) continue;
    const zvysok = zostavaPrijat(p);
    if (zvysok <= 0) continue;
    out.set(p.stock_item_id, m4((out.get(p.stock_item_id) ?? 0) + zvysok));
  }
  return out;
}

export function suctyObjednavky(polozky: PolozkaObjednavky[]) {
  let bezDph = 0;
  let dph = 0;
  for (const p of polozky) {
    const riadok = cislo(p.quantity) * cislo(p.unit_price);
    bezDph += riadok;
    dph += (riadok * cislo(p.vat_rate)) / 100;
  }
  const zaokruhli = (x: number) => Math.round(x * 100) / 100;
  return {
    subtotal: zaokruhli(bezDph),
    vat_total: zaokruhli(dph),
    total: zaokruhli(bezDph + dph),
  };
}

export const STAV_POPIS: Record<StavObjednavky, string> = {
  draft: "Rozpracovaná",
  sent: "Odoslaná",
  partially_received: "Čiastočne prijatá",
  received: "Prijatá",
  cancelled: "Zrušená",
};
