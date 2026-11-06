/*
  Udalosti webhooku, ktoré smie vyvolať prehliadač (`triggerEventFn`).

  Predtým server podpísal ľubovoľnú udalosť s dátami od klienta — člen firmy
  tak vedel poslať integrátorovi „faktúra uhradená“ za neuhradenú faktúru.
  Teraz klient pošle len typ a id; dáta sa čítajú z databázy a udalosť odíde,
  len keď jej stav dokladu naozaj zodpovedá. `invoice.paid` a
  `invoice.cancelled` posiela výhradne fronta `webhook_outbox` (spúšťač).
*/
export const UDALOSTI_Z_KLIENTA = ["invoice.created", "invoice.sent", "customer.created"] as const;
export type UdalostZKlienta = (typeof UDALOSTI_Z_KLIENTA)[number];

/** Udalosť sa smie vyvolať len krátko po vzniku / odoslaní dokladu. */
export const OKNO_UDALOSTI_MS = 15 * 60 * 1000;

const cerstve = (cas: unknown, teraz: number) => {
  const t = typeof cas === "string" ? Date.parse(cas) : NaN;
  return Number.isFinite(t) && teraz - t <= OKNO_UDALOSTI_MS && t - teraz <= 60_000;
};

/** Prečo udalosť neodíde (text pre log/chybu), alebo null = smie odísť. */
export function prekazkaUdalosti(
  event: UdalostZKlienta,
  riadok: Record<string, any> | null,
  teraz = Date.now(),
): string | null {
  if (!riadok) return "Doklad sa nenašiel.";
  if (riadok.deleted_at) return "Doklad je zmazaný.";
  if (event === "invoice.created") {
    if (!cerstve(riadok.created_at, teraz)) return "Faktúra nevznikla práve teraz.";
    return null;
  }
  if (event === "invoice.sent") {
    if (riadok.status !== "sent" || !riadok.sent_at) return "Faktúra nie je odoslaná.";
    if (!cerstve(riadok.sent_at, teraz)) return "Faktúra nebola odoslaná práve teraz.";
    return null;
  }
  if (event === "customer.created") {
    if (!cerstve(riadok.created_at, teraz)) return "Kontakt nevznikol práve teraz.";
    return null;
  }
  return "Neznáma udalosť.";
}
