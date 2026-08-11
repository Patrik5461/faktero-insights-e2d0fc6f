/**
 * Map DB-side FAKTERO_PLAN_BLOCK:<kind> errors raised by the
 * faktero_enforce_write triggers into friendly Slovak messages.
 */
const KIND_LABEL: Record<string, string> = {
  invoice:
    "Nemôžete vytvoriť faktúru — predplatné je neaktívne alebo ste dosiahli mesačný limit. Aktivujte vyšší plán v sekcii Predplatné.",
  customer:
    "Nemôžete pridať odberateľa — predplatné je neaktívne. Aktivujte plán v sekcii Predplatné.",
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

/**
 * Hlášky z databázy, ktoré sa nesmú dostať pred používateľa tak, ako prídu.
 *
 * „duplicate key value violates unique constraint …" nie je pre nikoho
 * odpoveď na otázku, čo spravil zle. Prekladá sa preto na vetu, z ktorej sa
 * dá konať.
 */
function dbMessage(err: unknown): string | null {
  const msg = String((err as any)?.message ?? err ?? "");
  if (!msg) return null;
  if (/duplicate key value|already exists/i.test(msg)) {
    if (/_name_key|_name_uniq/i.test(msg)) return "Taký názov už existuje.";
    if (/number/i.test(msg)) return "Doklad s týmto číslom už existuje.";
    if (/ico|email/i.test(msg)) return "Záznam s týmito údajmi už existuje.";
    return "Taký záznam už existuje.";
  }
  if (/FAKTERO_STOCK:negative_stock/.test(msg))
    return "Na sklade nie je dostatok kusov pre tento výdaj.";
  if (/violates foreign key constraint/i.test(msg))
    return "Záznam sa používa v inom doklade, preto sa nedá zmazať.";
  if (/violates not-null constraint/i.test(msg)) return "Nie je vyplnené povinné pole.";
  if (/invalid input syntax for type date/i.test(msg)) return "Dátum nie je vyplnený správne.";
  if (/violates row-level security|permission denied/i.test(msg))
    return "Na túto akciu nemáte oprávnenie.";
  return null;
}

/** Wraps a thrown error: returns plan message when applicable, else generic. */
export function friendlyError(err: unknown, fallback = "Chyba"): string {
  return planBlockMessage(err) ?? dbMessage(err) ?? (err as any)?.message ?? fallback;
}
