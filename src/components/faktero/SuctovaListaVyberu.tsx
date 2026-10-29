import type { ReactNode } from "react";
import { X } from "lucide-react";
import { formatujMenu } from "@/lib/faktero/mena";
import { suhrnVyberu, type PolozkaSuhrnu, type SumaMeny } from "@/lib/faktero/suhrn-vyberu";
import { suhrnZPoloziek, type SuhrnDph } from "@/lib/faktero/suhrn-dph";
import { RozpisSuctov } from "@/components/faktero/SuctyDokladov";
import { useT } from "@/lib/i18n/useT";

/**
 * Lišta pod zoznamom dokladov, keď sú niektoré označené: koľko ich je, koľko
 * stoja (základ dane, DPH a celkom, pri viacerých sadzbách DPH aj rozpis), čo
 * z toho ešte čaká na export do účtovníctva a čo na úhradu. Spoločná pre prijaté, vystavené, bločky aj Nespracované.
 *
 * Je `sticky` na spodku obrazovky, nie `fixed` — v toku stránky zaberá svoje
 * miesto, takže posledný riadok zoznamu nikdy neostane pod ňou (ani na mobile).
 * Vpravo necháva miesto pre plávajúce tlačidlo asistenta.
 */
export function SuctovaListaVyberu({
  polozky,
  pocet,
  exportNazov,
  akcie,
  onZrusit,
  rozpis,
}: {
  polozky: PolozkaSuhrnu[];
  /**
   * Súčet s rozpisom po sadzbách DPH (vystavené faktúry). Bez neho sa základ
   * a DPH zložia z `polozky` — prijaté, bločky a Nespracované sadzby v
   * zozname nemajú.
   */
  rozpis?: SuhrnDph | null;
  /** Počet vybraných, keď sa časť výberu nenačítala (iná stránka zoznamu). */
  pocet?: number;
  /** Čo v danom zozname znamená export; predvolene „Na export do účtovníctva“. */
  exportNazov?: string;
  akcie?: ReactNode;
  onZrusit?: () => void;
}) {
  const { t } = useT();
  const n = pocet ?? polozky.length;
  if (!n) return null;
  const s = suhrnVyberu(polozky);
  const doklady = (k: number) =>
    t(k === 1 ? "{n} doklad" : k >= 2 && k <= 4 ? "{n} doklady" : "{n} dokladov", { n: k });
  const sumy = (x: SumaMeny[], bezDph: boolean) =>
    x.length
      ? x
          .map((m) =>
            bezDph && m.bezDph != null
              ? t("{s} / {b} bez DPH", {
                  s: formatujMenu(m.celkom, m.mena),
                  b: formatujMenu(m.bezDph, m.mena),
                })
              : formatujMenu(m.celkom, m.mena),
          )
          .join(" + ")
      : null;
  const spolu = rozpis ?? suhrnZPoloziek(polozky);
  // Rozpis vystavených pozná aj koncepty mimo záložky Koncepty — jeho počet platí.
  const mimoSuctu = rozpis ? rozpis.mimo : s.mimoSuctu;
  const naExport = sumy(s.naExport.sumy, false);
  const naUhradu = sumy(s.naUhradu.sumy, false);

  return (
    <div
      role="region"
      aria-label={t("Súčet vybraných dokladov")}
      className="sticky bottom-0 z-30 -mx-4 border-t border-primary/40 bg-card/95 px-4 py-2 pr-20 text-sm shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur sm:-mx-6 sm:px-6 sm:pr-24"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
        <span className="min-w-0">
          <span className="text-muted-foreground">{t("Vybrané:")}</span>{" "}
          <strong>{doklady(n)}</strong>
          {mimoSuctu > 0 ? (
            <span
              className="ml-1 text-xs text-muted-foreground"
              title={t(
                "Zálohové, stornované a iné doklady (zmluvy, listy) sa do súčtu nepočítajú.",
              )}
            >
              ({t("{n} mimo súčtu", { n: mimoSuctu })})
            </span>
          ) : null}
          {pocet != null && pocet > polozky.length ? (
            <span className="ml-1 text-xs text-muted-foreground">
              ({t("súčet z {n} zobrazených", { n: polozky.length })})
            </span>
          ) : null}
        </span>
        <RozpisSuctov suhrn={spolu} />
        <span className="min-w-0 text-muted-foreground">
          {exportNazov ?? t("Na export do účtovníctva:")}{" "}
          <strong className="text-foreground">{s.naExport.pocet}</strong>
          {naExport ? <span className="tabular-nums"> · {naExport}</span> : null}
        </span>
        <span className="min-w-0 text-muted-foreground">
          {t("Na úhradu:")} <strong className="text-foreground">{s.naUhradu.pocet}</strong>
          {naUhradu ? <span className="tabular-nums"> · {naUhradu}</span> : null}
        </span>
        {akcie || onZrusit ? (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {akcie}
            {onZrusit ? (
              <button
                type="button"
                onClick={onZrusit}
                title={t("Zrušiť výber")}
                aria-label={t("Zrušiť výber")}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}
