import { useState } from "react";
import { toast } from "sonner";
import { CheckCheck, Loader2 } from "lucide-react";
import { hromadneDokladyFn } from "@/lib/faktero/doklady-hromadne.functions";
import { useT } from "@/lib/i18n/useT";

/**
 * „Skontrolované (n)“ v lište výberu Prijatých faktúr a Bločkov — označí
 * vybrané doklady, ktoré čakajú na kontrolu, ako skontrolované (to isté ako
 * tlačidlo na detaile). `ids` sú už len doklady na kontrolu
 * (`vybraneNaKontrolu`); bez nich sa tlačidlo neukáže.
 */
export function SkontrolovaneHromadne({
  companyId,
  agenda,
  ids,
  onHotovo,
  className,
}: {
  companyId: string;
  agenda: "prijata" | "doklad";
  ids: string[];
  onHotovo: () => void;
  className?: string;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  if (!ids.length) return null;

  async function spusti() {
    setBusy(true);
    try {
      let zmenenych = 0;
      const preskocene: string[] = [];
      for (let i = 0; i < ids.length; i += 500) {
        const d = await hromadneDokladyFn({
          data: {
            company_id: companyId,
            agenda,
            ids: ids.slice(i, i + 500),
            akcia: { typ: "skontrolovane" },
          },
        });
        zmenenych += d.zmenenych;
        preskocene.push(...d.preskocene);
      }
      if (zmenenych) toast.success(t("Skontrolované doklady: {n}", { n: zmenenych }));
      else if (!preskocene.length) toast(t("Nebolo čo meniť"));
      if (preskocene.length)
        toast.warning(t("Preskočené: {n}", { n: preskocene.length }), {
          description: preskocene.slice(0, 5).join("\n") + (preskocene.length > 5 ? "\n…" : ""),
        });
      onHotovo();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void spusti()}
      disabled={busy}
      data-testid="hromadne-skontrolovane"
      title={t("Označí vybrané doklady, ktoré čakajú na kontrolu, ako skontrolované.")}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
      }
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
      {t("Skontrolované ({n})", { n: ids.length })}
    </button>
  );
}
