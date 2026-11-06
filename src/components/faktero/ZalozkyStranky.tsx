import { useT } from "@/lib/i18n/useT";

/**
 * Záložky celej stránky (Automatické účtovanie, Konvertory, Exporty, Importy).
 *
 * Aktívnu záložku drží adresa (`?tab=`), nie stav — dá sa na ňu odkázať
 * z menu, z e-mailu aj zo starej adresy, ktorá sem presmeruje. Stránka preto
 * dostane len `onZmena` a sama zavolá `navigate` so zachovaním ostatných
 * parametrov.
 *
 * Vzhľad je zámerne iný než pri filtroch vnútri stránky (rámčekové tlačidlá):
 * podčiarknutie hovorí „iná časť stránky“, rámček „iný výber v zozname“.
 */
export type ZalozkaStranky<K extends string> = {
  kod: K;
  nazov: string;
  /** Počet pri názve (napr. doklady na kontrolu). */
  pocet?: number;
};

export function ZalozkyStranky<K extends string>({
  zalozky,
  aktivna,
  onZmena,
  popis,
  className = "",
}: {
  zalozky: ZalozkaStranky<K>[];
  aktivna: K;
  onZmena: (kod: K) => void;
  /** `aria-label` zoznamu záložiek. */
  popis: string;
  className?: string;
}) {
  const { t } = useT();
  return (
    <div
      role="tablist"
      aria-label={t(popis)}
      data-zalozky-stranky
      className={`-mx-1 flex flex-wrap gap-x-1 border-b border-border px-1 ${className}`}
    >
      {zalozky.map((z) => {
        const je = z.kod === aktivna;
        return (
          <button
            key={z.kod}
            type="button"
            role="tab"
            id={`zalozka-${z.kod}`}
            aria-selected={je}
            onClick={() => {
              if (!je) onZmena(z.kod);
            }}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
              je
                ? "border-primary font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            {t(z.nazov)}
            {z.pocet ? (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-px text-[11px] font-semibold tabular-nums text-primary-hover">
                {z.pocet > 99 ? "99+" : z.pocet}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
