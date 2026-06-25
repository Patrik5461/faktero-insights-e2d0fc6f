/**
 * Map DB-side FAKTERO_PLAN_BLOCK:<kind> errors raised by the
 * faktero_enforce_write triggers into friendly Slovak messages.
 */
const KIND_LABEL: Record<string, string> = {
  invoice: "Nemôžete vytvoriť faktúru — predplatné je neaktívne alebo ste dosiahli mesačný limit. Aktivujte vyšší plán v sekcii Predplatné.",
  customer: "Nemôžete pridať odberateľa — predplatné je neaktívne. Aktivujte plán v sekcii Predplatné.",
  quote: "Nemôžete vytvoriť ponuku — predplatné je neaktívne. Aktivujte plán v sekcii Predplatné.",
  recurring: "Opakované faktúry nie sú dostupné na vašom pláne. Prejdite na Business alebo vyšší.",
  api_key: "API kľúče nie sú dostupné na vašom pláne. Prejdite na Business alebo vyšší.",
  webhook: "Webhooky nie sú dostupné na vašom pláne. Prejdite na Business alebo vyšší.",
  user: "Dosiahli ste limit používateľov pre váš plán. Prejdite na vyšší plán.",
};

export function planBlockMessage(err: unknown): string | null {
  const msg = String((err as any)?.message ?? err ?? "");
  const m = msg.match(/FAKTERO_PLAN_BLOCK:([a-z_]+)/);
  if (!m) return null;
  return KIND_LABEL[m[1]] ?? "Akcia je blokovaná aktuálnym plánom predplatného.";
}

/** Wraps a thrown error: returns plan message when applicable, else generic. */
export function friendlyError(err: unknown, fallback = "Chyba"): string {
  return planBlockMessage(err) ?? (err as any)?.message ?? fallback;
}