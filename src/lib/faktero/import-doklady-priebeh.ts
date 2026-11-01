/**
 * Import prijatých dokladov (/importy/doklady) – pravidlá, ktoré sa dajú
 * otestovať bez prehliadača: strop počtu súborov a dopytovanie na priebeh.
 */

/** Najviac súborov naraz – server ich sťahuje a číta v jednej požiadavke. */
export const MAX_SUBOROV_IMPORTU = 20;

/**
 * Pridá nové súbory k vybraným. Čo sa nezmestí pod strop, nepridá – a povie,
 * koľko ich bolo (predtým sa ticho zahodili).
 */
export function pridajSuborySoStropom<T>(
  vybrane: readonly T[],
  nove: readonly T[],
  max = MAX_SUBOROV_IMPORTU,
): { subory: T[]; nepridane: number } {
  const spolu = [...vybrane, ...nove];
  return { subory: spolu.slice(0, max), nepridane: Math.max(0, spolu.length - max) };
}

export type StavUlohy = { status: string } & Record<string, unknown>;

export type KoniecSledovania<J extends StavUlohy> =
  /** Úloha skončila (`status` ≠ running). */
  | { druh: "hotovo"; job: J }
  /** Stav sa opakovane nepodarilo zistiť – import môže bežať ďalej. */
  | { druh: "nezistene"; chyba: string; job: J | null }
  /** Úloha beží dlhšie než strop – stránka sa prestane pýtať. */
  | { druh: "strop"; job: J | null }
  /** Stránku človek zavrel – nič sa nezobrazuje. */
  | { druh: "zrusene"; job: J | null };

/**
 * Pýta sa na stav importu, kým neskončí. Prechodnú chybu siete zopakuje
 * (`pokusy` za sebou), po odchode zo stránky (`zrusene()`) a po `stropMs`
 * skončí – predtým sa pýtal donekonečna a pri chybe ostalo „Importujem…“.
 */
export async function sledujImport<J extends StavUlohy>(o: {
  zisti: () => Promise<J>;
  cakaj: (ms: number) => Promise<unknown>;
  zrusene: () => boolean;
  priebeh?: (job: J) => void;
  intervalMs?: number;
  stropMs?: number;
  pokusy?: number;
}): Promise<KoniecSledovania<J>> {
  const interval = o.intervalMs ?? 2500;
  const strop = o.stropMs ?? 30 * 60 * 1000;
  const pokusy = o.pokusy ?? 3;
  let uplynulo = 0;
  let chybyZaSebou = 0;
  let posledny: J | null = null;
  for (;;) {
    if (uplynulo >= strop) return { druh: "strop", job: posledny };
    await o.cakaj(interval);
    uplynulo += interval;
    if (o.zrusene()) return { druh: "zrusene", job: posledny };
    try {
      const j = await o.zisti();
      chybyZaSebou = 0;
      posledny = j;
      if (o.zrusene()) return { druh: "zrusene", job: j };
      o.priebeh?.(j);
      if (j.status !== "running") return { druh: "hotovo", job: j };
    } catch (e: any) {
      chybyZaSebou++;
      if (chybyZaSebou >= pokusy)
        return { druh: "nezistene", chyba: String(e?.message ?? e), job: posledny };
    }
  }
}
