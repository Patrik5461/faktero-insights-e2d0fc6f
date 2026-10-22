import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { potvrd } from "@/lib/potvrdenie";
import { vratZPohodyFn } from "@/lib/faktero/vratenie.functions";
import { vratVystavenuZPohodyFn } from "@/lib/faktero/zauctovanie.functions";
import { useT } from "@/lib/i18n/useT";

export type DruhOpravy = "faktura" | "prijata" | "doklad";

/**
 * „Poslať opravu do Pohody“ — odovzdaný doklad sa vráti z Pohody (tá istá
 * operácia ako „Vrátiť z Pohody“), aby sa dal upraviť; pri ďalšom odovzdaní
 * (konektor, balík, export) pôjde znova.
 *
 * Pohoda doklad z XML neprepíše: agenda faktúr nemá v schéme `actionType`
 * (aktualizácia podľa `extId` je len v adresári a zásobách), a druhý import
 * s tým istým identifikátorom Pohoda odmietne ako duplicitu. Pôvodný doklad
 * preto treba v Pohode zmazať — rozhranie to povie pred kliknutím.
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
    const ok = await potvrd(
      t(
        "Poslať opravu do Pohody? Doklad sa vráti z Pohody, takže ho môžete upraviť, a pri ďalšom odovzdaní (konektor, balík alebo export) pôjde znova. Pohoda doklad neprepíše — pôvodný v nej najprv zmažte, inak tam bude dvakrát.",
      ),
      { potvrdit: t("Vrátiť a opraviť") },
    );
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
