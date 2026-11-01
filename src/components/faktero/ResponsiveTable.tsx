import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { useKlikNaRiadok, type CielDetailu } from "@/hooks/useKlikNaRiadok";

/**
 * ResponsiveTable — renders the full table on >=sm screens and a stack of
 * cards on mobile. Designed for list pages (invoices, customers, products…).
 *
 * Use:
 *   <ResponsiveTable
 *     items={rows}
 *     loading={loading}
 *     emptyText="Žiadne faktúry."
 *     desktop={<TableRows />}
 *     mobileCard={(row) => (
 *       <MobileCard title={row.number} status={...} ... />
 *     )}
 *   />
 */
export function ResponsiveTable<T>({
  items,
  loading,
  emptyText = "Žiadne výsledky.",
  desktop,
  mobileCard,
  className = "",
}: {
  items: T[];
  loading?: boolean;
  emptyText?: string;
  desktop: ReactNode;
  mobileCard: (item: T, index: number) => ReactNode;
  className?: string;
}) {
  const { t } = useT();
  return (
    <div className={className}>
      {/* Desktop / tablet table */}
      <div className="hidden sm:block">{desktop}</div>

      {/* Mobile card list */}
      <div className="space-y-2 sm:hidden">
        {loading && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {t("Načítavam…")}
          </div>
        )}
        {!loading && items.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {t(emptyText)}
          </div>
        )}
        {!loading &&
          items.map((it, i) => <div key={(it as any)?.id ?? i}>{mobileCard(it, i)}</div>)}
      </div>
    </div>
  );
}

/**
 * MobileListCard — opinionated card layout for the mobile branch of
 * ResponsiveTable. Keeps spacing/typography consistent across list pages.
 *
 * Detail: odovzdaj `ciel` (to isté čo `navigate()`), napr.
 * `ciel={{ to: "/faktury/$id", params: { id: r.id } }}`. Celá karta sa potom
 * otvára klikom kdekoľvek, nadpis je skutočný odkaz (čítačka, dlhé podržanie
 * → nová karta) a zaškrtávadlo aj `actions` si klik nechajú. Pravidlá sú
 * v `useKlikNaRiadok`. Starý `onClick` funguje ďalej (bez novej karty).
 */
export function MobileListCard({
  title,
  subtitle,
  status,
  meta,
  amount,
  actions,
  ciel,
  onClick,
  vybrane,
  onVyber,
  vyberPopis,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  meta?: ReactNode;
  amount?: ReactNode;
  actions?: ReactNode;
  /** Kam vedie detail. Má prednosť pred `onClick` pre novú kartu; obyčajný klik zavolá `onClick`, ak je zadaný. */
  ciel?: CielDetailu | null;
  onClick?: () => void;
  /** Začiarknutie pre hromadné akcie (export, odovzdanie…). Bez `onVyber` sa nekreslí. */
  vybrane?: boolean;
  onVyber?: (zapnut: boolean) => void;
  /** Popis začiarkávacieho poľa pre čítačku, napr. „Vybrať doklad 123“. */
  vyberPopis?: string;
}) {
  const klik = useKlikNaRiadok();
  // Karta má hlavný ovládač vo vnútri (odkaz alebo tlačidlo), preto bez tabIndex.
  const karta = klik(ciel, { naKlik: onClick, klavesnica: false });
  // S cieľom je nadpis odkaz a obal je obyčajný div; bez cieľa ostáva tlačidlo ako doteraz.
  const Tag: any = !ciel && onClick ? "button" : "div";
  return (
    <div
      {...karta}
      className={cn(
        "rounded-xl border bg-card p-3 shadow-sm",
        vybrane ? "border-primary/50 ring-1 ring-primary/30" : "border-border",
        (ciel || onClick) && "cursor-pointer active:opacity-80",
      )}
    >
      <div className={onVyber ? "flex items-start gap-2.5" : undefined}>
        {onVyber && (
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-label={vyberPopis}
            checked={!!vybrane}
            onChange={(e) => onVyber(e.target.checked)}
          />
        )}
        <Tag
          type={Tag === "button" ? "button" : undefined}
          onClick={Tag === "button" ? onClick : undefined}
          className="block w-full min-w-0 text-left"
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <div className="min-w-0">
              {/* Bez `truncate` — štítky pri čísle (Dobropis, eFaktúra) sa radšej zalomia, než by ich orezal okraj. */}
              <div className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">
                {ciel ? (
                  <Link {...ciel} className="text-inherit no-underline">
                    {title}
                  </Link>
                ) : (
                  title
                )}
              </div>
              {subtitle && (
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div>
              )}
            </div>
            {status && <div className="shrink-0">{status}</div>}
          </div>
          {(meta || amount) && (
            <div className="mt-2 flex items-end justify-between gap-2 text-xs">
              <div className="min-w-0 truncate text-muted-foreground">{meta}</div>
              {amount && <div className="suma shrink-0 text-sm text-foreground">{amount}</div>}
            </div>
          )}
        </Tag>
      </div>
      {actions && (
        <div className="mt-2 flex items-center justify-end gap-1 border-t border-border/60 pt-2">
          {actions}
        </div>
      )}
    </div>
  );
}
