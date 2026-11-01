/*
  Zobrazenie súčtov po menách (zoznamy) a súčtu prepočítaného do domácej
  meny (prehľady). Logika je v `lib/faktero/mena-sucet.ts`.
*/
import { useMemo } from "react";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { useKrajinaDane, useMenaFirmy } from "@/lib/faktero/krajina-firmy";
import { formatujMenu } from "@/lib/faktero/mena";
import {
  formatujMenuKratko,
  formatujSucetPoMenach,
  sucetPoMenach,
  type SucetVDomacej,
  type SuctyMien,
} from "@/lib/faktero/mena-sucet";
import { cn } from "@/lib/utils";

/**
 * Formátovanie súm pre aktívnu firmu — náhrada lokálnych `suma()` s pevným EUR.
 * `suma(n)` v domácej mene, `suma(n, "CZK")` v mene dokladu,
 * `sucty(riadky, sumaFn, menaFn)` → Map po menách, `formatSucty(map)` → text.
 */
export function useFormatMenyFirmy() {
  const { kod: domaca, symbol } = useMenaFirmy();
  const krajina = useKrajinaDane();
  const { jazyk } = useT();
  const locale = lokalJazyka(jazyk);
  return useMemo(
    () => ({
      domaca,
      symbol,
      /** Krajina firmy do `sucetVDomacejMene(…, krajina)`. */
      krajina,
      locale,
      suma: (n: unknown, mena?: unknown) =>
        formatujMenu(n, typeof mena === "string" && mena ? mena : domaca, locale),
      sucty: <T,>(riadky: readonly T[], sumaFn: (r: T) => unknown, menaFn: (r: T) => unknown) =>
        sucetPoMenach(riadky, sumaFn, menaFn, domaca),
      formatSucty: (s: SuctyMien) => formatujSucetPoMenach(s, locale, { domaca }),
    }),
    [domaca, symbol, krajina, locale],
  );
}

/** „1 200,00 € · 3 400,00 Kč“ — každá mena sa láme ako celok. */
export function SuctyPoMenach({ sucty, className }: { sucty: SuctyMien; className?: string }) {
  const { domaca, locale } = useFormatMenyFirmy();
  const casti = useMemo(() => {
    const text = formatujSucetPoMenach(sucty, locale, { domaca, oddelovac: "\u0000" });
    return text.split("\u0000");
  }, [sucty, locale, domaca]);
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5 min-w-0", className)}>
      {casti.map((c, i) => (
        <span key={i} className="whitespace-nowrap tabular-nums">
          {i > 0 && <span className="text-muted-foreground mr-1.5" aria-hidden>·</span>}
          {c}
        </span>
      ))}
    </span>
  );
}

/**
 * Súčet prehľadu v domácej mene so značkou „prepočítané“ a zvyškom
 * „bez prepočtu“ (doklady bez kurzu).
 */
export function SumaVDomacejMene({ sucet, className }: { sucet: SucetVDomacej; className?: string }) {
  const { t, jazyk } = useT();
  const locale = lokalJazyka(jazyk);
  const banka = sucet.domaca === "CZK" ? "ČNB" : "ECB";
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 min-w-0", className)}>
      <span className="whitespace-nowrap tabular-nums">{formatujMenuKratko(sucet.suma, sucet.domaca, locale)}</span>
      {sucet.prepocitane && (
        <span
          className="text-xs text-muted-foreground whitespace-nowrap"
          title={t("Doklady v cudzej mene prepočítané kurzom {banka} z dokladu", { banka })}
        >
          {t("prepočítané")}
        </span>
      )}
      {sucet.bezPrepoctu.size > 0 && (
        <span className="text-xs text-muted-foreground">
          + {formatujSucetPoMenach(sucet.bezPrepoctu, locale, { domaca: sucet.domaca })}{" "}
          {t("bez prepočtu")}
        </span>
      )}
    </span>
  );
}
