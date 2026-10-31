import { useT } from "@/lib/i18n/useT";

/** Štítok stavu doručenia webhooku — rovnaký v nastaveniach aj v histórii. */
const STAVY: Record<string, { label: string; cls: string }> = {
  success: { label: "Úspech", cls: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20" },
  retrying: { label: "Opakuje sa", cls: "bg-amber-500/10 text-amber-800 ring-amber-500/20" },
  failed: { label: "Vzdané", cls: "bg-destructive/10 text-destructive ring-destructive/20" },
  pending: { label: "Čaká", cls: "bg-amber-500/10 text-amber-800 ring-amber-500/20" },
};

/** „Poslať znova“ dáva zmysel len pre nedoručené — úspešné už prijímateľ má. */
export function mozeSaPoslatZnova(status: string): boolean {
  return status === "retrying" || status === "failed";
}

export function StavDoruceniaWebhooku({ status }: { status: string }) {
  const { t } = useT();
  const m = STAVY[status] ?? { label: status, cls: "bg-muted text-muted-foreground ring-border" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${m.cls}`}
    >
      {t(m.label)}
    </span>
  );
}
