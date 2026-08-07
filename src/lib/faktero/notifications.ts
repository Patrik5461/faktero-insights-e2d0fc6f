/**
 * Notifikácie sa nikde neukladajú — počítajú sa pri každom otvorení zvončeka
 * z toho, ako veci naozaj stoja. Ukladá sa len to, čo si kto prečítal.
 *
 * Dôvod: uložené notifikácie starnú. Faktúra sa medzitým zaplatí, transakcia
 * spáruje — a v zvončeku by ostalo visieť niečo, čo už neplatí. Takto zmizne
 * upozornenie v tej istej chvíli, ako pominie dôvod.
 *
 * `key` je zároveň identifikátor prečítania. Musí byť stabilný medzi behmi,
 * inak by sa prečítaná notifikácia vrátila ako nová.
 */

export type NotificationSeverity = "info" | "warning" | "danger";

export type AppNotification = {
  key: string;
  severity: NotificationSeverity;
  title: string;
  detail: string;
  /** Cesta v aplikácii, kam sa má používateľ po kliknutí dostať. */
  to: string;
  /** Dátum udalosti (YYYY-MM-DD) — podľa neho sa radí. */
  date: string;
  read?: boolean;
};

export type OverdueInvoice = {
  id: string;
  invoice_number: string | null;
  customer_name: string | null;
  total: number | null;
  currency: string | null;
  due_date: string | null;
};

export type OverduePurchase = {
  id: string;
  invoice_number: string | null;
  supplier_name: string | null;
  amount_total: number | null;
  currency: string | null;
  due_date: string | null;
};

export type UnmatchedIncoming = {
  id: string;
  booking_date: string | null;
  amount: number | null;
  currency: string | null;
  counterparty: string | null;
  variable_symbol: string | null;
};

export type FailedPayment = {
  id: string;
  purchase_invoice_id: string | null;
  creditor_name: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  error_message: string | null;
  updated_at: string | null;
};

export type NotificationInput = {
  /** Dnešný dátum ako YYYY-MM-DD. Berie sa zvonku, nech sa dá testovať. */
  today: string;
  overdueInvoices: OverdueInvoice[];
  overduePurchases: OverduePurchase[];
  unmatchedIncoming: UnmatchedIncoming[];
  failedPayments: FailedPayment[];
};

const SEVERITY_ORDER: Record<NotificationSeverity, number> = { danger: 0, warning: 1, info: 2 };

export function formatMoney(amount: number | null, currency: string | null): string {
  const value = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  try {
    return new Intl.NumberFormat("sk-SK", {
      style: "currency",
      currency: currency || "EUR",
    }).format(value);
  } catch {
    // Neznámy kód meny by Intl zhodil — radšej surové číslo než prázdny zvonček.
    return `${value.toFixed(2)} ${currency ?? ""}`.trim();
  }
}

/** Počet celých dní medzi dvoma dátumami v tvare YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** „3 dni", „1 deň", „12 dní" — slovenčina má tri tvary. */
export function dniText(n: number): string {
  if (n === 1) return "1 deň";
  if (n >= 2 && n <= 4) return `${n} dni`;
  return `${n} dní`;
}

export function buildNotifications(input: NotificationInput): AppNotification[] {
  const out: AppNotification[] = [];

  for (const f of input.overdueInvoices) {
    if (!f.due_date) continue;
    const dni = daysBetween(f.due_date, input.today);
    if (dni <= 0) continue;
    out.push({
      key: `invoice_overdue:${f.id}`,
      // Mesiac po splatnosti je iná situácia než včerajšia splatnosť.
      severity: dni > 30 ? "danger" : "warning",
      title: f.invoice_number
        ? `Faktúra ${f.invoice_number} je ${dniText(dni)} po splatnosti`
        : `Faktúra je ${dniText(dni)} po splatnosti`,
      detail: `${f.customer_name ?? "Neznámy odberateľ"} · ${formatMoney(f.total, f.currency)}`,
      to: `/faktury/${f.id}`,
      date: f.due_date,
    });
  }

  for (const f of input.overduePurchases) {
    if (!f.due_date) continue;
    const dni = daysBetween(f.due_date, input.today);
    if (dni <= 0) continue;
    out.push({
      key: `purchase_overdue:${f.id}`,
      severity: dni > 30 ? "danger" : "warning",
      title: `Neuhradená prijatá faktúra ${f.invoice_number ?? ""}`.trim(),
      detail: `${f.supplier_name ?? "Neznámy dodávateľ"} · ${formatMoney(f.amount_total, f.currency)} · ${dniText(dni)} po splatnosti`,
      to: `/prijate-faktury/${f.id}`,
      date: f.due_date,
    });
  }

  for (const t of input.unmatchedIncoming) {
    if (!t.booking_date) continue;
    out.push({
      key: `bank_unmatched:${t.id}`,
      severity: "info",
      title: `Nepriradená platba ${formatMoney(t.amount, t.currency)}`,
      detail: [t.counterparty ?? "Neznáma protistrana", t.variable_symbol ? `VS ${t.variable_symbol}` : null]
        .filter(Boolean)
        .join(" · "),
      to: "/bankove-ucty/transakcie",
      date: t.booking_date,
    });
  }

  for (const p of input.failedPayments) {
    const date = (p.updated_at ?? "").slice(0, 10) || input.today;
    out.push({
      key: `payment_failed:${p.id}`,
      severity: "danger",
      title: `Platba ${formatMoney(p.amount, p.currency)} neprešla`,
      detail: [p.creditor_name ?? "Neznámy príjemca", p.error_message ?? stavText(p.status)]
        .filter(Boolean)
        .join(" · "),
      to: p.purchase_invoice_id ? `/prijate-faktury/${p.purchase_invoice_id}` : "/bankove-ucty",
      date,
    });
  }

  // Najprv to najhoršie. V rámci rovnakej závažnosti platí, že pri dlhoch je
  // najstarší dátum najhorší (najdlhšie po splatnosti), kým pri oznamoch je
  // zaujímavé to najčerstvejšie.
  out.sort((a, b) => {
    const podlaZavaznosti = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (podlaZavaznosti !== 0) return podlaZavaznosti;
    return a.severity === "info" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
  });
  return out;
}

function stavText(status: string | null): string {
  switch (status) {
    case "rejected":
      return "banka platbu zamietla";
    case "failed":
      return "odoslanie zlyhalo";
    case "cancelled":
      return "platba bola zrušená";
    default:
      return "neznámy stav";
  }
}

/** Doplní príznak prečítania a spočíta neprečítané. */
export function applyReadState(
  items: AppNotification[],
  readKeys: Iterable<string>,
): { items: AppNotification[]; unread: number } {
  const read = new Set(readKeys);
  const withState = items.map((n) => ({ ...n, read: read.has(n.key) }));
  return { items: withState, unread: withState.filter((n) => !n.read).length };
}
