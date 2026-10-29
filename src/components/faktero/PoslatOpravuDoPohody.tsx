import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { potvrd } from "@/lib/potvrdenie";
import { vratZPohodyFn } from "@/lib/faktero/vratenie.functions";
import { vratVystavenuZPohodyFn } from "@/lib/faktero/zauctovanie.functions";
import { useT } from "@/lib/i18n/useT";
import { supabase } from "@/integrations/supabase/client";
import { stavOdovzdania, textVarovaniaVratenia } from "@/lib/faktero/stav-odovzdania";

const TABULKA = {
  faktura: "invoices",
  prijata: "purchase_invoices",
  doklad: "expense_documents",
} as const;

export type DruhOpravy = "faktura" | "prijata" | "doklad";

/**
 * „Poslať opravu do Pohody“ — odovzdaný doklad sa vráti z Pohody (tá istá
 * operácia ako „Vrátiť z Pohody“), aby sa dal upraviť; pri ďalšom odovzdaní
 * (konektor, balík, export) pôjde znova.
 *
 * Pohoda doklad z XML neprepíše ani nezmaže: agenda faktúr nemá v schéme
 * `actionType` (aktualizácia podľa `extId` je len v adresári a zásobách) —
 * nevie to súbor ani konektor. Pôvodný doklad preto treba v Pohode zmazať
 * ručne; keď ide len o kódy, je lepšia „Opraviť zaúčtovanie“
 * (OdovzdanieDokladu.tsx), ktorá doklad z Pohody nevracia.
 */
export function usePoslatOpravuDoPohody() {
  const { t } = useT();
  const vratFakturu = useServerFn(vratVystavenuZPohodyFn);
  const vratDoklad = useServerFn(vratZPohodyFn);
  return async function poslatOpravu(
    druh: DruhOpravy,
    companyId: string,
    id: string,
  ): Promise<boolean> {
    // Varovanie podľa toho, ako doklad odišiel — konektor ani súbor ho v Pohode nezmažú.
    const { data: riadok } = await (supabase as any)
      .from(TABULKA[druh])
      .select("export_cesta, exported_at, pocet_exportov")
      .eq("id", id)
      .maybeSingle();
    const ok = await potvrd(t(textVarovaniaVratenia(druh, stavOdovzdania(riadok ?? {}).cesta)), {
      potvrdit: t("Vrátiť a opraviť"),
    });
    if (!ok) return false;
    try {
      if (druh === "faktura") await vratFakturu({ data: { company_id: companyId, id } });
      else await vratDoklad({ data: { company_id: companyId, druh, ids: [id] } });
      toast.success(
        druh === "doklad"
          ? t("Vrátené medzi nespracované — opravte a spracujte znova")
          : t("Vrátené z Pohody — opravte doklad a odovzdajte ho znova"),
      );
      return true;
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
      return false;
    }
  };
}
