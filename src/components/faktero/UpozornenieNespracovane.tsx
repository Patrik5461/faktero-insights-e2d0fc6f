import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";

/** Pruh nad zoznamom: koľko dokladov čaká v Nespracovaných na zaradenie. */
export function UpozornenieNespracovane() {
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
      className="mb-4 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
    >
      <Inbox className="h-4 w-4" />
      {pocet === 1 ? "1 doklad čaká" : pocet < 5 ? `${pocet} doklady čakajú` : `${pocet} dokladov čaká`} v
      Nespracovaných — otvoriť a zaradiť
    </Link>
  );
}
