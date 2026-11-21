import { FileCode2, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/useT";

/**
 * Jednotné tlačidlo „XML pre Pohodu“ vo všetkých zoznamoch dokladov
 * (Patrik 21. 11.): rovnaký text, ikona a vzhľad, a po označení dokladov
 * vždy PRVÉ v lište akcií. Bez označenia ukazuje „všetko“ (berie sa celý
 * filter), s označením počet vybraných.
 */
export function TlacidloXmlPohody({
  pocet,
  onClick,
  disabled,
  busy,
  title,
  className,
}: {
  /** Počet označených dokladov; 0 = všetko vo filtri. */
  pocet: number;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  title?: string;
  className?: string;
}) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={title ?? t("XML na import do Pohody")}
      data-tlacidlo-xml-pohody=""
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      }
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <FileCode2 className="h-4 w-4" aria-hidden="true" />
      )}
      {t("XML pre Pohodu")} {pocet > 0 ? `(${pocet})` : t("(všetko)")}
    </button>
  );
}
