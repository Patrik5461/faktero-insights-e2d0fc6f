import { Plus, Trash2 } from "lucide-react";
import { DesatinnePole } from "@/components/faktero/DesatinnePole";
import { useT } from "@/lib/i18n/useT";
import { formatujMenu } from "@/lib/faktero/mena";
import type { UdajeNespracovaneho } from "@/lib/faktero/nespracovane";
import { naUhraduSOdpoctom } from "@/lib/faktero/odpocet-zalohy-vytazenie";

/**
 * Odpočet zaplatenej zálohy na prijatej faktúre v Nespracovaných
 * („Predplatba: Záloh. fak. č. 20260037 −900,00“). Nezdanená záloha sa dá
 * upraviť aj zmazať — rozpis DPH nemení, mení len sumu na úhradu. Zdanená
 * je už v rozpise a položkách, tu sa len ukáže.
 */
export function OdpocetZalohyNespracovaneho({
  u,
  set,
  celkom,
  className = "",
}: {
  u: UdajeNespracovaneho;
  set: (z: Partial<UdajeNespracovaneho>) => void;
  /** Celková suma dokladu (s DPH, pred odpočtom). */
  celkom: number;
  className?: string;
}) {
  const { t } = useT();
  const mena = u.mena || "EUR";
  const zd = u.zalohaZdanena;
  return (
    <div className={`text-sm ${className}`}>
      {zd ? (
        <p className="text-right text-xs text-muted-foreground">
          {t("Odpočet zdanenej zálohy{cislo}: základ −{zaklad}, DPH −{dph} — je už v rozpise DPH aj v položkách.", {
            cislo: zd.cislo ? ` č. ${zd.cislo}` : "",
            zaklad: formatujMenu(zd.zaklad, mena),
            dph: formatujMenu(zd.dph, mena),
          })}
        </p>
      ) : null}
      {u.zaloha != null ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <label className="inline-flex items-center gap-2">
            <span className="text-muted-foreground">{t("Odpočet zálohy")}</span>
            <span aria-hidden>−</span>
            <DesatinnePole
              aria-label={t("Odpočet zálohy")}
              hodnota={u.zaloha}
              naZmenu={(v) => set({ zaloha: Math.abs(v) })}
              className="w-28 rounded-md border border-input bg-background px-2 py-1.5 text-right tabular-nums"
            />
            {mena}
          </label>
          <label className="inline-flex items-center gap-2">
            <span className="text-muted-foreground">{t("zálohová faktúra č.")}</span>
            <input
              aria-label={t("Číslo zálohovej faktúry")}
              value={u.zalohaCislo ?? ""}
              onChange={(e) => set({ zalohaCislo: e.target.value })}
              className="w-32 rounded-md border border-input bg-background px-2 py-1.5"
            />
          </label>
          <button
            type="button"
            aria-label={t("Zrušiť odpočet zálohy")}
            title={t("Zrušiť odpočet zálohy")}
            onClick={() => set({ zaloha: undefined, zalohaCislo: undefined })}
            className="rounded p-1 text-muted-foreground hover:bg-secondary"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <span className="w-full text-right font-medium">
            {t("Na úhradu")}: {formatujMenu(naUhraduSOdpoctom(celkom, u.zaloha), mena)}
          </span>
        </div>
      ) : !zd ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => set({ zaloha: 0 })}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3 w-3" />
            {t("Odpočet zaplatenej zálohy")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
