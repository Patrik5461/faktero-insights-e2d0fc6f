/** Shared payment-method codes + Slovak labels (UI, PDF, API). */
/*
  Čo sa dá vybrať na doklade. „Online platba (GoPay)" tu zámerne nie je:
  platby kartou pre zákazníkov firmy sa stiahli (viď `/nastavenia/online-platby`),
  takže doklad by sľuboval spôsob úhrady, ktorý odberateľ nemá ako použiť.
  V `LABELS` ostáva — staršie doklady s tou hodnotou sa musia vypísať správne.
*/
export const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bankový prevod" },
  { value: "card", label: "Karta" },
  { value: "cash", label: "Hotovosť" },
] as const;

export type PaymentMethodCode = (typeof PAYMENT_METHODS)[number]["value"];

const LABELS: Record<string, string> = {
  bank_transfer: "Bankový prevod",
  transfer: "Bankový prevod",
  prevod: "Bankový prevod",
  card: "Karta",
  karta: "Karta",
  credit_card: "Karta",
  cash: "Hotovosť",
  hotovost: "Hotovosť",
  online: "Online platba (GoPay)",
  gopay: "Online platba (GoPay)",
};

export function paymentMethodLabel(code?: string | null): string {
  if (!code) return "—";
  return LABELS[String(code).toLowerCase()] ?? String(code);
}

/** Normalizes free-form/legacy input to a canonical code (used by the API). */
export function normalizePaymentMethod(code?: string | null): string {
  if (!code) return "bank_transfer";
  const k = String(code).toLowerCase();
  if (k === "transfer" || k === "prevod") return "bank_transfer";
  if (k === "karta" || k === "credit_card") return "card";
  if (k === "hotovost") return "cash";
  if (k === "gopay") return "online";
  return k;
}
