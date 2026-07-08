import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Search } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  searchCompaniesByNameFn,
  lookupCompanyByIcoFn,
  companyLookupConfiguredFn,
} from "@/lib/faktero/company-lookup.functions";
import type { NormalizedCompany, FinstatSuggestion } from "@/lib/faktero/company-registry.server";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Called when user picks a suggestion and FinStat detail is loaded. opts.auto = true (don't overwrite manual edits). */
  onPick: (data: NormalizedCompany, opts: { auto: boolean }) => void;
  className?: string;
  autoFocus?: boolean;
  placeholder?: string;
};

export function CompanyNameAutocomplete({
  value,
  onChange,
  onPick,
  className,
  autoFocus,
  placeholder,
}: Props) {
  const [enabled, setEnabled] = useState(false);
  const [nameSearchDisabled, setNameSearchDisabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [items, setItems] = useState<FinstatSuggestion[]>([]);
  const [picking, setPicking] = useState<string | null>(null);

  const cfg = useServerFn(companyLookupConfiguredFn);
  const search = useServerFn(searchCompaniesByNameFn);
  const lookup = useServerFn(lookupCompanyByIcoFn);
  const wrapRef = useRef<HTMLDivElement>(null);
  const lastQueryRef = useRef<string>("");
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showSuccess(msg: string) {
    setError(null);
    setSuccess(msg);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setSuccess(null), 3000);
  }

  useEffect(() => () => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
  }, []);

  useEffect(() => {
    cfg().then((r) => setEnabled(!!r?.enabled)).catch(() => setEnabled(false));
  }, []);

  // Debounced name search
  useEffect(() => {
    if (!enabled) return;
    const q = (value ?? "").trim();
    if (q.length < 3) {
      setItems([]);
      setError(null);
      setOpen(false);
      return;
    }
    if (q === lastQueryRef.current) {
      // Same query as last time — keep state coherent, don't leave a stale error.
      return;
    }
    // Clear any prior error/success the moment the user changes the query.
    setError(null);
    setSuccess(null);
    const handle = setTimeout(async () => {
      lastQueryRef.current = q;
      setLoading(true);
      setError(null);
      try {
        const res = await search({ data: { query: q } });
        if (res.status === "ok") {
          setItems(res.data);
          setError(null);
          setOpen(true);
        } else {
          setItems([]);
          setError("FinStat momentálne neodpovedá.");
          setOpen(true);
        }
      } catch {
        setItems([]);
        setError("FinStat momentálne neodpovedá.");
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [value, enabled]);

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function pick(s: FinstatSuggestion) {
    setPicking(s.ico);
    setError(null);
    try {
      const res = await lookup({ data: { ico: s.ico } });
      if (res.status === "ok") {
        onPick(res.data, { auto: true });
        setItems([]);
        setError(null);
        setOpen(false);
        showSuccess("Údaje boli načítané z FinStat.");
      } else {
        setError("FinStat momentálne neodpovedá.");
        setOpen(true);
      }
    } finally {
      setPicking(null);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (items.length || error || loading) setOpen(true);
        }}
        placeholder={placeholder}
        className={className ?? "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"}
        autoComplete="off"
      />
      {enabled && open && (loading || error || items.length > 0) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-md border border-border bg-popover shadow-lg">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Vyhľadávam vo FinState...
            </div>
          )}
          {!loading && error && items.length === 0 && (
            <div className="px-3 py-2 text-xs text-destructive">{error}</div>
          )}
          {!loading && !error && items.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Firma nebola nájdená.</div>
          )}
          {!loading && items.map((s) => (
            <button
              key={`${s.ico}-${s.name}`}
              type="button"
              onClick={() => pick(s)}
              disabled={picking === s.ico}
              className="flex w-full items-start gap-2 border-b border-border/60 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-secondary disabled:opacity-50"
            >
              <Search className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground">{s.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  IČO {s.ico}{s.city ? ` · ${s.city}` : ""}
                </div>
              </div>
              {picking === s.ico && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </button>
          ))}
        </div>
      )}
      {enabled && success && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          {success}
        </p>
      )}
    </div>
  );
}