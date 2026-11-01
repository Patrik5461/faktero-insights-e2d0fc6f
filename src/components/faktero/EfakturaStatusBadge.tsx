import { CheckCircle2, AlertTriangle, FileCode2, Send, Circle } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { StavOdznak, TON_EFAKTURY, tonStavu } from "@/components/faktero/web/Stav";

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

const MAP: Record<EfakturaUiStatus, { label: string; Icon: typeof CheckCircle2 }> = {
  not_created: {
    label: "eFaktúra: nevytvorená",
    Icon: Circle,
  },
  generated: {
    label: "eFaktúra: vygenerovaná",
    Icon: FileCode2,
  },
  validation_failed: {
    label: "eFaktúra: chyby validácie",
    Icon: AlertTriangle,
  },
  ready_to_send: {
    label: "eFaktúra: pripravená",
    Icon: Send,
  },
};

export function EfakturaStatusBadge({ status }: { status: EfakturaUiStatus }) {
  const { t } = useT();
  const m = MAP[status];
  const Icon = m.Icon;
  return (
    <StavOdznak ton={tonStavu(TON_EFAKTURY, status)} ikona={<Icon />}>
      {t(m.label)}
    </StavOdznak>
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
