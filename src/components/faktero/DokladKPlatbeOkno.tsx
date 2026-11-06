import { useEffect, useState } from "react";
import { ResponsiveDialog } from "@/components/faktero/ResponsiveDialog";
import { useT } from "@/lib/i18n/useT";
import { formatujMenu } from "@/lib/faktero/mena";

/**
 * Okno „Vystaviť daňový doklad k platbe“ zo zálohovej faktúry. Suma a dátum
 * sú predvyplnené z úhrady (aj čiastočnej) — daňová povinnosť vzniká dňom
 * prijatia platby (§ 19 ods. 4) a daň sa počíta z prijatej sumy.
 */
export function DokladKPlatbeOkno({
  open,
  onOpenChange,
  predvolenaSuma,
  predvolenyDatum,
  celkom,
  mena,
  busy,
  onVystav,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  predvolenaSuma: number;
  predvolenyDatum: string;
  /** Celá suma zálohy — viac sa vystaviť nedá. */
  celkom: number;
  mena: string | null | undefined;
  busy: boolean;
  onVystav: (v: { suma: number; datum: string }) => void;
}) {
  const { t } = useT();
  const [suma, setSuma] = useState("");
  const [datum, setDatum] = useState("");
  useEffect(() => {
    if (!open) return;
    setSuma(predvolenaSuma > 0 ? predvolenaSuma.toFixed(2) : "");
    setDatum(predvolenyDatum);
  }, [open, predvolenaSuma, predvolenyDatum]);

  const cislo = Number(suma.replace(",", ".").replace(/\s/g, ""));
  const chyba = !(cislo > 0)
    ? t("Zadajte prijatú sumu.")
    : cislo > celkom + 0.004
      ? t("Suma je vyššia ako záloha ({suma}).", { suma: formatujMenu(celkom, mena ?? "EUR") })
      : !/^\d{4}-\d{2}-\d{2}$/.test(datum)
        ? t("Zadajte dátum prijatia platby.")
        : null;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("Vystaviť daňový doklad k platbe")}
      description={t("Daň sa prizná v období prijatia platby a na vyúčtovacej faktúre sa už znovu nepočíta.")}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            {t("Zrušiť")}
          </button>
          <button
            type="button"
            disabled={busy || !!chyba}
            onClick={() => onVystav({ suma: Math.round(cislo * 100) / 100, datum })}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busy ? t("Vystavujem…") : t("Vystaviť daňový doklad")}
          </button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">{t("Prijatá suma s DPH")}</span>
          <input
            inputMode="decimal"
            value={suma}
            onChange={(e) => setSuma(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">{t("Dátum prijatia platby")}</span>
          <input
            type="date"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("Predvyplnené z úhrady zálohy. Pri čiastočnej platbe sa suma rozpočíta na položky podľa sadzieb.")}
      </p>
      {chyba && suma !== "" && <p className="mt-2 text-xs text-destructive">{chyba}</p>}
    </ResponsiveDialog>
  );
}
