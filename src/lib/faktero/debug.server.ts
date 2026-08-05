/**
 * Ladiace logy pre integrácie, ktoré sa v produkcii nezapínajú.
 *
 * Vzniklo z auditu: v `finstat.server.ts` a `sklad.parse-delivery-note.ts` boli
 * natvrdo `console.log` s náhľadom surovej odpovede (dopyt používateľa, kus
 * odpovede AI nad nahratým dokladom). Diagnostiku tam chceme mať, ale nie
 * zapnutú stále a nie s obsahom dokladov v produkčnom logu.
 *
 * Zapnutie: FAKTERO_DEBUG=finstat,parse  (alebo FAKTERO_DEBUG=* pre všetko)
 */
let cached: Set<string> | null = null;

function scopes(): Set<string> {
  if (cached) return cached;
  const raw = process.env.FAKTERO_DEBUG ?? "";
  cached = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return cached;
}

export function isDebugEnabled(scope: string): boolean {
  const s = scopes();
  return s.has("*") || s.has(scope.toLowerCase());
}

export function debugLog(scope: string, ...args: unknown[]): void {
  if (!isDebugEnabled(scope)) return;
  console.log(`[${scope}]`, ...args);
}
