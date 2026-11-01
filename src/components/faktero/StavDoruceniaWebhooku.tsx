import { useT } from "@/lib/i18n/useT";
import { StavOdznak, type TonStavu } from "@/components/faktero/web/Stav";

/** Štítok stavu doručenia webhooku — rovnaký v nastaveniach aj v histórii. */
const STAVY: Record<string, { label: string; ton: TonStavu }> = {
  success: { label: "Úspech", ton: "uspech" },
  retrying: { label: "Opakuje sa", ton: "pozor" },
  failed: { label: "Vzdané", ton: "chyba" },
  pending: { label: "Čaká", ton: "priebeh" },
};

/** „Poslať znova“ dáva zmysel len pre nedoručené — úspešné už prijímateľ má. */
export function mozeSaPoslatZnova(status: string): boolean {
  return status === "retrying" || status === "failed";
}

export function StavDoruceniaWebhooku({ status }: { status: string }) {
  const { t } = useT();
  const m = STAVY[status] ?? { label: status, ton: "neutralny" as TonStavu };
  return <StavOdznak ton={m.ton}>{t(m.label)}</StavOdznak>;
}
