import { ID_OBSAHU, preskocNaObsah } from "@/lib/faktero/preskocit-na-obsah";
import { useT } from "@/lib/i18n/useT";

/**
 * Prvý prvok, na ktorý sa dá dostať klávesom Tab — kto ovláda stránku
 * klávesnicou alebo čítačkou, nemusí prechádzať celé menu. Kým nemá fokus,
 * je skrytý (sr-only); pri fokuse sa ukáže v ľavom hornom rohu.
 */
export function PreskocitNaObsah() {
  const { t } = useT();
  return (
    <a
      href={`#${ID_OBSAHU}`}
      onClick={(e) => {
        // Cieľ nemusí mať `id` (stránky bez spoločného rozloženia) — fokus
        // sa presúva ručne, kotva ostáva pre prehliadače bez JavaScriptu.
        if (preskocNaObsah(document)) e.preventDefault();
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[1000] focus:rounded-md focus:border focus:border-border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {t("Preskočiť na obsah")}
    </a>
  );
}
