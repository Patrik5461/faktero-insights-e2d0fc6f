import type { ReactNode } from "react";
import { AlertTriangle, Loader2, Lock } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

/**
 * Načítavací, chybový a zamknutý stav obsahu na webe (redizajn 2026-11).
 * Prázdny stav je `EmptyState` z `ListControls.tsx` — rovnaký tvar.
 *
 * Používať tam, kde stránka už takýto stav má (text „Načítavam…“, chybová
 * hláška…). Nové stavy, ktoré dnes stránka nemá, sa nepridávajú.
 */

export function NacitavanieStav({
  text = "Načítavam…",
  className,
}: {
  text?: string;
  className?: string;
}) {
  const { t } = useT();
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center justify-center gap-2 px-6 py-12 text-sm text-muted-foreground",
        className,
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
      {t(text)}
    </div>
  );
}

export function ChybovyStav({
  nadpis,
  popis,
  akcia,
  className,
}: {
  nadpis: string;
  popis?: ReactNode;
  /** Napr. tlačidlo „Skúsiť znova“ — len ak ho stránka už má. */
  akcia?: ReactNode;
  className?: string;
}) {
  const { t } = useT();
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center px-6 py-12 text-center",
        className,
      )}
    >
      <div className="grid h-12 w-12 place-items-center rounded-xl border border-destructive/25 bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </div>
      <div className="mt-4 text-[15px] font-semibold text-foreground">{t(nadpis)}</div>
      {popis ? <div className="mt-1 max-w-md text-sm text-muted-foreground">{popis}</div> : null}
      {akcia ? <div className="mt-4">{akcia}</div> : null}
    </div>
  );
}

/** Zamknuté obdobie / bez oprávnenia — informácia, nie chyba. */
export function ZamknutyStav({
  nadpis,
  popis,
  className,
}: {
  nadpis: string;
  popis?: ReactNode;
  className?: string;
}) {
  const { t } = useT();
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-border bg-muted/60 px-4 py-3 text-sm",
        className,
      )}
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <div className="font-semibold text-foreground">{t(nadpis)}</div>
        {popis ? <div className="mt-0.5 text-muted-foreground">{popis}</div> : null}
      </div>
    </div>
  );
}
