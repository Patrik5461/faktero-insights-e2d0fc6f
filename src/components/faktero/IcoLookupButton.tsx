import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  lookupCompanyByIcoFn,
  companyLookupConfiguredFn,
} from "@/lib/faktero/company-lookup.functions";
import type { NormalizedCompany } from "@/lib/faktero/company-registry.server";
import { useT } from "@/lib/i18n/useT";

type Props = {
  ico: string;
  onResult: (data: NormalizedCompany, opts: { auto: boolean }) => void;
  className?: string;
  /** Enable automatic debounced lookup when user types 8 digits. Default: true. */
  autoLookup?: boolean;
  /** Optional callback after a duplicate-customer check fires (caller wires findCustomerByIcoFn). */
};

export function IcoLookupButton({ ico, onResult, className, autoLookup = true }: Props) {
  // Optimistic default: show the button immediately. Server config check
  // only downgrades to `false` if FinStat is confirmed missing.
  const { t } = useT();
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState<null | { dic: boolean; ic_dph: boolean }>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lookup = useServerFn(lookupCompanyByIcoFn);
  const cfg = useServerFn(companyLookupConfiguredFn);
  const lastAutoIcoRef = useRef<string>("");
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showSuccess(msg: string) {
    setError(null);
    setSuccess(msg);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setSuccess(null), 3000);
  }

  useEffect(
    () => () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    cfg()
      .then((r) => setEnabled(!!r?.enabled))
      .catch(() => setEnabled(false));
  }, []);

  async function run(auto = false) {
    const v = (ico ?? "").trim().replace(/\s+/g, "");
    if (!v) return toast.error(t("Zadajte IČO"));
    if (!/^\d+$/.test(v)) return toast.error(t("IČO môže obsahovať len číslice"));
    if (v.length < 6 || v.length > 8) return toast.error(t("Neplatné IČO"));
    setLoading(true);
    setMissing(null);
    // Clear any previous success/error before issuing a new lookup.
    setError(null);
    setSuccess(null);
    try {
      const res = await lookup({ data: { ico: v } });
      if (res.status === "ok") {
        onResult(res.data, { auto });
        const dicMissing = !res.data.dic;
        const icDphMissing = !res.data.ic_dph;
        if (dicMissing || icDphMissing) setMissing({ dic: dicMissing, ic_dph: icDphMissing });
        // Data populated successfully — guarantee no error state remains visible.
        setError(null);
        const msg = res.cached
          ? t("Údaje boli načítané z FinStat (cache).")
          : t("Údaje boli načítané z FinStat.");
        showSuccess(msg);
        if (!auto) toast.success(msg);
      } else if (res.status === "not_found") {
        if (!auto) {
          setError(t("Firma nebola nájdená."));
          toast.error(t("Firma nebola nájdená."));
        }
      } else {
        const m = String(res.message ?? "");
        let label = t("FinStat: {sprava}", { sprava: m });
        if (m.startsWith("auth_") || m.startsWith("Autorizácia FinStat")) {
          label =
            t("Autorizácia FinStat API zlyhala. Skontrolujte API kľúče alebo spôsob generovania hash.");
        } else if (m === "FinStat API nie je nakonfigurované." || m === "not_configured") {
          label = t("FinStat API nie je nakonfigurované.");
        } else if (m === "network" || m.startsWith("http_") || m === "invalid_response") {
          label = t("FinStat momentálne neodpovedá.");
        }
        if (!auto) {
          setError(label);
          toast.error(label);
        }
      }
    } catch (e: any) {
      if (!auto) {
        const label = e?.message ?? t("Nepodarilo sa načítať údaje.");
        setError(label);
        toast.error(label);
      }
    } finally {
      setLoading(false);
    }
  }

  // Debounced auto-lookup when user types exactly 8 digits.
  useEffect(() => {
    if (!enabled || !autoLookup) return;
    const v = (ico ?? "").trim().replace(/\s+/g, "");
    if (!/^\d{8}$/.test(v)) return;
    if (lastAutoIcoRef.current === v) return;
    const handle = setTimeout(() => {
      lastAutoIcoRef.current = v;
      run(true);
    }, 600);
    return () => clearTimeout(handle);
  }, [ico, enabled, autoLookup]);

  /*
    Obal sa nesmie zmenšiť (shrink-0) a text sa nesmie lámať — česky je
    „Načíst / podle IČO“ dlhšie a tlačidlo sa vedľa políčka IČO stláčalo
    do dvoch-troch riadkov. Zmenšuje sa radšej políčko (min-w-0 u volajúceho).
  */
  return (
    <div className="flex shrink-0 flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => run(false)}
        disabled={loading || !enabled}
        title={!enabled ? t("FinStat API nie je nakonfigurované na serveri.") : undefined}
        className={
          className ??
          "relative h-10 inline-flex shrink-0 items-center gap-2 rounded-r-md border border-input bg-secondary px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary/80 focus:z-20 focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
        }
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="whitespace-nowrap text-left leading-tight">
          {loading ? t("Vyhľadávam...") : t("Načítať")}
          {!loading && (
            <span className="block whitespace-nowrap text-[10px] uppercase tracking-wider opacity-60">
              {t("podľa IČO")}
            </span>
          )}
        </span>
      </button>
      {!enabled && (
        <p className="flex items-start gap-1 text-[11px] text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {t("FinStat API nie je nakonfigurované.")}
        </p>
      )}
      {success && !error && (
        <p className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          {success}
        </p>
      )}
      {error && !success && (
        <p className="flex items-start gap-1 text-[11px] text-destructive">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
      {missing && !error && (
        <p className="flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {t(
            missing.dic && missing.ic_dph
              ? "FinStat nevrátil DIČ ani IČ DPH pre túto firmu."
              : missing.dic
                ? "FinStat nevrátil DIČ pre túto firmu."
                : "FinStat nevrátil IČ DPH pre túto firmu.",
          )}
        </p>
      )}
    </div>
  );
}
