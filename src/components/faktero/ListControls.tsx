import {
  AlertTriangle,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Inbox,
  RotateCcw,
  Search,
  Trash2,
  X,
  ArrowDownUp,
} from "lucide-react";
import { useEffect, useState } from "react";

export function PageSizeSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      Zobraziť na stranu:
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
      >
        {[5, 25, 50, 100].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const pages: (number | "…")[] = [];
  const push = (n: number | "…") => {
    if (pages[pages.length - 1] !== n) pages.push(n);
  };
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) push(i);
    else if (i < page) push("…");
    else if (i > page) {
      push("…");
      break;
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
      <span className="text-muted-foreground">
        {total === 0 ? "Žiadne výsledky" : `Zobrazuje sa ${from}–${to} z ${total}`}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-40"
        >
          <ChevronLeft className="h-3 w-3" /> Predošlá
        </button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="px-1 text-muted-foreground">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`min-w-7 rounded-md px-2 py-1 text-xs ${p === page ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary"}`}
            >
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-40"
        >
          Ďalšia <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  warning,
  confirmLabel,
  danger = true,
  onCancel,
  onConfirm,
  busy,
}: {
  open: boolean;
  title: string;
  message: string;
  warning?: string;
  /**
   * Text potvrdzovacieho tlačidla. Bez neho sa použije „Vymazať" pri
   * nebezpečnej akcii a „Potvrdiť" pri ostatných — dialóg na označenie faktúr
   * ako zaplatených mal predtým červené tlačidlo „Vymazať", takže sa zdalo,
   * že sa akcia nedá potvrdiť vôbec.
   */
  confirmLabel?: string;
  /** `false` pre akcie, ktoré nič nemažú — tlačidlo nebude červené. */
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {warning && (
          <div className="mt-3 flex gap-2 rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{warning}</span>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
          >
            Zrušiť
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-md px-4 py-2 text-sm font-medium ${danger ? "bg-destructive text-destructive-foreground hover:opacity-90" : "bg-primary text-primary-foreground hover:opacity-90"} disabled:opacity-50`}
          >
            {busy ? "…" : (confirmLabel ?? (danger ? "Vymazať" : "Potvrdiť"))}
          </button>
        </div>
      </div>
    </div>
  );
}

export function BulkBar({
  count,
  showDeleted,
  onDelete,
  onRestore,
  onClear,
}: {
  count: number;
  showDeleted: boolean;
  onDelete: () => void;
  onRestore: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
      <span className="font-medium text-primary">Vybraté: {count}</span>
      <div className="flex gap-2">
        {showDeleted ? (
          <button
            onClick={onRestore}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Obnoviť
          </button>
        ) : (
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:opacity-90"
          >
            <Trash2 className="h-3.5 w-3.5" /> Vymazať vybraté
          </button>
        )}
        <button
          onClick={onClear}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary"
        >
          Zrušiť výber
        </button>
      </div>
    </div>
  );
}

export function DeletedToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      Zobraziť vymazané
    </label>
  );
}

export function useStoredPageSize(key: string, fallback = 25) {
  const [value, setValue] = useState<number>(() => {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(`faktero.pageSize.${key}`);
    const n = raw ? Number(raw) : NaN;
    return [5, 25, 50, 100].includes(n) ? n : fallback;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(`faktero.pageSize.${key}`, String(value));
  }, [key, value]);
  return [value, setValue] as const;
}

/* ------------------------------------------------------------------ */
/* Log/list toolbar — search + status/type selects + date range       */
/* ------------------------------------------------------------------ */

export type LogsToolbarSelect = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
};

export function LogsToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Hľadať…",
  selects = [],
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onReset,
  right,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  selects?: LogsToolbarSelect[];
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (v: string) => void;
  onDateToChange?: (v: string) => void;
  onReset?: () => void;
  right?: React.ReactNode;
}) {
  const showDates = !!(onDateFromChange || onDateToChange);
  const dirty =
    !!search ||
    !!dateFrom ||
    !!dateTo ||
    selects.some((s) => s.value && s.value !== "all" && s.value !== "");

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card/60 p-3">
      {/* Search */}
      <label className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm"
        />
      </label>

      {/* Selects */}
      {selects.map((s) => (
        <label
          key={s.label}
          className="flex flex-col text-[11px] font-medium text-muted-foreground"
        >
          <span className="mb-1 uppercase tracking-wider">{s.label}</span>
          <select
            value={s.value}
            onChange={(e) => s.onChange(e.target.value)}
            className="h-9 min-w-[140px] rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}

      {showDates && (
        <>
          <label className="flex flex-col text-[11px] font-medium text-muted-foreground">
            <span className="mb-1 inline-flex items-center gap-1 uppercase tracking-wider">
              <CalendarRange className="h-3 w-3" /> Od
            </span>
            <input
              type="date"
              value={dateFrom ?? ""}
              onChange={(e) => onDateFromChange?.(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="flex flex-col text-[11px] font-medium text-muted-foreground">
            <span className="mb-1 uppercase tracking-wider">Do</span>
            <input
              type="date"
              value={dateTo ?? ""}
              onChange={(e) => onDateToChange?.(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
        </>
      )}

      {dirty && onReset && (
        <button
          onClick={onReset}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground hover:bg-secondary"
        >
          <X className="h-3 w-3" /> Vyčistiť
        </button>
      )}

      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Footer combining page size + pagination                            */
/* ------------------------------------------------------------------ */

export function ListFooter({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card/40 px-3 py-2">
      <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Elegant empty state                                                */
/* ------------------------------------------------------------------ */

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-4 text-sm font-semibold text-foreground">{title}</div>
      {description && (
        <div className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export type MoznostZoradenia = {
  label: string;
  column: string;
  ascending?: boolean;
};

/**
 * Výber zoradenia zoznamu. Voľba sa pamätá (`sortKey` v `usePagedList`), takže
 * si ju klient nemusí prestavovať pri každom otvorení.
 */
export function SortSelect({
  moznosti,
  hodnota,
  onChange,
  className = "",
}: {
  moznosti: MoznostZoradenia[];
  hodnota: { column: string; ascending?: boolean };
  onChange: (z: { column: string; ascending?: boolean }) => void;
  className?: string;
}) {
  const kluc = (m: { column: string; ascending?: boolean }) =>
    `${m.column}:${m.ascending ? "asc" : "desc"}`;
  const aktualny = kluc(hodnota);
  // Zoradenie, ktoré v ponuke nie je (napr. zapamätané zo staršej verzie),
  // by inak vyzeralo ako prvá položka a mýlilo.
  const zname = moznosti.some((m) => kluc(m) === aktualny);

  return (
    <label className={`flex items-center gap-1.5 text-sm ${className}`}>
      <ArrowDownUp className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="sr-only">Zoradenie</span>
      <select
        value={zname ? aktualny : ""}
        onChange={(e) => {
          const m = moznosti.find((x) => kluc(x) === e.target.value);
          if (m) onChange({ column: m.column, ascending: m.ascending });
        }}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        aria-label="Zoradenie"
      >
        {!zname && <option value="">Vlastné zoradenie</option>}
        {moznosti.map((m) => (
          <option key={kluc(m)} value={kluc(m)}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}
