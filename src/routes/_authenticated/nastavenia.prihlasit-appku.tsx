import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { stavParovaniaFn, vytvorParovanieFn } from "@/lib/faktero/parovanie-zariadenia.functions";
import { zostavaSekund } from "@/lib/faktero/parovanie-zariadenia";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

/**
 * Prihlásenie appky v telefóne QR kódom — bez písania hesla v telefóne.
 * Kód patrí prihlásenému človeku, platí dve minúty a dá sa použiť raz.
 * Nikoho nepridáva do firmy: appka uvidí presne to, čo tento účet na webe.
 */
export const Route = createFileRoute("/_authenticated/nastavenia/prihlasit-appku")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Prihlásiť appku v telefóne — Faktero") }],
  }),
  component: Stranka,
});

type Kod = { id: string; obrazok: string; platneDo: string };

function Stranka() {
  const { t } = useT();
  const vytvor = useServerFn(vytvorParovanieFn);
  const stav = useServerFn(stavParovaniaFn);
  const [kod, setKod] = useState<Kod | null>(null);
  const [zostava, setZostava] = useState(0);
  const [hotovo, setHotovo] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const aktualny = useRef<string | null>(null);

  const novyKod = useCallback(async () => {
    setBusy(true);
    setChyba(null);
    setHotovo(false);
    try {
      const r = await vytvor();
      const QRCode = (await import("qrcode")).default;
      const obrazok = await QRCode.toDataURL(r.kod, {
        margin: 1,
        width: 280,
        errorCorrectionLevel: "M",
      });
      aktualny.current = r.id;
      setKod({ id: r.id, obrazok, platneDo: r.platneDo });
      setZostava(zostavaSekund(r.platneDo));
    } catch (e: any) {
      setChyba(e?.message ?? t("Kód sa nepodarilo pripraviť."));
    } finally {
      setBusy(false);
    }
  }, [vytvor, t]);

  // Kód sa vyrába len pri otvorení stránky a na požiadanie — nie pri každom prekreslení.
  useEffect(() => {
    void novyKod();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Odpočet a doptávanie sa, či appka kód už použila.
  useEffect(() => {
    if (!kod || hotovo) return;
    const casovac = setInterval(() => setZostava(zostavaSekund(kod.platneDo)), 1000);
    const dopyt = setInterval(async () => {
      try {
        const r = await stav({ data: { id: kod.id } });
        if (aktualny.current !== kod.id) return;
        if (r.stav === "pouzite") setHotovo(true);
      } catch {
        /* ďalší pokus o chvíľu */
      }
    }, 2500);
    return () => {
      clearInterval(casovac);
      clearInterval(dopyt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kod, hotovo]);

  const vyprsal = Boolean(kod) && zostava <= 0 && !hotovo;

  return (
    <>
      <PageHeader
        title={t("Prihlásiť appku v telefóne")}
        description={t("Naskenujte kód appkou Faktero a prihlási sa bez hesla.")}
      />
      <PageBody>
        <div className="mx-auto grid max-w-2xl gap-6">
          <section className="rounded-xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-start gap-6">
              <div className="grid h-[280px] w-[280px] max-w-full shrink-0 place-items-center rounded-lg border border-border bg-white">
                {hotovo ? (
                  <div className="flex flex-col items-center gap-2 p-4 text-center text-emerald-700">
                    <CheckCircle2 className="h-12 w-12" />
                    <span className="text-sm font-medium">{t("Appka je prihlásená.")}</span>
                  </div>
                ) : busy || !kod ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : (
                  <img
                    src={kod.obrazok}
                    alt={t("QR kód na prihlásenie appky")}
                    className={`h-full w-full rounded-lg ${vyprsal ? "opacity-20 blur-sm" : ""}`}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-3 text-sm">
                <ol className="list-decimal space-y-1.5 pl-5">
                  <li>{t("Otvorte v telefóne appku Faktero.")}</li>
                  <li>
                    {t("Na prihlasovacej obrazovke ťuknite na Prihlásiť sa QR kódom z webu.")}
                  </li>
                  <li>{t("Namierte fotoaparát na kód vľavo.")}</li>
                </ol>
                {chyba ? (
                  <p className="text-destructive">{chyba}</p>
                ) : hotovo ? (
                  <p className="text-muted-foreground">
                    {t("Kód je použitý. Na ďalší telefón si zobrazte nový.")}
                  </p>
                ) : vyprsal ? (
                  <p className="text-muted-foreground">{t("Platnosť kódu vypršala.")}</p>
                ) : kod ? (
                  <p className="text-muted-foreground">
                    {t("Kód platí ešte {s} s a dá sa použiť len raz.", { s: zostava })}
                  </p>
                ) : null}
                {(vyprsal || hotovo || chyba) && (
                  <button
                    onClick={() => void novyKod()}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" /> {t("Zobraziť nový kód")}
                  </button>
                )}
              </div>
            </div>
          </section>
          <section className="flex gap-3 rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {t(
                "Kód prihlási telefón do vášho vlastného účtu — nikoho nepridáva do firmy. Neukazujte ho nikomu inému: kto ho naskenuje skôr, prihlási sa ako vy. Ak máte zapnuté dvojfaktorové overenie, appka si kód z overovacej appky vypýta aj tak.",
              )}
            </p>
          </section>
        </div>
      </PageBody>
    </>
  );
}
