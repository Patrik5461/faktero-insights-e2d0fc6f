import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n/useT";

/**
 * Partner v adresári má zaškrtnuté „Povinné číslo objednávky“ — hľadá sa
 * podľa id kontaktu, inak podľa IČO (doklad v Nespracovaných kontakt nemá).
 */
export function usePovinnaObjednavka(args: {
  companyId: string | null | undefined;
  customerId?: string | null;
  ico?: string | null;
}): boolean {
  const [povinna, setPovinna] = useState(false);
  const ico = (args.ico ?? "").replace(/\s/g, "");
  useEffect(() => {
    if (!args.companyId || (!args.customerId && !ico)) {
      setPovinna(false);
      return;
    }
    let zive = true;
    let q = supabase
      .from("customers")
      .select("id")
      .eq("company_id", args.companyId)
      .eq("povinne_cislo_objednavky", true)
      .is("deleted_at", null)
      .limit(1);
    q = args.customerId ? q.eq("id", args.customerId) : q.eq("ico", ico);
    q.then(({ data }) => {
      if (zive) setPovinna(!!data?.length);
    });
    return () => {
      zive = false;
    };
  }, [args.companyId, args.customerId, ico]);
  return povinna;
}

/** Upozornenie pod poľom čísla objednávky — neblokuje uloženie. */
export function UpozornenieObjednavky(props: {
  companyId: string | null | undefined;
  customerId?: string | null;
  ico?: string | null;
  cisloObjednavky: string | null | undefined;
}) {
  const { t } = useT();
  const povinna = usePovinnaObjednavka(props);
  if (!povinna || (props.cisloObjednavky ?? "").trim()) return null;
  return (
    <p
      role="status"
      className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {t("Tento partner vyžaduje na doklade číslo objednávky.")}
    </p>
  );
}
