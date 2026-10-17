import { NAZVY_POLI_UCENIA, staleNaucene } from "@/lib/faktero/ucenie-z-oprav";
import type { UdajeNespracovaneho } from "@/lib/faktero/nespracovane";
import { useT } from "@/lib/i18n/useT";

/**
 * Štítok „naučené" pri zaúčtovaní nespracovaného dokladu: ktoré polia
 * doplnilo učenie z predchádzajúcich dokladov dodávateľa. Pole, ktoré
 * človek zmenil, sa z neho stratí — hodnota je odvtedy jeho.
 */
export function NauceneZDodavatela({ u }: { u: UdajeNespracovaneho }) {
  const { t } = useT();
  const polia = staleNaucene(u);
  if (!polia.length) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
        {t("naučené")}
      </span>
      {t("Podľa predchádzajúcich dokladov od dodávateľa: {polia}. Skontrolujte, prípadne zmeňte.", {
        polia: polia.map((p) => t(NAZVY_POLI_UCENIA[p])).join(", "),
      })}
    </p>
  );
}
