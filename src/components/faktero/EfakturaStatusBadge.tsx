import { CheckCircle2, AlertTriangle, FileCode2, Send, Circle } from "lucide-react";

export type EfakturaUiStatus =
  | "not_created"
  | "generated"
  | "validation_failed"
  | "ready_to_send";

export function deriveEfakturaUiStatus(doc: {
  status?: string | null;
  validation_errors?: unknown;
} | null | undefined): EfakturaUiStatus {
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
    cls: "bg-primary/10 text-primary border-primary/30",
    Icon: FileCode2,
  },
  validation_failed: {
    label: "eFaktúra: chyby validácie",
    cls: "bg-destructive/10 text-destructive border-destructive/30",
    Icon: AlertTriangle,
  },
  ready_to_send: {
    label: "eFaktúra: pripravená",
    cls: "bg-primary/15 text-primary border-primary/40",
    Icon: Send,
  },
};

export function EfakturaStatusBadge({ status }: { status: EfakturaUiStatus }) {
  const m = MAP[status];
  const Icon = m.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.cls}`}>
      <Icon className="h-3.5 w-3.5" /> {m.label}
    </span>
  );
}