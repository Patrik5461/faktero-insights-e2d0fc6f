import { Shield } from "lucide-react";
import { useT } from "@/lib/i18n/useT";

/** Pás nad pätičkou hlavnej stránky — odkaz na /bezpecnost. Žiadne logo ani odznak ISO. */
export function PasBezpecnosti() {
  const { t } = useT();
  return (
    <div className="border-t border-border/60">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 py-4 text-sm text-muted-foreground sm:px-6">
        <Shield className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span>{t("Hosting s certifikáciou ISO/IEC 27001 · Dáta v EÚ · GDPR")}</span>
        <a href="/bezpecnost" className="font-medium text-primary hover:underline">
          {t("Viac o bezpečnosti →")}
        </a>
      </div>
    </div>
  );
}
