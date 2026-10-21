import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { vynutSvetlyMotiv } from "@/lib/faktero/motiv";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { Logo } from "@/components/faktero/Logo";
import { AktivaciaEfakturyKroky } from "@/components/faktero/AktivaciaEfakturyKroky";
import {
  aktivaciaPodlaTokenuFn,
  oznacAktivaciuHotovuFn,
} from "@/lib/faktero/efaktura-oznam.functions";

/**
 * Stránka pre účtovníka, ktorého firma pozvala dokončiť aktiváciu eFaktúry.
 *
 * Bez prihlásenia — chráni ju len náhodný token v odkaze, preto ukazuje iba to,
 * čo účtovník na Portáli FS aj tak potrebuje: názov, IČO, DIČ a adresu firmy.
 * „Hotovo" je len informácia pre firmu; skutočnú aktiváciu Faktero zistí samo,
 * keď Finančná správa pošle údaje (webhook /api/public/efaktura/pds).
 */
export const Route = createFileRoute("/aktivacia-efaktury/$token")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Aktivácia e-fakturácie — Faktero") },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AktivaciaStranka,
});

type Data = Awaited<ReturnType<typeof aktivaciaPodlaTokenuFn>>;

function AktivaciaStranka() {
  const { t } = useT();
  const { token } = Route.useParams();
  const nacitaj = useServerFn(aktivaciaPodlaTokenuFn);
  const hotovo = useServerFn(oznacAktivaciuHotovuFn);
  const [data, setData] = useState<Data | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [posielam, setPosielam] = useState(false);
  const [oznamene, setOznamene] = useState(false);

  useEffect(() => vynutSvetlyMotiv(), []);
  useEffect(() => {
    nacitaj({ data: { token } })
      .then(setData)
      .catch((e: any) => setChyba(e?.message ?? t("Stránku sa nepodarilo načítať.")));
  }, [nacitaj, token]);

  async function oznac() {
    setPosielam(true);
    try {
      await hotovo({ data: { token } });
      setOznamene(true);
    } catch (e: any) {
      setChyba(e?.message ?? t("Nepodarilo sa zapísať."));
    } finally {
      setPosielam(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-page px-4 py-8 sm:py-12"
      style={{ paddingTop: "max(2rem, env(safe-area-inset-top))" }}
    >
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          {!data && !chyba && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("Načítavam…")}
            </div>
          )}
          {chyba && !data && <p className="text-sm text-destructive">{chyba}</p>}
          {data && !data.platna && (
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <h1 className="text-lg font-semibold">{t("Odkaz už neplatí")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {data.dovod === "vyprsala"
                    ? t("Platnosť pozvánky vypršala. Požiadajte firmu o novú.")
                    : t("Pozvánka bola zrušená alebo neexistuje. Požiadajte firmu o novú.")}
                </p>
              </div>
            </div>
          )}
          {data && data.platna && (
            <>
              <h1 className="text-xl font-semibold sm:text-2xl">
                {t("Aktivácia e-fakturácie pre {firma}", { firma: data.firma.nazov })}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(
                  "Firma vás žiada, aby ste za ňu na Portáli finančnej správy vybrali Faktero ako poskytovateľa doručovacej služby pre eFaktúry. Od 1. 1. 2027 je e-fakturácia povinná.",
                )}
              </p>

              {data.aktivovana ? (
                <div className="mt-6 flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span>
                    {t(
                      "eFaktúra je pre túto firmu už aktivovaná. Netreba robiť nič ďalšie — ďakujeme.",
                    )}
                  </span>
                </div>
              ) : (
                <>
                  <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
                    {data.firma.ico && (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("IČO")}</dt>
                        <dd className="font-mono">{data.firma.ico}</dd>
                      </div>
                    )}
                    {data.firma.icDph && (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("IČ DPH")}</dt>
                        <dd className="font-mono">{data.firma.icDph}</dd>
                      </div>
                    )}
                    {data.firma.adresa && (
                      <div className="sm:col-span-2">
                        <dt className="text-xs text-muted-foreground">{t("Adresa")}</dt>
                        <dd>{data.firma.adresa}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="mt-6">
                    <AktivaciaEfakturyKroky
                      dic={data.firma.dic}
                      nazovFirmy={data.firma.nazov}
                      preUctovnika
                    />
                  </div>
                  <div className="mt-8 border-t border-border pt-6">
                    {oznamene || data.hotovoAt ? (
                      <p className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        {t(
                          "Ďakujeme, firme sme dali vedieť. Keď Finančná správa výber potvrdí, eFaktúra sa jej vo Fakteri zapne sama.",
                        )}
                      </p>
                    ) : (
                      <>
                        <p className="mb-3 text-sm text-muted-foreground">
                          {t("Keď Faktero na portáli vyberiete, dajte firme vedieť:")}
                        </p>
                        <button
                          type="button"
                          onClick={oznac}
                          disabled={posielam}
                          className="inline-flex h-10 items-center gap-2 rounded-md border border-primary bg-background px-4 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-60"
                        >
                          {posielam ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          {t("Hotovo, vybral som Faktero")}
                        </button>
                      </>
                    )}
                    {chyba && <p className="mt-2 text-sm text-destructive">{chyba}</p>}
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t("Faktero — fakturácia a eFaktúra v jednom")} ·{" "}
          <a href="/pomoc/efaktura" className="underline underline-offset-2">
            {t("Návod k eFaktúre")}
          </a>
        </p>
      </div>
    </div>
  );
}
