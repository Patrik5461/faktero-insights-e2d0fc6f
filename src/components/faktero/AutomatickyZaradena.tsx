/*
  Prijatá faktúra, ktorú zaradilo automatické zaevidovanie eFaktúry bez
  človeka (`na_kontrolu_at`). Faktúru do Peppolu môže poslať ktokoľvek, preto
  ju hromadný príkaz na úhradu vynecháva, kým ju niekto neotvorí. Otvorenie
  detailu kontrolu potvrdí (vymaže `na_kontrolu_at`) a tu sa raz ukáže, čo
  treba pred úhradou pozrieť. Bez práva upravovať doklady sa nič nezmení.

  Od 5. 11. 2026 nesie `na_kontrolu_dovod` aj iný dôvod — rozpis DPH, ktorý
  neprešiel kontrolou (`rozpis-dph-kontrola.ts`). Taký sa otvorením NEZMAŽE:
  človek musí rozpis skontrolovať a potvrdiť tlačidlom „Skontrolované“.
*/
import { useEffect, useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n/useT";

export function AutomatickyZaradena({
  id,
  naKontroluAt,
  naKontroluDovod,
  tabulka = "purchase_invoices",
}: {
  id: string;
  naKontroluAt: string | null | undefined;
  /** Dôvod kontroly (napr. nesediaci rozpis DPH) — taký sa otvorením nemaže. */
  naKontroluDovod?: string | null;
  tabulka?: "purchase_invoices" | "expense_documents";
}) {
  const { t } = useT();
  const [ukaz] = useState(() => !!naKontroluAt && !naKontroluDovod);
  const [dovod, setDovod] = useState(() => (naKontroluDovod ? naKontroluDovod : null));

  useEffect(() => {
    if (!naKontroluAt || naKontroluDovod) return;
    void supabase
      .from("purchase_invoices")
      .update({ na_kontrolu_at: null } as any)
      .eq("id", id)
      .not("na_kontrolu_at", "is", null)
      .then(({ error }) => {
        if (error) console.warn("[prijata] kontrola sa nezapísala:", error.message);
      });
  }, [id, naKontroluAt, naKontroluDovod]);

  async function skontrolovane() {
    const { error } = await supabase
      .from(tabulka)
      .update({ na_kontrolu_at: null, na_kontrolu_dovod: null } as any)
      .eq("id", id);
    if (error) console.warn("[doklad] kontrola sa nezapísala:", error.message);
    else setDovod(null);
  }

  if (dovod)
    return (
      <div
        role="alert"
        data-testid="na-kontrolu-dovod"
        className="flex items-start gap-2 rounded-lg border dk-pozor p-3 text-sm"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 space-y-1">
          <div className="font-semibold">{t("Doklad čaká na kontrolu")}</div>
          <div className="break-words text-xs">{dovod}</div>
          <button
            type="button"
            onClick={() => void skontrolovane()}
            className="mt-1 inline-flex h-8 items-center rounded-md border border-current/30 px-3 text-xs font-medium hover:bg-background/60"
          >
            {t("Skontrolované")}
          </button>
        </div>
      </div>
    );
  if (!ukaz) return null;
  return (
    <div role="status" className="flex items-start gap-2 rounded-lg border dk-pozor p-3 text-sm">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {t(
          "Táto faktúra prišla ako eFaktúra a zaradila sa automaticky. Pred úhradou skontrolujte dodávateľa, sumu a IBAN — kým ste ju neotvorili, hromadný príkaz na úhradu ju vynechával.",
        )}
      </div>
    </div>
  );
}
