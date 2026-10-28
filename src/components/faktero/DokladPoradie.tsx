import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n/useT";

type Tabulka = "purchase_invoices" | "expense_documents" | "invoices";

/**
 * Predošlý / ďalší doklad tej istej agendy a firmy podľa poradia uloženia
 * (zoznam je od najnovšieho — „predošlý" je ten nad ním, novší). Bločky len
 * spracované, prijaté len bežné faktúry, zmazané nikdy.
 */
export function DokladPoradie({
  tabulka,
  companyId,
  id,
  createdAt,
  onOtvor,
}: {
  tabulka: Tabulka;
  companyId: string;
  id: string;
  createdAt: string | null | undefined;
  onOtvor: (id: string) => void;
}) {
  const { t } = useT();
  const [susedia, setSusedia] = useState<{ predosly: string | null; dalsi: string | null }>({
    predosly: null,
    dalsi: null,
  });

  useEffect(() => {
    if (!createdAt) return;
    let zive = true;
    const zaklad = () => {
      let q = (supabase.from(tabulka) as any)
        .select("id")
        .eq("company_id", companyId)
        .neq("id", id);
      if (tabulka === "expense_documents") q = q.neq("status", "new");
      else q = q.is("deleted_at", null);
      if (tabulka === "purchase_invoices") q = q.eq("type", "regular");
      return q;
    };
    Promise.all([
      zaklad().gt("created_at", createdAt).order("created_at", { ascending: true }).limit(1),
      zaklad().lt("created_at", createdAt).order("created_at", { ascending: false }).limit(1),
    ])
      .then(([novsi, starsi]: any[]) => {
        if (!zive) return;
        setSusedia({ predosly: novsi.data?.[0]?.id ?? null, dalsi: starsi.data?.[0]?.id ?? null });
      })
      .catch(() => {
        /* bez šípok sa dá ďalej pracovať */
      });
    return () => {
      zive = false;
    };
  }, [tabulka, companyId, id, createdAt]);

  const tlacidlo =
    "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card hover:bg-secondary disabled:opacity-40";
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        className={tlacidlo}
        disabled={!susedia.predosly}
        onClick={() => susedia.predosly && onOtvor(susedia.predosly)}
        title={t("Predošlý doklad")}
        aria-label={t("Predošlý doklad")}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={tlacidlo}
        disabled={!susedia.dalsi}
        onClick={() => susedia.dalsi && onOtvor(susedia.dalsi)}
        title={t("Ďalší doklad")}
        aria-label={t("Ďalší doklad")}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </span>
  );
}
