import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { getPeriodLock, setPeriodLock } from "@/lib/faktero/uzavierka.functions";
import {
  jeOdomknutie,
  koniecPredoslehoMesiaca,
  koniecPredoslehoRoka,
  koniecPredoslehoStvrtroka,
} from "@/lib/faktero/uzavierka";
import { Lock, Unlock, ShieldCheck } from "lucide-react";
import { NacitavanieStav, ZamknutyStav } from "@/components/faktero/web/StavyObsahu";
import { potvrd } from "@/lib/potvrdenie";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
/** Dátum pre človeka po slovensky („30. 9. 2026“), prázdny ako „—“. */
const formatujDatum = (d: unknown) => datumNaDoklade(d);

export const Route = createFileRoute("/_authenticated/uctovnictvo/uzavierka")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Uzávierka — Faktero") }] }),
  component: UzavierkaPage,
});

function dnesISO() {
  return dnesBratislava();
}

function UzavierkaPage() {
  const { t } = useT();
  const fetchLock = useServerFn(getPeriodLock);
  const saveLock = useServerFn(setPeriodLock);

  const [stav, setStav] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [sprava, setSprava] = useState<string | null>(null);
  const [vlastny, setVlastny] = useState("");

  const cid = useMemo(() => getActiveCompanyId(), []);
  const dnes = useMemo(() => dnesISO(), []);

  const nacitaj = useCallback(() => {
    if (!cid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchLock({ data: { company_id: cid } })
      .then((d: any) => {
        setStav(d);
        setVlastny(d?.locked_until ?? "");
      })
      .catch((e: any) => setChyba(e?.message ?? t("Nepodarilo sa načítať stav")))
      .finally(() => setLoading(false));
  }, [cid, fetchLock, t]);

  useEffect(nacitaj, [nacitaj]);

  async function uloz(datum: string | null) {
    if (!cid) return;
    if (jeOdomknutie(stav?.locked_until, datum)) {
      const potvrdene = await potvrd(
        datum
          ? t(
              "Posúvate zámok späť na {datum}. Doklady medzi novým a pôvodným dátumom sa znova budú dať meniť — aj keď za to obdobie už bolo podané priznanie. Pokračovať?",
              { datum: formatujDatum(datum) },
            )
          : t("Rušíte uzamknutie úplne. Všetky doklady sa znova budú dať meniť. Pokračovať?"),
      );
      if (!potvrdene) return;
    }
    setBusy(true);
    setChyba(null);
    setSprava(null);
    try {
      await saveLock({ data: { company_id: cid, locked_until: datum } });
      setSprava(
        datum
          ? t("Uzamknuté do {datum}.", { datum: formatujDatum(datum) })
          : t("Uzamknutie zrušené."),
      );
      nacitaj();
    } catch (e: any) {
      setChyba(e?.message ?? t("Uloženie zlyhalo"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <PageBody>
        <NacitavanieStav />
      </PageBody>
    );
  }

  const zamknute = stav?.locked_until as string | null;
  const admin = !!stav?.je_admin;
  const tlacidlo =
    "rounded-md border border-input bg-card px-3 py-2 text-sm font-semibold tabular-nums hover:bg-accent disabled:opacity-50";

  return (
    <>
      <PageHeader
        title={t("Uzávierka")}
        description={t(
          "Uzamknutím obdobia zabránite zmenám v dokladoch, za ktoré už bolo podané priznanie.",
        )}
      />
      <PageBody>
        {chyba && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {chyba}
          </div>
        )}
        {sprava && (
          <div role="status" className="rounded-lg border border-primary/25 bg-[color:var(--stav-uspech-plocha)] px-3 py-2 text-sm text-[color:var(--stav-uspech-text)]">
            {sprava}
          </div>
        )}

        <div className="max-w-3xl space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-3">
              {zamknute ? (
                <Lock className="h-6 w-6 shrink-0 text-[color:var(--stav-uspech-text)]" />
              ) : (
                <Unlock className="h-6 w-6 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground">
                  {t("Súčasný stav")}
                </div>
                <div className="text-lg font-semibold tabular-nums">
                  {zamknute
                    ? t("Uzamknuté do {datum}", { datum: formatujDatum(zamknute) })
                    : t("Zatiaľ nie je uzamknuté nič")}
                </div>
              </div>
            </div>
            {zamknute && (
              <p className="mt-3 text-sm text-muted-foreground">
                {t("Doklady s dátumom {datum} a starším sa už nedajú zmeniť ani vymazať.", {
                  datum: formatujDatum(zamknute),
                })}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="mb-1 flex items-center gap-2 text-base font-semibold">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" /> {t("Čoho sa zámok týka")}
            </div>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">{t("Zamknuté:")}</strong>{" "}
                {t(
                  "dátumy, sumy, odberateľ, sadzby a položky vydaných aj prijatých faktúr, ich mazanie a celé záznamy v knihe jázd.",
                )}
              </li>
              <li>
                <strong className="text-foreground">{t("Naďalej možné:")}</strong>{" "}
                {t(
                  "označiť staršiu faktúru za uhradenú, odoslať ju, pridať poznámku alebo priradiť zákazku. Tieto veci sa dejú až po uzávierke a priznanie nemenia.",
                )}
              </li>
              <li>
                {t("Zákaz platí aj na presun nového dokladu")} <em>{t("uzavierka::do")}</em>{" "}
                {t("uzavretého obdobia.")}
              </li>
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              {t("Vo firme je {f} vydaných faktúr, {p} prijatých a {j} jázd.", {
                f: stav?.pocty?.faktury ?? 0,
                p: stav?.pocty?.prijate ?? 0,
                j: stav?.pocty?.jazdy ?? 0,
              })}
            </p>
          </div>

          {!admin ? (
            <ZamknutyStav nadpis="Uzávierku môže meniť len správca firmy." />
          ) : (
            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="mb-3 text-base font-semibold">{t("Uzamknúť do")}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => uloz(koniecPredoslehoMesiaca(dnes))}
                  className={tlacidlo}
                >
                  {t("Konca predošlého mesiaca ({datum})", {
                    datum: formatujDatum(koniecPredoslehoMesiaca(dnes)),
                  })}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => uloz(koniecPredoslehoStvrtroka(dnes))}
                  className={tlacidlo}
                >
                  {t("Konca predošlého štvrťroka ({datum})", {
                    datum: formatujDatum(koniecPredoslehoStvrtroka(dnes)),
                  })}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => uloz(koniecPredoslehoRoka(dnes))}
                  className={tlacidlo}
                >
                  {t("Konca predošlého roka ({datum})", {
                    datum: formatujDatum(koniecPredoslehoRoka(dnes)),
                  })}
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t("Vlastný dátum")}</span>
                  <input
                    type="date"
                    value={vlastny}
                    onChange={(e) => setVlastny(e.target.value)}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !vlastny}
                  onClick={() => uloz(vlastny)}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                >
                  {t("Uzamknúť")}
                </button>
              </div>

              {zamknute && (
                <div className="mt-6 border-t border-border pt-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => uloz(null)}
                    className="inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-destructive hover:underline disabled:opacity-50"
                  >
                    <Unlock className="h-4 w-4" /> {t("Zrušiť uzamknutie")}
                  </button>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(
                      "Odomknutie otvorí obdobie, za ktoré už mohlo byť podané priznanie. Použite ho len na opravu chyby, ktorú ešte stihnete nahlásiť.",
                    )}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
