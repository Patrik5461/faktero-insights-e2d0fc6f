import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatujMenu } from "@/lib/faktero/mena";
import { useT } from "@/lib/i18n/useT";

/*
  Väzba prijatej faktúry a zálohovej faktúry, ktorú zúčtováva — v detaile
  oboch. Odpočet zálohy sa v sume „k úhrade“ prejavil, ale z ktorej zálohy
  je a kde je zálohová zúčtovaná, sa dalo zistiť len zo zoznamu záloh.
*/
type Doklad = {
  id: string;
  invoice_number: string | null;
  amount_total: number | null;
  status: string | null;
};

export function VazbaZalohyPrijatej({ row }: { row: any }) {
  const { t } = useT();
  const [zaloha, setZaloha] = useState<Doklad | null>(null);
  const [faktury, setFaktury] = useState<Doklad[]>([]);
  const jeZalohova = row?.type === "proforma";
  useEffect(() => {
    let zive = true;
    void (async () => {
      if (!row?.id) return;
      if (jeZalohova) {
        const { data } = await supabase
          .from("purchase_invoices")
          .select("id, invoice_number, amount_total, status")
          .eq("company_id", row.company_id)
          .eq("advance_invoice_id", row.id)
          .is("deleted_at", null)
          .limit(20);
        if (zive) setFaktury((data ?? []) as Doklad[]);
      } else if (row.advance_invoice_id) {
        const { data } = await supabase
          .from("purchase_invoices")
          .select("id, invoice_number, amount_total, status")
          .eq("company_id", row.company_id)
          .eq("id", row.advance_invoice_id)
          .maybeSingle();
        if (zive) setZaloha((data ?? null) as Doklad | null);
      } else {
        setZaloha(null);
        setFaktury([]);
      }
    })();
    return () => {
      zive = false;
    };
  }, [row?.id, row?.company_id, row?.advance_invoice_id, jeZalohova]);

  const mena = row?.currency ?? "EUR";
  if (!jeZalohova && zaloha)
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">{t("Zúčtováva zálohovú faktúru")}</span>
        <Link
          to="/prijate-faktury/$id"
          params={{ id: zaloha.id }}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          {zaloha.invoice_number || t("bez čísla")}
        </Link>
        <span className="tabular-nums text-muted-foreground">
          ({formatujMenu(Number(zaloha.amount_total ?? 0), mena)}
          {zaloha.status === "paid" ? "" : `, ${t("zatiaľ nezaplatená — neodpočítava sa")}`})
        </span>
      </div>
    );
  if (jeZalohova && faktury.length)
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">{t("Zúčtovaná vo faktúre")}</span>
        {faktury.map((f, i) => (
          <span key={f.id}>
            <Link
              to="/prijate-faktury/$id"
              params={{ id: f.id }}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {f.invoice_number || t("bez čísla")}
            </Link>
            {i < faktury.length - 1 ? "," : ""}
          </span>
        ))}
      </div>
    );
  return null;
}
