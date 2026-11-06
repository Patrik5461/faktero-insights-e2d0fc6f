import { NapovedaOtaznik } from "@/components/faktero/NapovedaOtaznik";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import {
  nastavenieAutoUctovaniaFn,
  ulozNastavenieAutoUctovaniaFn,
} from "@/lib/faktero/auto-uctovanie.functions";
import { REZIMY_AUTOPILOTA, type RezimAutopilota } from "@/lib/faktero/auto-uctovanie";

/** Nastavenie automatického zaúčtovania firmy — režim autopilota a limit sumy. */
export function AutopilotKarta({ companyId }: { companyId: string }) {
  const { t } = useT();
  const nacitaj = useServerFn(nastavenieAutoUctovaniaFn);
  const uloz = useServerFn(ulozNastavenieAutoUctovaniaFn);
  const [stav, setStav] = useState<{
    rezim: RezimAutopilota;
    limit: number;
    mena: string;
    mozemMenit: boolean;
  } | null>(null);
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    nacitaj({ data: { company_id: companyId } })
      .then((s) => {
        setStav(s);
        setLimit(String(s.limit));
      })
      .catch(() => {});
  }, [companyId, nacitaj]);

  async function ulozit(rezim: RezimAutopilota, novyLimit = limit) {
    if (!stav) return;
    const l = Number(String(novyLimit).replace(",", "."));
    if (!Number.isFinite(l) || l < 0) return toast.error(t("Limit musí byť kladné číslo."));
    setBusy(true);
    try {
      await uloz({ data: { company_id: companyId, rezim, limit: l } });
      setStav({ ...stav, rezim, limit: l });
      toast.success(t("Uložené"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!stav) return null;
  return (
    <section
      className="rounded-xl border border-border bg-card p-4 text-sm sm:p-5"
      aria-labelledby="autopilot-nadpis"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="autopilot-nadpis" className="flex items-center gap-2 text-base font-semibold">
          <Bot className="h-4 w-4 text-primary" /> {t("Automatické zaúčtovanie")}
          <NapovedaOtaznik popis={t("Vysvetlivka: Automatické zaúčtovanie")}>
            {t(
              "Nový doklad dostane predkontáciu z pravidla, zo zvyku partnera alebo od AI; členenie DPH a KV sa odvodí z režimu dane. Doklad s blokátorom (nesedí súčet, chýba overenie IČ DPH, suma nad limitom, prvý doklad od partnera) vždy čaká na vás.",
            )}
          </NapovedaOtaznik>
        </h2>
        <Link
          to="/uctovnictvo/na-kontrolu"
          className="text-sm font-semibold text-primary hover:underline"
        >
          {t("Doklady na kontrolu")}
        </Link>
      </div>
      <fieldset className="mt-3 grid gap-2 sm:grid-cols-3" disabled={!stav.mozemMenit || busy}>
        <legend className="sr-only">{t("Režim autopilota")}</legend>
        {REZIMY_AUTOPILOTA.map((r) => (
          <label
            key={r.kod}
            className={`flex min-w-0 cursor-pointer flex-col gap-1 rounded-lg border p-3 ${
              stav.rezim === r.kod
                ? "border-primary bg-primary/10"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <span className="flex items-center gap-2 font-semibold">
              <input
                type="radio"
                name="autopilot"
                checked={stav.rezim === r.kod}
                onChange={() => void ulozit(r.kod)}
              />
              {t(r.nazov)}
            </span>
            <span className="text-xs text-muted-foreground">{t(r.popis)}</span>
          </label>
        ))}
      </fieldset>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-muted-foreground">
          {t("Limit sumy pre automatické zaúčtovanie ({mena})", { mena: stav.mena })}
          <input
            inputMode="decimal"
            value={limit}
            disabled={!stav.mozemMenit || busy}
            onChange={(e) => setLimit(e.target.value)}
            className="mt-1 block h-9 w-40 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums text-foreground"
          />
        </label>
        {stav.mozemMenit && String(stav.limit) !== limit && (
          <button
            onClick={() => void ulozit(stav.rezim)}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("Uložiť limit")}
          </button>
        )}
        {!stav.mozemMenit && (
          <span className="text-xs text-muted-foreground">
            {t("Nastavenie mení majiteľ alebo admin firmy.")}
          </span>
        )}
      </div>
    </section>
  );
}
