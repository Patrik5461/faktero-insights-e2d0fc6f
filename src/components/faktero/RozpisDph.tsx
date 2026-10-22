import { useT } from "@/lib/i18n/useT";
import { formatujMenu } from "@/lib/faktero/mena";
import type { SkupinaRozpisu } from "@/lib/faktero/rozpis-dph";

/** Tabuľka sadzba · základ dane · DPH pod súčtami dokladu. */
export function RozpisDph({
  skupiny,
  mena,
  naZobrazenie = (n) => n,
}: {
  skupiny: SkupinaRozpisu[];
  mena: string | null | undefined;
  /** Úprava sumy na zobrazenie (napr. dobropis bez mínusu). */
  naZobrazenie?: (n: number) => number;
}) {
  const { t } = useT();
  if (!skupiny.length) return null;
  return (
    <table className="mt-2 w-full text-xs tabular-nums">
      <thead>
        <tr className="text-muted-foreground">
          <th className="py-1 text-left font-normal">{t("Sadzba DPH")}</th>
          <th className="py-1 text-right font-normal">{t("Základ dane")}</th>
          <th className="py-1 text-right font-normal">{t("DPH")}</th>
        </tr>
      </thead>
      <tbody>
        {skupiny.map((g) => (
          <tr key={`${g.prenesenie ? "p" : "s"}${g.sadzba}`} className="border-t border-border/60">
            <td className="py-1">
              {g.prenesenie ? t("prenesenie ({sadzba} %)", { sadzba: g.sadzba }) : `${g.sadzba} %`}
            </td>
            <td className="py-1 text-right">
              {formatujMenu(naZobrazenie(g.zaklad), mena ?? "EUR")}
            </td>
            <td className="py-1 text-right">{formatujMenu(naZobrazenie(g.dan), mena ?? "EUR")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
