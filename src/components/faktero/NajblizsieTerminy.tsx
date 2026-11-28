import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, ChevronRight } from "lucide-react";
import { danovyKalendarFn } from "@/lib/faktero/danovy-kalendar.functions";
import type { Termin } from "@/lib/faktero/danovy-kalendar";
import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";

/**
 * Najbližšie daňové termíny firmy (FAK-667) — karta na Prehľade a v Moje
 * úlohy, aby kalendár nebol schovaný v Účtovníctve. Termíny v najbližších
 * 45 dňoch, najviac tri; do 7 dní zvýraznené. Chyba = karta sa neukáže.
 */
export function NajblizsieTerminy({ companyId, className = "" }: { companyId: string | null; className?: string }) {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const nacitaj = useServerFn(danovyKalendarFn);
  const [terminy, setTerminy] = useState<Termin[] | null>(null);
  const dnes = dnesBratislava();

  useEffect(() => {
    if (!companyId) return;
    let zrusene = false;
    const doo = new Date(`${dnes}T12:00:00Z`);
    doo.setUTCDate(doo.getUTCDate() + 45);
    nacitaj({ data: { company_id: companyId, od: dnes, do: doo.toISOString().slice(0, 10) } })
      .then((r) => !zrusene && setTerminy(r.terminy.slice(0, 3)))
      .catch(() => !zrusene && setTerminy([]));
    return () => {
      zrusene = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, dnes]);

  if (!terminy || !terminy.length) return null;
  const dni = (d: string) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${dnes}T12:00:00Z`)) / 86_400_000);

  return (
    <section className={`rounded-xl border border-border bg-card ${className}`} data-najblizsie-terminy="">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-primary" /> {t("Najbližšie daňové termíny")}
        </h2>
        <Link to="/uctovnictvo/danovy-kalendar" className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
          {t("Daňový kalendár")} <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {terminy.map((x) => {
          const d = dni(x.datum);
          return (
            <li key={`${x.druh}-${x.datum}-${x.obdobie}`} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="w-14 shrink-0 font-semibold tabular-nums">
                {new Date(`${x.datum}T12:00:00Z`).toLocaleDateString(loc, { day: "numeric", month: "numeric", timeZone: "Europe/Bratislava" })}
              </span>
              <span className="min-w-0 flex-1 truncate" title={`${t(x.nazov)} — ${x.obdobie}`}>
                {t(x.nazov)} <span className="text-muted-foreground">· {x.obdobie}</span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  d <= 7 ? "dk-pozor border" : "bg-secondary text-muted-foreground"
                }`}
              >
                {d === 0 ? t("dnes") : t("o {n} dní", { n: d })}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
