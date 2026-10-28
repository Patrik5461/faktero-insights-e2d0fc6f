import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  hladaniePravidlaZDokladu,
  podobnePravidlo,
  type Pravidlo,
  type ZakladPravidlaZDokladu,
} from "@/lib/faktero/pravidla-uctovania";
import { useT } from "@/lib/i18n/useT";

/**
 * „Vytvoriť pravidlo z tohto dokladu" (v Doklado „Vytvoriť automatické
 * účtovanie"): otvorí Pravidlá účtovania s predvyplneným dodávateľom,
 * e-mailom, VS a kódmi. Keď podobné pravidlo už je, otvorí to — nezdvojí ho.
 */
export function PravidloZDokladu({
  companyId,
  zaklad,
  tlacidlo,
}: {
  companyId: string;
  zaklad: ZakladPravidlaZDokladu;
  /** Ako tlačidlo (vedľa „Vytvoriť"), inak ako odkaz. */
  tlacidlo?: boolean;
}) {
  const { t } = useT();
  const [pravidla, setPravidla] = useState<(Pravidlo & { id: string })[] | null>(null);
  useEffect(() => {
    let zrusene = false;
    supabase
      .from("pravidla_uctovania")
      .select("*")
      .eq("company_id", companyId)
      .then(({ data }) => {
        if (!zrusene) setPravidla((data ?? []) as unknown as (Pravidlo & { id: string })[]);
      });
    return () => {
      zrusene = true;
    };
  }, [companyId]);

  const nieco = [zaklad.nazov, zaklad.ico, zaklad.vs, zaklad.odosielatel].some((x) =>
    String(x ?? "").trim(),
  );
  if (!nieco) return null;
  const podobne = pravidla ? podobnePravidlo(pravidla, zaklad) : null;
  const trieda = tlacidlo
    ? "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
    : "inline-flex items-center gap-1 text-xs text-primary hover:underline";
  return (
    <Link
      to="/uctovnictvo/pravidla"
      search={hladaniePravidlaZDokladu(zaklad, podobne) as any}
      className={trieda}
      title={
        podobne
          ? t("Pre tohto dodávateľa už pravidlo je — otvorí sa na úpravu")
          : t("Ďalší podobný doklad sa zaúčtuje sám")
      }
    >
      <Wand2 className={tlacidlo ? "h-4 w-4" : "h-3.5 w-3.5"} />{" "}
      {podobne
        ? t("Upraviť pravidlo „{nazov}“", { nazov: podobne.nazov })
        : t("Vytvoriť pravidlo z tohto dokladu")}
    </Link>
  );
}
