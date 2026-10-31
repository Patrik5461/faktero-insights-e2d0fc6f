import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Download, Loader2, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageBody, PageHeader } from "./AppShell";
import { NahladPdf } from "./NahladPdf";
import { PolozkyK, type PolozkaK } from "./DetailDokladuKompaktny";
import { useT } from "@/lib/i18n/useT";
import { PrepinacStranyNahladu, RozlozenieSNahladom } from "./RozlozenieSNahladom";

/**
 * Náhľad dokladu s nástrojmi (otáčanie, priblíženie, stiahnutie) — tvarom
 * ako v Nespracovaných dokladoch. PDF kreslí `NahladPdf`, obrázok `<img>`.
 */
export function NahladDokladuNastroje({
  url,
  mime,
  nazov,
  akcie,
}: {
  url: string | null;
  mime: string | null;
  nazov?: string | null;
  akcie?: ReactNode;
}) {
  const { t } = useT();
  const [otocenie, setOtocenie] = useState(0);
  const [zvacsenie, setZvacsenie] = useState(1);
  const pdf = String(mime ?? "").includes("pdf") || /\.pdf(\?|$)/i.test(String(url ?? ""));
  const nastroje = [
    { ikona: RotateCcw, popis: "Otočiť doľava", akcia: () => setOtocenie((o) => o - 90) },
    { ikona: RotateCw, popis: "Otočiť doprava", akcia: () => setOtocenie((o) => o + 90) },
    { ikona: ZoomIn, popis: "Priblížiť", akcia: () => setZvacsenie((z) => Math.min(3, z + 0.25)) },
    {
      ikona: ZoomOut,
      popis: "Oddialiť",
      akcia: () => setZvacsenie((z) => Math.max(0.5, z - 0.25)),
    },
  ];
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary-hover">
          {t("Náhľad")}
        </span>
        <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
          {nastroje.map(({ ikona: I, popis, akcia }) => (
            <button
              key={popis}
              type="button"
              title={t(popis)}
              aria-label={t(popis)}
              onClick={akcia}
              className="rounded-md p-2 hover:bg-secondary"
            >
              <I className="h-4 w-4" />
            </button>
          ))}
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              title={t("Stiahnuť")}
              aria-label={t("Stiahnuť")}
              className="rounded-md p-2 hover:bg-secondary"
            >
              <Download className="h-4 w-4" />
            </a>
          ) : null}
          {akcie}
          <PrepinacStranyNahladu className="p-2" />
        </div>
      </div>
      <div className="overflow-auto p-4 lg:max-h-[calc(100vh-11rem)]">
        {url ? (
          <div
            style={{
              transform: `rotate(${otocenie}deg) scale(${zvacsenie})`,
              transformOrigin: "top center",
            }}
            className="transition-transform"
          >
            {pdf ? (
              <NahladPdf url={url} />
            ) : (
              <img src={url} alt={nazov ?? t("Doklad")} className="mx-auto max-w-full rounded-md" />
            )}
          </div>
        ) : (
          <p className="p-6 text-sm text-muted-foreground">{t("Doklad nemá súbor.")}</p>
        )}
      </div>
    </div>
  );
}

function SekciaK({ nadpis, ok, children }: { nadpis: string; ok?: boolean; children: ReactNode }) {
  const { t } = useT();
  return (
    <section className="border-b border-border px-4 py-4 last:border-b-0">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium">{t(nadpis)}</h2>
        {ok ? <Check className="h-5 w-5 text-primary" aria-label={t("Sedí")} /> : null}
      </div>
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 [&>*]:min-w-0">{children}</div>
    </section>
  );
}

/**
 * Úprava prijatej faktúry v kompaktnom rozložení — ako Nespracované doklady:
 * vľavo náhľad dokladu, vpravo panel s tými istými poľami ako klasická úprava
 * a dole stále tlačidlá „Vytvoriť pravidlo“ a „Uložiť“.
 */
export function PrijataUpravaKompaktna({
  titulok,
  priloha,
  onSubmit,
  busy,
  sumaSedi,
  ibanOk,
  pravidlo,
  zakladne,
  sumy,
  dodavatel,
  platba,
  poznamka,
  polozky,
  mena,
}: {
  titulok: string;
  priloha: { cesta: string; mime: string | null } | null;
  onSubmit: (e: FormEvent) => void;
  busy: boolean;
  sumaSedi: boolean;
  ibanOk: boolean;
  pravidlo?: ReactNode;
  zakladne: ReactNode;
  sumy: ReactNode;
  dodavatel: ReactNode;
  platba: ReactNode;
  poznamka: ReactNode;
  polozky: PolozkaK[];
  mena: string;
}) {
  const { t } = useT();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let zrusene = false;
    if (!priloha?.cesta) {
      setUrl(null);
      return;
    }
    supabase.storage
      .from("purchase-invoices")
      .createSignedUrl(priloha.cesta, 600)
      .then(({ data }) => {
        if (!zrusene) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      zrusene = true;
    };
  }, [priloha?.cesta]);

  return (
    <>
      <PageHeader title={titulok} />
      <PageBody>
        <RozlozenieSNahladom
          className="grid gap-4"
          stlpceVlavo="lg:grid-cols-[minmax(0,1fr)_440px]"
          stlpceVpravo="lg:grid-cols-[440px_minmax(0,1fr)]"
          nahlad={<NahladDokladuNastroje url={url} mime={priloha?.mime ?? null} />}
        >
          <form
            onSubmit={onSubmit}
            className="@container flex min-w-0 flex-col rounded-2xl border border-border bg-card lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]"
          >
            <div className="min-h-0 flex-1 overflow-auto">
              <SekciaK nadpis="Základné údaje">{zakladne}</SekciaK>
              <SekciaK nadpis="Čiastka a DPH" ok={sumaSedi}>
                {sumy}
              </SekciaK>
              <SekciaK nadpis="Dodávateľ">{dodavatel}</SekciaK>
              <SekciaK nadpis="Platobné údaje" ok={ibanOk}>
                {platba}
              </SekciaK>
              <SekciaK nadpis="Poznámka">{poznamka}</SekciaK>
              {polozky.length ? (
                <div className="p-3">
                  <PolozkyK polozky={polozky} mena={mena} />
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border p-4">
              {pravidlo}
              <Link
                to="/prijate-faktury"
                className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm hover:bg-secondary"
              >
                {t("Zrušiť")}
              </Link>
              <button
                type="submit"
                disabled={busy}
                className="ml-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t("Uložiť")}
              </button>
            </div>
          </form>
        </RozlozenieSNahladom>
      </PageBody>
    </>
  );
}
