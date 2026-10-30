/** Prerušené spojenie zo strany klienta — `AbortError` alebo `ECONNRESET` z http servera. */
export function jeOdpojenieKlienta(chyba: unknown, request?: Request): boolean {
  if (request?.signal?.aborted) return true;
  for (let e: any = chyba, i = 0; e && i < 4; e = e.cause, i++) {
    if (e?.name === "AbortError" || e?.code === "ECONNRESET" || e?.code === "ABORT_ERR")
      return true;
    if (/^(aborted|This operation was aborted)$/.test(String(e?.message ?? ""))) return true;
  }
  return false;
}
