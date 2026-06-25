import type { ReactNode } from "react";

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
  return (
    <div className={className}>
      {/* Desktop / tablet table */}
      <div className="hidden sm:block">{desktop}</div>

      {/* Mobile card list */}
      <div className="space-y-2 sm:hidden">
        {loading && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Načítavam…
          </div>
        )}
        {!loading && items.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        )}
        {!loading && items.map((it, i) => (
          <div key={(it as any)?.id ?? i}>{mobileCard(it, i)}</div>
        ))}
      </div>
    </div>
  );
}

/**
 * MobileListCard — opinionated card layout for the mobile branch of
 * ResponsiveTable. Keeps spacing/typography consistent across list pages.
 */
export function MobileListCard({
  title,
  subtitle,
  status,
  meta,
  amount,
  actions,
  onClick,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  meta?: ReactNode;
  amount?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
}) {
  const Tag: any = onClick ? "button" : "div";
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <Tag
        type={onClick ? "button" : undefined}
        onClick={onClick}
        className={`block w-full text-left ${onClick ? "active:opacity-80" : ""}`}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{title}</div>
            {subtitle && (
              <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div>
            )}
          </div>
          {status && <div className="shrink-0">{status}</div>}
        </div>
        {(meta || amount) && (
          <div className="mt-2 flex items-end justify-between gap-2 text-xs">
            <div className="min-w-0 truncate text-muted-foreground">{meta}</div>
            {amount && (
              <div className="shrink-0 text-sm font-semibold text-foreground">{amount}</div>
            )}
          </div>
        )}
      </Tag>
      {actions && (
        <div className="mt-2 flex items-center justify-end gap-1 border-t border-border/60 pt-2">
          {actions}
        </div>
      )}
    </div>
  );
}