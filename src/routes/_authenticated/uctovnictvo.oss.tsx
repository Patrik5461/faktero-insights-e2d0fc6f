import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { ossPrehladFn } from "@/lib/faktero/oss.functions";
import { PRAH_OSS } from "@/lib/faktero/sadzby-eu";
import { AlertTriangle, Loader2 } from "lucide-react";
import { slovoPodlaPoctu } from "@/lib/faktero/sklonovanie";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";

export const Route = createFileRoute("/_authenticated/uctovnictvo/oss")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "OSS — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Podklady pre priznanie k jednému kontaktnému miestu: predaj spotrebiteľom v EÚ podľa štátov a sadzieb, vrátane sledovania hranice 10 000 €.",
        ),
      },
    ],
  }),
  component: OssPage,
});

type Data = Awaited<ReturnType<typeof ossPrehladFn>>;

function eur(n: number): string {
  return n.toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function OssPage() {
  const { t, jazyk } = useT();
  const nacitajPrehlad = useServerFn(ossPrehladFn);
  const dnes = new Date();
  const [rok, setRok] = useState(dnes.getFullYear());
  const [stvrtrok, setStvrtrok] = useState(Math.floor(dnes.getMonth() / 3) + 1);
  const [data, setData] = useState<Data | null>(null);
  const [nacitavam, setNacitavam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const nacitaj = useCallback(async () => {
    const companyId = getActiveCompanyId();
    if (!companyId) return;
    setNacitavam(true);
    setChyba(null);
    try {
      setData(await nacitajPrehlad({ data: { company_id: companyId, rok, stvrtrok } }));
    } catch (e: any) {
      setChyba(e?.message ?? t("Prehľad sa nepodarilo zostaviť."));
    } finally {
      setNacitavam(false);
    }
  }, [nacitajPrehlad, rok, stvrtrok, t]);

  useEffect(() => {
    nacitaj();
  }, [nacitaj]);

  return (
    <>
      <PageHeader
        title={t("OSS")}
        description={t(
          "Predaj spotrebiteľom v EÚ — podklady pre priznanie k jednému kontaktnému miestu za štvrťrok.",
        )}
      />
      <PageBody>
        <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3 sm:p-5">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">{t("Rok")}</span>
            <input
              type="number"
              value={rok}
              onChange={(e) => setRok(Number(e.target.value))}
              className="input mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">{t("Štvrťrok")}</span>
            <select
              value={stvrtrok}
              onChange={(e) => setStvrtrok(Number(e.target.value))}
              className="input mt-1"
            >
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>
                  {t("{q}. štvrťrok", { q })}
                </option>
              ))}
            </select>
          </label>
        </div>

        {chyba && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
          >
            {chyba}
          </div>
        )}
        {nacitavam && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> {t("Počítam…")}
          </div>
        )}

        {data && (
          <>
            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="text-base font-semibold tabular-nums">
                  {t("Hranica {suma} € za rok {rok}", { suma: eur(PRAH_OSS), rok })}
                </div>
                <div className="text-sm text-muted-foreground tabular-nums">
                  {t("Predaj do EÚ zatiaľ {suma} €", { suma: eur(data.zaRok) })}
                </div>
              </div>
              <div
                className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(Math.min(data.prah.podiel, 1) * 100)}
              >
                <div
                  className={`h-full ${data.prah.prekroceny ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${Math.round(data.prah.podiel * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {data.prah.prekroceny
                  ? t(
                      "Hranica je prekročená — predaj spotrebiteľom v EÚ sa zdaňuje sadzbou štátu zákazníka a daň sa odvádza cez OSS.",
                    )
                  : t(
                      "Do hranice zostáva {suma} €. Dovtedy sa dá zdaňovať doma, ak sa nerozhodnete pre OSS dobrovoľne.",
                      { suma: eur(data.prah.zostava) },
                    )}
              </p>
              {data.prepocitane && (
                <p className="mt-1 text-xs text-muted-foreground" data-testid="oss-prepocitane">
                  {t(
                    "Prepočítané: doklady v cudzej mene sú v eurách kurzom ECB k poslednému dňu štvrťroka (čl. 366 smernice 2006/112/ES).",
                  )}{" "}
                  {data.kurzy
                    .map(
                      (k) =>
                        `${k.mena} ${datumNaDoklade(k.den)}: ${k.kurz.toLocaleString(jazyk === "de" ? "de-DE" : jazyk === "cs" ? "cs-CZ" : "sk-SK", { maximumFractionDigits: 4 })}`,
                    )
                    .join(" · ")}
                </p>
              )}
              {data.predbezne && (
                <p
                  className="mt-1 text-xs text-warning"
                  data-testid="oss-predbezne"
                >
                  {t(
                    "Kurz ECB k poslednému dňu štvrťroka ešte nie je zverejnený — prepočet je predbežný (posledný zverejnený kurz).",
                  )}
                </p>
              )}
            </div>

            {data.prehlad.vytky.length > 0 && (
              <div className="rounded-lg border border-warning/30 bg-[color:var(--stav-pozor-plocha)] p-4 text-[color:var(--stav-pozor-text)]">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" /> {t("Pred podaním treba doplniť")}
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {data.prehlad.vytky.map((v, i) => (
                    <li key={i}>
                      <span className="font-medium">{v.doklad}</span>: {t(v.text)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <div className="text-base font-semibold">
                  {t("{q}. štvrťrok {rok}", { q: data.obdobie.stvrtrok, rok: data.obdobie.rok })}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t(
                    slovoPodlaPoctu(
                      data.pocet,
                      "{n} faktúra v režime OSS ({od} – {do})",
                      "{n} faktúry v režime OSS ({od} – {do})",
                      "{n} faktúr v režime OSS ({od} – {do})",
                    ),
                    {
                      n: data.pocet,
                      od: datumNaDoklade(data.obdobie.od),
                      do: datumNaDoklade(data.obdobie.do),
                    },
                  )}
                </div>
              </div>
              {data.prehlad.riadky.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  {t(
                    "V tomto štvrťroku nie je žiadny predaj spotrebiteľom v EÚ. Faktúru doň zaradíte zaškrtnutím „Predaj spotrebiteľovi v EÚ (OSS)“ pri jej vystavení.",
                  )}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
                      <tr>
                        <th className="whitespace-nowrap px-4 py-2">{t("Štát spotreby")}</th>
                        <th className="whitespace-nowrap px-4 py-2 text-right">{t("Sadzba")}</th>
                        <th className="whitespace-nowrap px-4 py-2 text-right">
                          {t("Základ dane")}
                        </th>
                        <th className="whitespace-nowrap px-4 py-2 text-right">{t("Daň")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.prehlad.riadky.map((r) => (
                        <tr
                          key={`${r.stat}-${r.sadzba}`}
                          className="border-t border-border"
                          data-testid={`oss-riadok-${r.stat}-${r.sadzba}`}
                          data-zaklad={r.zaklad}
                          data-dan={r.dan}
                        >
                          <td className="px-4 py-2">
                            {r.nazovStatu} <span className="text-muted-foreground">({r.stat})</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                            {r.sadzba} %
                          </td>
                          <td className="suma px-4 py-2 text-right">
                            {eur(r.zaklad)}
                            <span className="suma-mena">€</span>
                          </td>
                          <td className="suma px-4 py-2 text-right">
                            {eur(r.dan)}
                            <span className="suma-mena">€</span>
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border bg-muted/40 font-bold">
                        <td className="px-4 py-2" colSpan={2}>
                          {t("Spolu")}
                        </td>
                        <td className="suma px-4 py-2 text-right font-bold">
                          {eur(data.prehlad.zakladSpolu)}
                          <span className="suma-mena">€</span>
                        </td>
                        <td className="suma px-4 py-2 text-right font-bold">
                          {eur(data.prehlad.danSpolu)}
                          <span className="suma-mena">€</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {t(
                "Priznanie OSS sa podáva do konca mesiaca po skončení štvrťroka cez portál finančnej správy; údaje z tejto tabuľky sa doň prepíšu podľa štátov a sadzieb. Predaj v režime OSS nevstupuje do",
              )}{" "}
              <Link to="/uctovnictvo/vykazy" className="text-primary underline underline-offset-2">
                {t("priznania k DPH ani do kontrolného výkazu")}
              </Link>
              .
            </p>
          </>
        )}
      </PageBody>
    </>
  );
}
