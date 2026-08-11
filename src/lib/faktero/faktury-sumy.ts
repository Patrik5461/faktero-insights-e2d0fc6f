/**
 * Pravidlá pre sčítavanie vystavených dokladov.
 *
 * Faktúry, zálohové faktúry a dobropisy sedia v jednej tabuľke, takže každý
 * súčet musí rozlišovať typ. Kde sa to zabudlo, obrat aj DPH vyšli vyššie:
 * zálohová faktúra sa započítala k tomu istému plneniu druhýkrát a dobropis
 * namiesto odpočtu pripočítal.
 *
 * Rovnaké pravidlo drží `vynosZFaktury` vo vyhodnotení zákaziek — tam sa
 * počíta zo základu dane, tu zo súm, ktoré ukazuje stránka.
 */

export type DokladRiadok = {
  status?: string | null;
  type?: string | null;
  due_date?: string | null;
  paid_at?: string | null;
  deleted_at?: string | null;
};

/** Doklad, ktorý patrí do obratu a do priznania DPH. */
export function jeZapocitatelny(f: DokladRiadok): boolean {
  if (f.deleted_at) return false;
  if (f.status === "draft" || f.status === "cancelled") return false;
  // Zálohová faktúra je výzva na zaplatenie preddavku, nie plnenie.
  if (f.type === "proforma") return false;
  return true;
}

/** Dobropis znižuje — do súčtov vstupuje záporne. */
export function znamienkoDokladu(typ: string | null | undefined): 1 | -1 {
  return typ === "credit_note" ? -1 : 1;
}

/** Súčet poľa cez doklady, ktoré sa počítajú, so správnym znamienkom. */
export function sucetDokladov<T extends DokladRiadok & Record<string, unknown>>(
  doklady: T[],
  pole: keyof T,
): number {
  const s = doklady.reduce(
    (a, f) => (jeZapocitatelny(f) ? a + znamienkoDokladu(f.type) * Number(f[pole] ?? 0) : a),
    0,
  );
  return Math.round(s * 100) / 100;
}

/** Neuhradená faktúra — čaká sa na peniaze. */
export function jeOtvorena(f: DokladRiadok): boolean {
  return jeZapocitatelny(f) && f.type !== "credit_note" && !f.paid_at && f.status !== "paid";
}

/**
 * Po splatnosti sa počíta z dátumu, nie zo stavu.
 *
 * Stav `overdue` v databáze existuje, ale **nikto ho nezapisuje** — žiadna
 * časť aplikácie ani cron ho nenastaví. Filter podľa neho preto vždy vráti
 * prázdno a dlaždica ukazuje nulu aj vtedy, keď je po splatnosti polovica
 * faktúr.
 */
export function jePoSplatnosti(f: DokladRiadok, dnesISO: string): boolean {
  return jeOtvorena(f) && !!f.due_date && f.due_date < dnesISO;
}
