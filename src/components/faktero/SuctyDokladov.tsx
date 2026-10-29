import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { formatujMenu, formatujCislo } from "@/lib/faktero/mena";
import { maRozneSadzby, type MenaSuhrnu, type SuhrnDph } from "@/lib/faktero/suhrn-dph";
import { useT } from "@/lib/i18n/useT";

/**
 * Základ dane · DPH · Celkom po menách (meny sa nesčítavajú) a pod tým rozpis
 * po sadzbách DPH, keď ich je v mene viac. Spoločné pre lištu výberu aj pre
 * súčet za filter pod zoznamom, nech vyzerajú vo všetkých agendách rovnako.
 */
export function RozpisSuctov({ suhrn }: { suhrn: SuhrnDph }) {
  const { t } = useT();
  if (!suhrn.meny.length) return null;
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      {suhrn.meny.map((m) => (
        <RiadokMeny key={m.mena} m={m} />
      ))}
      {suhrn.meny.length > 1 ? (
        <span className="text-[11px] text-muted-foreground">
          {t("Sumy v rôznych menách sa nesčítavajú.")}
        </span>
      ) : null}
    </span>
  );
}

function RiadokMeny({ m }: { m: MenaSuhrnu }) {
  const { t } = useT();
  const suma = (n: number | null) => (n == null ? "—" : formatujMenu(n, m.mena));
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 tabular-nums">
        <span className="min-w-0">
          <span className="text-muted-foreground">{t("Základ dane")}</span>{" "}
          <strong className="text-foreground">{suma(m.zaklad)}</strong>
        </span>
        <span className="min-w-0">
          <span className="text-muted-foreground">{t("DPH")}</span>{" "}
          <strong className="text-foreground">{suma(m.dph)}</strong>
        </span>
        <span className="min-w-0">
          <span className="text-muted-foreground">{t("Celkom")}</span>{" "}
          <strong className="text-foreground">{suma(m.celkom)}</strong>
        </span>
      </span>
      {maRozneSadzby(m) ? (
        <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
          {m.sadzby.map((s) => (
            <span key={`${s.sadzba}|${s.pdp}`} className="min-w-0">
              <span className="font-medium text-foreground/80">
                {s.pdp
                  ? t("Prenesenie")
                  : s.sadzba == null
                    ? t("Bez rozpisu")
                    : `${formatujCislo(s.sadzba, 0, 2)} %`}
                :
              </span>{" "}
              {t("základ {z}, DPH {d}", {
                z: formatujMenu(s.zaklad, m.mena),
                d: formatujMenu(s.dph, m.mena),
              })}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

/** „3 doklady“ so slovenským skloňovaním. */
export function usePocetDokladov() {
  const { t } = useT();
  return (k: number) =>
    t(k === 1 ? "{n} doklad" : k >= 2 && k <= 4 ? "{n} doklady" : "{n} dokladov", { n: k });
}

/**
 * Súčet za celý vyfiltrovaný zoznam — pätička pod tabuľkou, keď nie je nič
 * označené (označené ukazuje `SuctovaListaVyberu`). `doplnok` je miesto pre
 * údaje, ktoré si zoznam drží sám (napr. „Na export“).
 */
export function SuctovaPatickaZoznamu({
  suhrn,
  nacitava,
  nadpis,
  doplnok,
}: {
  suhrn: SuhrnDph | null;
  nacitava?: boolean;
  /** Predvolene „Spolu za filter:“. */
  nadpis?: string;
  doplnok?: ReactNode;
}) {
  const { t } = useT();
  const doklady = usePocetDokladov();
  if (!suhrn && !nacitava) return null;
  return (
    <div
      role="region"
      aria-label={t("Súčet dokladov v zozname")}
      className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-1 border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
    >
      <span className="min-w-0">
        {nadpis ?? t("Spolu za filter:")}{" "}
        {suhrn ? <strong className="text-foreground">{doklady(suhrn.pocet)}</strong> : null}
        {nacitava ? <Loader2 className="ml-1 inline h-3 w-3 animate-spin" /> : null}
        {suhrn && suhrn.mimo > 0 ? (
          <span
            className="ml-1"
            title={t(
              "Stornované doklady sa do súčtu nepočítajú, koncepty a zálohové len vo vlastnej záložke.",
            )}
          >
            ({t("{n} mimo súčtu", { n: suhrn.mimo })})
          </span>
        ) : null}
      </span>
      {suhrn ? <RozpisSuctov suhrn={suhrn} /> : null}
      {doplnok ? <span className="ml-auto flex min-w-0 flex-wrap gap-x-6">{doplnok}</span> : null}
    </div>
  );
}
