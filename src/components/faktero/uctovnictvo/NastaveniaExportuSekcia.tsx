/*
  Jediné miesto nastavení exportu (stránka Predkontácie a členenie DPH/KV):
  export do účtovného programu, čo sa do Pohody posiela a nastavenia
  zvoleného účtovného programu. Odkazy sem vedú na `#nastavenia-exportu`.
*/
import { NastaveniaExportu } from "@/components/faktero/NastaveniaExportu";
import { NastaveniaPosielaniaPohody } from "@/components/faktero/uctovnictvo/NastaveniaPosielaniaPohody";
import { NastaveniaUctovnehoProgramu } from "@/components/faktero/uctovnictvo/NastaveniaUctovnehoProgramu";
import { useT } from "@/lib/i18n/useT";

export const ID_NASTAVENI_EXPORTU = "nastavenia-exportu";

export function NastaveniaExportuSekcia({
  companyId,
  firma,
  predkontacie,
  onUlozene,
  programZAdresy,
}: {
  companyId: string;
  firma: Record<string, any>;
  predkontacie?: Parameters<typeof NastaveniaExportu>[0]["predkontacie"];
  onUlozene?: () => void;
  programZAdresy?: string;
}) {
  const { t } = useT();
  return (
    <section
      id={ID_NASTAVENI_EXPORTU}
      aria-labelledby="nastavenia-exportu-nadpis"
      className="scroll-mt-24 space-y-3"
    >
      <div>
        <h2 id="nastavenia-exportu-nadpis" className="text-lg font-semibold">
          {t("Nastavenia exportu")}
        </h2>
        <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
          {t(
            "Ako doklady odchádzajú do Pohody a do ostatných účtovných programov — dátumy, texty, partneri, čo sa posiela navyše a kódy zvoleného programu.",
          )}
        </p>
      </div>
      <NastaveniaExportu
        companyId={companyId}
        firma={firma}
        predkontacie={predkontacie}
        onUlozene={onUlozene}
      />
      <NastaveniaPosielaniaPohody companyId={companyId} />
      <NastaveniaUctovnehoProgramu companyId={companyId} programZAdresy={programZAdresy} />
    </section>
  );
}
