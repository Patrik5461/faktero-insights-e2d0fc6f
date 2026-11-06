import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Bot } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { mnozne } from "@/lib/faktero/mnozne";
import { statistikaAutoUctovaniaFn } from "@/lib/faktero/auto-uctovanie.functions";

/** Prehľad: koľko dokladov sa tento mesiac zaúčtovalo samo. Firma bez účtovania nič nevidí. */
export function AutoUctovanieWidget({ companyId }: { companyId: string }) {
  const { t } = useT();
  const nacitaj = useServerFn(statistikaAutoUctovaniaFn);
  const [s, setS] = useState<Awaited<ReturnType<typeof statistikaAutoUctovaniaFn>> | undefined>();
  useEffect(() => {
    nacitaj({ data: { company_id: companyId } })
      .then(setS)
      .catch(() => setS(null));
  }, [companyId, nacitaj]);
  if (!s) return null;
  return (
    <div className="mb-6">
      <Link
        to="/uctovnictvo/zauctovanie"
        search={{ tab: "kontrola" } as any}
        className="group flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-accent/60"
      >
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">{t("Automatické zaúčtovanie")}</div>
            <div className="text-xs text-muted-foreground">
              {t("Tento mesiac {auto} z {spolu} zaúčtovaných dokladov samo", {
                auto: s.automaticky,
                spolu: s.spolu,
              })}
              {s.naKontrolu > 0 &&
                ` · ${t(mnozne(s.naKontrolu, ["{n} návrh čaká na kontrolu", "{n} návrhy čakajú na kontrolu", "{n} návrhov čaká na kontrolu"]), { n: s.naKontrolu })}`}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <div className="suma text-2xl font-bold">
              {s.percent === null ? "—" : `${s.percent} %`}
            </div>
            <div className="text-[12px] text-muted-foreground">{t("automaticky")}</div>
          </div>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
        </div>
      </Link>
    </div>
  );
}
