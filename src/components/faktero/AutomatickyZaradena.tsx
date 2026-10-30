/*
  Prijatá faktúra, ktorú zaradilo automatické zaevidovanie eFaktúry bez
  človeka (`na_kontrolu_at`). Faktúru do Peppolu môže poslať ktokoľvek, preto
  ju hromadný príkaz na úhradu vynecháva, kým ju niekto neotvorí. Otvorenie
  detailu kontrolu potvrdí (vymaže `na_kontrolu_at`) a tu sa raz ukáže, čo
  treba pred úhradou pozrieť. Bez práva upravovať doklady sa nič nezmení.
*/
import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n/useT";

export function AutomatickyZaradena({
  id,
  naKontroluAt,
}: {
  id: string;
  naKontroluAt: string | null | undefined;
}) {
  const { t } = useT();
  const [ukaz] = useState(() => !!naKontroluAt);

  useEffect(() => {
    if (!naKontroluAt) return;
    void supabase
      .from("purchase_invoices")
      .update({ na_kontrolu_at: null } as any)
      .eq("id", id)
      .not("na_kontrolu_at", "is", null)
      .then(({ error }) => {
        if (error) console.warn("[prijata] kontrola sa nezapísala:", error.message);
      });
  }, [id, naKontroluAt]);

  if (!ukaz) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {t(
          "Táto faktúra prišla ako eFaktúra a zaradila sa automaticky. Pred úhradou skontrolujte dodávateľa, sumu a IBAN — kým ste ju neotvorili, hromadný príkaz na úhradu ju vynechával.",
        )}
      </div>
    </div>
  );
}
