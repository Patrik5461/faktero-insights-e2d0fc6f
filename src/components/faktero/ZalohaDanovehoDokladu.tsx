import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n/useT";
import { formatujMenu } from "@/lib/faktero/mena";
import { zalohaVolnaPreDanovy } from "@/lib/faktero/prijaty-danovy-doklad";

type Zaloha = { id: string; invoice_number: string | null; amount_total: number | null; currency: string | null; status: string | null };

/**
 * Výber prijatej zálohovej faktúry, ku ktorej patrí daňový doklad k prijatej
 * platbe (Nespracované → druh „Daňový doklad k prijatej platbe“). Ponúkajú sa
 * zálohové faktúry toho istého dodávateľa (podľa IČO, bez neho podľa názvu),
 * ku ktorým ešte iný daňový doklad nie je. Prázdny výber = bez väzby; pri
 * vytvorení sa potom zálohová dohľadá podľa čísla z dokladu, ak ho vyťaženie našlo.
 */
export function ZalohaDanovehoDokladu({
  companyId,
  ico,
  nazov,
  value,
  onChange,
  className = "",
  vstup = "",
}: {
  companyId: string | null | undefined;
  ico: string;
  nazov: string;
  value: string;
  onChange: (id: string) => void;
  className?: string;
  /** Trieda vstupu (rovnaká ako ostatné polia formulára). */
  vstup?: string;
}) {
  const { t } = useT();
  const [zalohy, setZalohy] = useState<Zaloha[]>([]);
  useEffect(() => {
    const i = ico.trim();
    const n = nazov.trim();
    if (!companyId || (!i && !n)) {
      setZalohy([]);
      return;
    }
    let zrusene = false;
    const casovac = setTimeout(async () => {
      let q = supabase
        .from("purchase_invoices")
        .select("id, invoice_number, amount_total, currency, status")
        .eq("company_id", companyId)
        .eq("type", "proforma")
        .is("deleted_at", null)
        .order("issue_date", { ascending: false })
        .limit(30);
      q = i ? q.eq("supplier_ico", i) : q.ilike("supplier_name", n);
      const { data: proformy } = await q;
      if (zrusene) return;
      const ids = ((proformy ?? []) as Zaloha[]).map((z) => z.id);
      const { data: vazby } = ids.length
        ? await supabase
            .from("purchase_invoices")
            .select("id, type, advance_invoice_id, deleted_at")
            .eq("company_id", companyId)
            .is("deleted_at", null)
            .in("advance_invoice_id", ids)
        : { data: [] as any[] };
      if (zrusene) return;
      setZalohy(
        ((proformy ?? []) as Zaloha[]).filter(
          (z) => z.id === value || zalohaVolnaPreDanovy(z.id, (vazby ?? []) as any[]),
        ),
      );
    }, 300);
    return () => {
      zrusene = true;
      clearTimeout(casovac);
    };
  }, [companyId, ico, nazov, value]);

  return (
    <label className={`block text-sm ${className}`}>
      <span className="text-xs text-muted-foreground">{t("Prijatá zálohová faktúra")}</span>
      <select
        aria-label={t("Prijatá zálohová faktúra")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={vstup}
        data-testid="zaloha-danoveho-dokladu"
      >
        <option value="">{zalohy.length ? t("— bez väzby —") : t("Žiadna zálohová faktúra od tohto dodávateľa")}</option>
        {zalohy.map((z) => (
          <option key={z.id} value={z.id}>
            {z.invoice_number || t("bez čísla")} · {formatujMenu(Number(z.amount_total ?? 0), z.currency || "EUR")}
            {z.status === "paid" ? ` · ${t("zaplatená")}` : ""}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-muted-foreground">
        {t("Daňový doklad k prijatej platbe sa neplatí — záloha je už zaplatená. DPH z neho sa odpočíta v období dňa platby (alebo prijatia dokladu, ak prišiel neskôr).")}
      </span>
    </label>
  );
}
