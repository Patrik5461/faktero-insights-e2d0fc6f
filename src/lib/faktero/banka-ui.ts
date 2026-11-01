/*
  Texty bankových obrazoviek, ktoré sa opakujú na viacerých miestach.
*/

/** Vysvetlenie pre rolu bez práva pripájať banku (účtovník, zamestnanec, vlastný prístup). */
export const TEXT_BANKU_SPRAVUJE = "Banku pripája a odpája majiteľ alebo administrátor firmy.";

const STAVY: Record<string, string> = {
  connected: "Pripojené",
  pending: "Čaká na potvrdenie v banke",
  expired: "Súhlas vypršal",
  revoked: "Súhlas zrušený",
  error: "Chyba pripojenia",
  disconnected: "Odpojené",
};

/** Stav pripojenia banky ako text (slovenský kľúč pre t()); neznámy stav = „Neznámy stav“. */
export function nazovStavuPripojenia(stav: string | null | undefined): string {
  return STAVY[String(stav ?? "")] ?? "Neznámy stav";
}

/**
 * Účty, z ktorých sa dá platiť cez Tatra banku (PIS): len účty pripojenia
 * `tatrabanka` v stave `connected` s neprepadnutým súhlasom. Fio, Wise,
 * Revolut, nahratý výpis ani e-mailové notifikácie platiť nevedia.
 */
export function uctyPrePlatbuTb<
  U extends { bank_connection_id?: string | null },
  C extends { id: string; provider: string; status: string; token_expires_at?: string | null },
>(ucty: readonly U[], pripojenia: readonly C[], teraz: Date = new Date()): U[] {
  const platne = new Set(
    pripojenia
      .filter(
        (c) =>
          c.provider === "tatrabanka" &&
          c.status === "connected" &&
          (!c.token_expires_at || new Date(c.token_expires_at).getTime() > teraz.getTime()),
      )
      .map((c) => c.id),
  );
  return ucty.filter((u) => u.bank_connection_id && platne.has(u.bank_connection_id));
}
