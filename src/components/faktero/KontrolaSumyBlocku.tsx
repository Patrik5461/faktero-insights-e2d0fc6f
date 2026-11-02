import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { KontrolaSumy } from "@/lib/faktero/zaokruhlenie-blocku";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";

const f = (n: number) => n.toFixed(2).replace(".", ",");

/**
 * Upozornenie, že základ + DPH + zaokrúhlenie nesedí so sumou bločku.
 * Kým sa súčet nezhoduje, svieti; po oprave sumy zmizne samo. Pri hotovosti
 * do 2 centov ponúkne rozdiel zapísať ako zaokrúhlenie.
 */
export function KontrolaSumyBlocku({
  kontrola,
  mena,
  onZaokruhlenie,
  className = "",
}: {
  kontrola: KontrolaSumy;
  mena: string;
  /** Zapíše rozdiel ako zaokrúhlenie (nová celková hodnota zaokrúhlenia). */
  onZaokruhlenie?: (suma: number) => void;
  className?: string;
}) {
  const { t } = useT();
  if (kontrola.sedi) return null;
  return (
    <div role="alert" data-kontrola-sumy className={`dk-pozor flex flex-wrap items-start gap-2 rounded-md border p-2.5 text-sm ${className}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">
          {t("Súčet nesedí so sumou bločku — rozdiel {rozdiel} {mena}", { rozdiel: f(kontrola.rozdiel), mena })}
        </div>
        <div className="text-xs">
          {t("Základ + DPH + zaokrúhlenie = {riadky} {mena}, suma bločku {celkom} {mena}. Opravte sumy, inak sa doklad zaúčtuje až po potvrdení.", {
            riadky: f(kontrola.zRiadkov),
            celkom: f(kontrola.celkom),
            mena,
          })}
        </div>
      </div>
      {onZaokruhlenie && kontrola.navrhZaokruhlenia != null ? (
        <button
          type="button"
          onClick={() => onZaokruhlenie(kontrola.navrhZaokruhlenia!)}
          className="shrink-0 rounded-md border border-input bg-card px-2 py-1 text-xs font-semibold text-foreground hover:bg-secondary"
        >
          {t("Zapísať ako zaokrúhlenie")}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Otázka pred zaúčtovaním bločku, ktorého súčet nesedí. `true` = pokračovať
 * (súčet sedí, alebo človek rozdiel vedome potvrdil).
 */
export async function potvrdRozdielSumy(
  kontrola: KontrolaSumy,
  mena: string,
  t: (s: string, p?: Record<string, string | number>) => string,
): Promise<boolean> {
  if (kontrola.sedi) return true;
  return potvrd(
    t("Súčet nesedí so sumou bločku o {rozdiel} {mena}", { rozdiel: f(kontrola.rozdiel), mena }) +
      "\n" +
      t("Základ + DPH + zaokrúhlenie = {riadky} {mena}, suma bločku {celkom} {mena}. Pokračovať aj tak?", {
        riadky: f(kontrola.zRiadkov),
        celkom: f(kontrola.celkom),
        mena,
      }),
    { potvrdit: t("Pokračovať aj tak"), zrusit: t("Späť") },
  );
}

const precitaj = (text: string): number | null => {
  const v = text.replace(/\s/g, "").replace(",", ".");
  if (v === "" || v === "-" || v === "+") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

/**
 * Pole na zaokrúhlenie — drží si text, aby sa dalo písať „-0,02“ po znakoch
 * (číslo by z „-0,0“ urobilo nulu a mínus by zmizol).
 */
export function VstupZaokruhlenia({
  value,
  onChange,
  className,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  className?: string;
}) {
  const { t } = useT();
  const [text, setText] = useState(value == null ? "" : String(value).replace(".", ","));
  useEffect(() => {
    if (precitaj(text) !== (value ?? null)) setText(value == null ? "" : String(value).replace(".", ","));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      aria-label={t("Zaokrúhlenie")}
      inputMode="decimal"
      placeholder="0,00"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(precitaj(e.target.value));
      }}
      className={className}
    />
  );
}
