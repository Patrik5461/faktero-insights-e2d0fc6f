import { CheckCircle2, AlertTriangle, FileCode2, Send, Circle } from "lucide-react";
import { useT } from "@/lib/i18n/useT";

export type EfakturaUiStatus = "not_created" | "generated" | "validation_failed" | "ready_to_send";

export function deriveEfakturaUiStatus(
  doc:
    | {
        status?: string | null;
        validation_errors?: unknown;
      }
    | null
    | undefined,
): EfakturaUiStatus {
  if (!doc) return "not_created";
  const errs = Array.isArray(doc.validation_errors) ? doc.validation_errors : [];
  if (doc.status === "invalid" || errs.length > 0) return "validation_failed";
  if (doc.status === "validated") return "ready_to_send";
  return "generated";
}

const MAP: Record<EfakturaUiStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  not_created: {
    label: "eFaktúra: nevytvorená",
    cls: "bg-muted text-muted-foreground border-border",
    Icon: Circle,
  },
  generated: {
    label: "eFaktúra: vygenerovaná",
    cls: "bg-primary/10 text-primary-hover border-primary/30",
    Icon: FileCode2,
  },
  validation_failed: {
    label: "eFaktúra: chyby validácie",
    cls: "bg-destructive/10 text-destructive border-destructive/30",
    Icon: AlertTriangle,
  },
  ready_to_send: {
    label: "eFaktúra: pripravená",
    cls: "bg-primary/15 text-primary-hover border-primary/40",
    Icon: Send,
  },
};

export function EfakturaStatusBadge({ status }: { status: EfakturaUiStatus }) {
  const { t } = useT();
  const m = MAP[status];
  const Icon = m.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.cls}`}
    >
      <Icon className="h-3.5 w-3.5" /> {t(m.label)}
    </span>
  );
}

/* Surové hodnoty z databázy (enumy) po slovensky pre zoznamy eFaktúr. */
const STAV_DORUCENIA: Record<string, string> = {
  pending: "Čaká",
  sent: "Odoslaná",
  accepted: "Prijatá",
  delivered: "Doručená",
  failed: "Zlyhala",
  rejected: "Odmietnutá",
};
export function stavDorucenia(v: unknown): string {
  const s = String(v ?? "").toLowerCase();
  return STAV_DORUCENIA[s] ?? (s || "—");
}

const KANAL_DORUCENIA: Record<string, string> = {
  peppol: "Peppol",
  digitalny_postar: "Digitálny poštár",
  email: "E-mail",
  manual: "Ručne",
};
export function kanalDorucenia(v: unknown): string {
  const s = String(v ?? "").toLowerCase();
  return KANAL_DORUCENIA[s] ?? (s || "—");
}

const TYP_DOKLADU: Record<string, string> = {
  regular: "Faktúra",
  proforma: "Zálohová",
  advance_payment: "Zálohová",
  credit_note: "Dobropis",
  debit_note: "Ťarchopis",
};
export function typDokladuEfaktury(v: unknown): string {
  const s = String(v ?? "regular").toLowerCase();
  return TYP_DOKLADU[s] ?? s;
}

/** Krátky dátum a čas „14. 10. 2026 9:05“ — do tabuliek, aby sa nelámal. */
export function kratkyCas(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  const hh = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()} ${hh}:${mm}`;
}
