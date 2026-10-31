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

/**
 * Chyba vznikla zavretím spojenia v samotnom HTTP serveri (srvx/Node), nie
 * v našom kóde — stack ukazuje na zatvorenie socketu. Užšie ako
 * `jeOdpojenieKlienta`: vlastný `AbortController` (časový limit volania banky)
 * sem nepatrí a v logu ostane.
 */
export function jeOdpojenieZoServera(chyba: unknown): boolean {
  for (let e: any = chyba, i = 0; e && i < 4; e = e.cause, i++) {
    const stack = String(e?.stack ?? "");
    const odpojenie =
      e?.name === "AbortError" ||
      e?.code === "ECONNRESET" ||
      /^(aborted|This operation was aborted)$/.test(String(e?.message ?? ""));
    if (odpojenie && /onServerResponseClose|abortIncoming|socketOnClose|srvx\.mjs/.test(stack))
      return true;
  }
  return false;
}

/**
 * h3 a srvx vypíšu každé odpojenie klienta cez `console.error` ako 30-riadkový
 * blok (31. 10. 2026: ~1 400 blokov za deň, dve tretiny chybového logu pm2).
 * Nie je to chyba a nikto odpoveď neuvidí — v logu len prekrývali skutočné
 * chyby. Ostatné výpisy idú ďalej bez zmeny.
 */
export function stisOdpojeniaVLogu(): void {
  const c = console as Console & { __bezOdpojeni?: boolean };
  if (c.__bezOdpojeni) return;
  c.__bezOdpojeni = true;
  const povodny = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      if (args.length === 1 && jeOdpojenieZoServera(args[0])) return;
    } catch {
      /* filter nesmie zhltnúť výpis */
    }
    povodny(...args);
  };
}
