import { createFileRoute, Link } from "@tanstack/react-router";
import { KlikatelnyRiadok } from "@/components/faktero/KlikatelnyRiadok";
import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { StavOdznak } from "@/components/faktero/web/Stav";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Landmark,
  Loader2,
  CheckCircle2,
  Wand2,
  RefreshCw,
  HelpCircle,
} from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { EmptyState } from "@/components/faktero/ListControls";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  navrhniParovanie,
  potvrdParovanie,
  sparujAutomaticky,
} from "@/lib/faktero/parovanie.functions";
import { formatovacMeny } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { potvrd as potvrdOkno } from "@/lib/potvrdenie";
import { navrhyVoVybere } from "@/lib/faktero/akcie-faktury";

export const Route = createFileRoute("/_authenticated/faktury/parovanie")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Párovanie platieb — Faktero") }] }),
  component: ParovaniePage,
});

function fmt(n: number, c = "EUR") {
  return formatovacMeny(c, "sk-SK")(n);
}

type Zhoda = {
  transactionId: string;
  invoiceId: string;
  suma: number;
  skore: number;
  istota: "auto" | "navrh";
  dovody: string[];
  ciastocna: boolean;
  transakcia?: {
    booking_date: string;
    amount: number;
    currency: string;
    variable_symbol: string | null;
    counterparty: string | null;
    description: string | null;
  };
  faktura?: {
    invoice_number: string;
    total: number;
    currency: string;
    customer_name: string | null;
    issue_date: string;
    due_date: string | null;
  };
};

function ParovaniePage() {
  const { t } = useT();
  const nacitaj = useServerFn(navrhniParovanie);
  const potvrd = useServerFn(potvrdParovanie);
  const automaticky = useServerFn(sparujAutomaticky);

  const [data, setData] = useState<{
    auto: Zhoda[];
    navrhy: Zhoda[];
    bezZhody: number;
    otvorenychFaktur: number;
    orezane?: boolean;
    stropPlatieb?: number;
    dniDozadu?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [vybrane, setVybrane] = useState<Set<string>>(new Set());

  async function obnov() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setLoading(true);
    try {
      const d = (await nacitaj({ data: { companyId: cid } })) as any;
      setData(d);
      // Isté zhody sú predvolene zaškrtnuté, návrhy nie — tie má človek prejsť.
      setVybrane(new Set(d.auto.map((z: Zhoda) => z.transactionId)));
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa načítať platby."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    obnov();
  }, []);

  const vsetky = [...(data?.auto ?? []), ...(data?.navrhy ?? [])];

  async function zapisVybrane() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const pary = vsetky
      .filter((z) => vybrane.has(z.transactionId))
      .map((z) => ({ transactionId: z.transactionId, invoiceId: z.invoiceId, suma: z.suma }));
    if (pary.length === 0) return toast.info(t("Nie je vybraná žiadna platba."));
    // Návrhy nie sú isté zhody — zápis úhrady sa nedá vziať späť jedným klikom.
    const naRozhodnutie = navrhyVoVybere(
      pary.map((p) => p.transactionId),
      data?.navrhy ?? [],
    );
    if (
      naRozhodnutie > 0 &&
      !(await potvrdOkno(
        t("Zapísať {n} úhrad, z toho {m} na rozhodnutie (nie istá zhoda)?", {
          n: pary.length,
          m: naRozhodnutie,
        }),
        { potvrdit: t("Zapísať úhrady"), nebezpecne: false },
      ))
    )
      return;
    setBusy(true);
    try {
      const r = (await potvrd({ data: { companyId: cid, pary } })) as any;
      if (r.zapisanych === 0) toast.error(r.preskocene?.[0] ? t(r.preskocene[0]) : t("Nezapísalo sa nič."));
      else
        toast.success(
          t("Zapísaných {n} úhrad, uhradených faktúr: {m}.", { n: r.zapisanych, m: r.uhradenych }) +
            (r.preskocene?.length ? " " + t("Preskočené: {n}.", { n: r.preskocene.length }) : ""),
        );
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? t("Zápis zlyhal."));
    } finally {
      setBusy(false);
    }
  }

  async function spustAutomat() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setBusy(true);
    try {
      const r = (await automaticky({ data: { companyId: cid } })) as any;
      toast.success(
        r.zapisanych === 0
          ? t("Nič isté na spárovanie — pozrite návrhy nižšie.")
          : t("Spárovaných {n} platieb, uhradených faktúr: {m}.", { n: r.zapisanych, m: r.uhradenych }),
      );
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? t("Párovanie zlyhalo."));
    } finally {
      setBusy(false);
    }
  }

  function prepni(id: string) {
    setVybrane((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  return (
    <>
      <PageHeader
        title={t("Párovanie platieb")}
        description={t("Príchodzie platby z banky priradené k otvoreným faktúram.")}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/faktury"
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-background px-3 text-sm font-semibold hover:bg-accent"
            >
              <ArrowLeft className="h-4 w-4" /> {t("Späť na faktúry")}
            </Link>
            <button
              onClick={obnov}
              disabled={loading || busy}
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-background px-3 text-sm font-semibold hover:bg-accent disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> {t("nacitat::Obnoviť")}
            </button>
            <button
              onClick={spustAutomat}
              disabled={busy || loading || (data?.auto.length ?? 0) === 0}
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {t("Spárovať isté ({n})", { n: data?.auto.length ?? 0 })}
            </button>
          </div>
        }
      />
      <PageBody>
        {loading && (
          <NacitavanieStav
            text="Hľadám platby k faktúram…"
            className="rounded-xl border border-border bg-card"
          />
        )}

        {!loading && data && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Dlazdica label={t("Isté zhody")} value={data.auto.length} zvyraznene />
              <Dlazdica label={t("Na rozhodnutie")} value={data.navrhy.length} />
              <Dlazdica label={t("Bez zhody")} value={data.bezZhody} />
              <Dlazdica label={t("Otvorené faktúry")} value={data.otvorenychFaktur} />
            </div>

            {/* Odrezaný zoznam vyzeral ako celý. Pri tisíckach pohybov to
                znamenalo, že staršie platby nikto nikdy neuvidel. */}
            {data.orezane && (
              <div className="fk-oznam fk-oznam-pozor mb-4 rounded-md p-3 text-sm">
                {t("Platieb je viac, než sa dá spracovať naraz. Načítaných je {n} najnovších za posledných {dni} dní. Spárujte ich a zvyšok sa načíta po obnovení stránky.", { n: data.stropPlatieb ?? 2000, dni: data.dniDozadu ?? 400 })}
              </div>
            )}

            {vsetky.length === 0 ? (
              <EmptyState
                icon={Landmark}
                title={t("Niet čo párovať")}
                description={
                  data.otvorenychFaktur === 0
                    ? t("Žiadna faktúra nečaká na úhradu.")
                    : t("K otvoreným faktúram sa nenašla žiadna zodpovedajúca platba. Skúste najprv stiahnuť nové pohyby v bankových účtoch.")
                }
              />
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                  <table className="w-full text-sm">
                    <thead className="whitespace-nowrap bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
                      <tr>
                        <th className="w-10 px-3 py-2"><span className="sr-only">{t("Výber")}</span></th>
                        <th className="whitespace-nowrap px-3 py-2">{t("Platba z banky")}</th>
                        <th className="whitespace-nowrap px-3 py-2">{t("Faktúra")}</th>
                        <th className="whitespace-nowrap px-3 py-2">{t("Prečo")}</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right">{t("Zapíše sa")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vsetky.map((z) => (
                        /* Zoznam slúži na výber: klik na riadok ho označí/odznačí, faktúru otvára odkaz na čísle. */
                        <KlikatelnyRiadok
                          key={z.transactionId}
                          naKlik={() => prepni(z.transactionId)}
                          klavesnica={false}
                          className="border-t border-border align-top"
                        >
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              aria-label={t("Vybrať riadok")}
                              checked={vybrane.has(z.transactionId)}
                              onChange={() => prepni(z.transactionId)}
                              className="h-4 w-4 cursor-pointer accent-primary"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-semibold">{z.transakcia?.counterparty ?? "—"}</div>
                            <div className="text-xs tabular-nums text-muted-foreground">
                              <span className="whitespace-nowrap">{datumNaDoklade(z.transakcia?.booking_date)}</span> · VS{" "}
                              {z.transakcia?.variable_symbol ?? "—"} ·{" "}
                              <span className="suma whitespace-nowrap">{fmt(z.transakcia?.amount ?? 0, z.transakcia?.currency)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <Link
                              to="/faktury/$id"
                              params={{ id: z.invoiceId }}
                              className="cislo-dokladu whitespace-nowrap font-medium text-primary hover:underline"
                            >
                              {z.faktura?.invoice_number}
                            </Link>
                            <div className="text-xs tabular-nums text-muted-foreground">
                              {z.faktura?.customer_name ?? "—"} ·{" "}
                              <span className="suma whitespace-nowrap">{fmt(z.faktura?.total ?? 0, z.faktura?.currency)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <StavOdznak
                              ton={z.istota === "auto" ? "uspech" : "pozor"}
                              maly
                              className="mb-1 mr-2"
                            >
                              {z.istota === "auto" ? t("isté") : t("na rozhodnutie")}
                            </StavOdznak>
                            <span className="text-xs text-muted-foreground">
                              {z.dovody.map((d) => t(d)).join(" · ")}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-medium">
                            <span className="suma">{fmt(z.suma, z.transakcia?.currency)}</span>
                            {z.ciastocna && (
                              <div className="fk-text-pozor text-xs font-normal">
                                {t("faktúra ostane otvorená")}
                              </div>
                            )}
                          </td>
                        </KlikatelnyRiadok>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {t("Zapísaná úhrada sa dá vrátiť v")}{" "}
                    <Link to="/bankove-ucty/transakcie" className="font-semibold text-primary underline">
                      {t("bankových transakciách")}
                    </Link>
                    .
                  </p>
                  <button
                    onClick={zapisVybrane}
                    disabled={busy || vybrane.size === 0}
                    className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    {t("Zapísať úhrady ({n})", { n: vybrane.size })}
                  </button>
                </div>
              </>
            )}

            {/* Obyčajný odsek, nie flex — flex by text a odkaz rozdelil do stĺpcov a „.“ odtrhol. */}
            <p className="mt-6 text-xs text-muted-foreground">
              <HelpCircle className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
              {t("Ako párovanie rozhoduje a čo robiť s platbami bez variabilného symbolu, je v")}{" "}
              <a href="/pomoc/banka" target="_blank" className="font-semibold text-primary underline">
                {t("manuáli k banke")}
              </a>
              .
            </p>
          </>
        )}
      </PageBody>
    </>
  );
}

function Dlazdica({
  label,
  value,
  zvyraznene,
}: {
  label: string;
  value: number;
  zvyraznene?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 sm:p-5 ${zvyraznene && value > 0 ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="suma mt-1 text-2xl">{value}</div>
    </div>
  );
}
