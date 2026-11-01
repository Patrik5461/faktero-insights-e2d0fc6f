import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { useT } from "@/lib/i18n/useT";

/** Pruh nad zoznamom: koľko dokladov čaká v Nespracovaných na zaradenie. */
export function UpozornenieNespracovane() {
  const { t } = useT();
  const [pocet, setPocet] = useState(0);
  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    supabase
      .from("nespracovane_doklady")
      .select("id", { count: "exact", head: true })
      .eq("company_id", cid)
      .then(({ count }) => setPocet(count ?? 0));
  }, []);
  if (!pocet) return null;
  return (
    <Link
      to="/nespracovane"
      className="mb-4 flex items-center gap-2 rounded-xl border dk-pozor px-4 py-3 text-sm font-medium hover:underline"
    >
      <Inbox className="h-4 w-4" />
      {t(
        pocet === 1
          ? "1 doklad čaká v Nespracovaných — otvoriť a zaradiť"
          : pocet < 5
            ? "{n} doklady čakajú v Nespracovaných — otvoriť a zaradiť"
            : "{n} dokladov čaká v Nespracovaných — otvoriť a zaradiť",
        { n: pocet },
      )}
    </Link>
  );
}
