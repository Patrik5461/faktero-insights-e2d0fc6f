import { createFileRoute, Link } from "@tanstack/react-router";
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
import { EmptyState } from "@/components/faktero/ListControls";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  navrhniParovanie,
  potvrdParovanie,
  sparujAutomaticky,
} from "@/lib/faktero/parovanie.functions";

export const Route = createFileRoute("/_authenticated/faktury/parovanie")({
  head: () => ({ meta: [{ title: "Párovanie platieb — Faktero" }] }),
  component: ParovaniePage,
});

function fmt(n: number, c = "EUR") {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: c }).format(n);
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
  const nacitaj = useServerFn(navrhniParovanie);
  const potvrd = useServerFn(potvrdParovanie);
  const automaticky = useServerFn(sparujAutomaticky);

  const [data, setData] = useState<{
    auto: Zhoda[];
    navrhy: Zhoda[];
    bezZhody: number;
    otvorenychFaktur: number;
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
      toast.error(e?.message ?? "Nepodarilo sa načítať platby.");
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
    if (pary.length === 0) return toast.info("Nie je vybraná žiadna platba.");
    setBusy(true);
    try {
      const r = (await potvrd({ data: { companyId: cid, pary } })) as any;
      if (r.zapisanych === 0) toast.error(r.preskocene?.[0] ?? "Nezapísalo sa nič.");
      else
        toast.success(
          `Zapísaných ${r.zapisanych} úhrad, uhradených faktúr: ${r.uhradenych}.` +
            (r.preskocene?.length ? ` Preskočené: ${r.preskocene.length}.` : ""),
        );
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? "Zápis zlyhal.");
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
          ? "Nič isté na spárovanie — pozrite návrhy nižšie."
          : `Spárovaných ${r.zapisanych} platieb, uhradených faktúr: ${r.uhradenych}.`,
      );
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? "Párovanie zlyhalo.");
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
        title="Párovanie platieb"
        description="Príchodzie platby z banky priradené k otvoreným faktúram."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/faktury"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
            >
              <ArrowLeft className="h-4 w-4" /> Späť na faktúry
            </Link>
            <button
              onClick={obnov}
              disabled={loading || busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Obnoviť
            </button>
            <button
              onClick={spustAutomat}
              disabled={busy || loading || (data?.auto.length ?? 0) === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Spárovať isté ({data?.auto.length ?? 0})
            </button>
          </div>
        }
      />
      <PageBody>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Hľadám platby k faktúram…
          </div>
        )}

        {!loading && data && (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-4">
              <Dlazdica label="Isté zhody" value={data.auto.length} zvyraznene />
              <Dlazdica label="Na rozhodnutie" value={data.navrhy.length} />
              <Dlazdica label="Bez zhody" value={data.bezZhody} />
              <Dlazdica label="Otvorené faktúry" value={data.otvorenychFaktur} />
            </div>

            {vsetky.length === 0 ? (
              <EmptyState
                icon={Landmark}
                title="Niet čo párovať"
                description={
                  data.otvorenychFaktur === 0
                    ? "Žiadna faktúra nečaká na úhradu."
                    : "K otvoreným faktúram sa nenašla žiadna zodpovedajúca platba. Skúste najprv stiahnuť nové pohyby v bankových účtoch."
                }
              />
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="w-10 px-3 py-2"></th>
                        <th className="px-3 py-2">Platba z banky</th>
                        <th className="px-3 py-2">Faktúra</th>
                        <th className="px-3 py-2">Prečo</th>
                        <th className="px-3 py-2 text-right">Zapíše sa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vsetky.map((z) => (
                        <tr key={z.transactionId} className="border-t border-border align-top">
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={vybrane.has(z.transactionId)}
                              onChange={() => prepni(z.transactionId)}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-medium">{z.transakcia?.counterparty ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">
                              {z.transakcia?.booking_date} · VS{" "}
                              {z.transakcia?.variable_symbol ?? "—"} ·{" "}
                              {fmt(z.transakcia?.amount ?? 0, z.transakcia?.currency)}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <Link
                              to="/faktury/$id"
                              params={{ id: z.invoiceId }}
                              className="font-medium text-primary hover:underline"
                            >
                              {z.faktura?.invoice_number}
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              {z.faktura?.customer_name ?? "—"} ·{" "}
                              {fmt(z.faktura?.total ?? 0, z.faktura?.currency)}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`mr-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                z.istota === "auto"
                                  ? "bg-emerald-500/10 text-emerald-700"
                                  : "bg-amber-500/10 text-amber-700"
                              }`}
                            >
                              {z.istota === "auto" ? "isté" : "na rozhodnutie"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {z.dovody.join(" · ")}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums font-medium">
                            {fmt(z.suma, z.transakcia?.currency)}
                            {z.ciastocna && (
                              <div className="text-xs font-normal text-amber-700">
                                faktúra ostane otvorená
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Zapísaná úhrada sa dá vrátiť v{" "}
                    <Link to="/bankove-ucty/transakcie" className="underline">
                      bankových transakciách
                    </Link>
                    .
                  </p>
                  <button
                    onClick={zapisVybrane}
                    disabled={busy || vybrane.size === 0}
                    className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Zapísať úhrady ({vybrane.size})
                  </button>
                </div>
              </>
            )}

            <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
              <HelpCircle className="h-3.5 w-3.5" />
              Ako párovanie rozhoduje a čo robiť s platbami bez variabilného symbolu, je v{" "}
              <a href="/pomoc/banka" target="_blank" className="underline">
                manuáli k banke
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
      className={`rounded-xl border p-4 ${zvyraznene && value > 0 ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-card"}`}
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
