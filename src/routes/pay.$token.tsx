import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPaymentLinkPublic, startPaymentPublic } from "@/lib/faktero/payments.functions";
import { CheckCircle2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/pay/$token")({
  head: () => ({ meta: [{ title: "Platba faktúry — Faktero" }] }),
  component: PayPage,
});

function fmt(amountCents: number, currency: string) {
  try { return new Intl.NumberFormat("sk-SK", { style: "currency", currency }).format(amountCents / 100); }
  catch { return `${(amountCents / 100).toFixed(2)} ${currency}`; }
}

function PayPage() {
  const { token } = Route.useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const fnGet = useServerFn(getPaymentLinkPublic);
  const fnStart = useServerFn(startPaymentPublic);

  useEffect(() => {
    fnGet({ data: { token } }).then(setData).catch((e) => setError(e?.message ?? "Chyba"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onPay() {
    setBusy(true); setError(null);
    try {
      const r = await fnStart({ data: { token, payerEmail: email || undefined } });
      if (r.gwUrl) window.location.href = r.gwUrl;
      else setError("GoPay nevrátil platobné URL.");
    } catch (e: any) { setError(e?.message ?? "Platbu sa nepodarilo spustiť."); }
    finally { setBusy(false); }
  }

  if (error && !data) return <PageWrap><Center><h1 className="text-xl font-semibold mb-2">Odkaz nie je dostupný</h1><p className="text-muted-foreground">{error}</p></Center></PageWrap>;
  if (!data) return <PageWrap><Center>Načítavam…</Center></PageWrap>;

  const paid = data.link.status === "paid" || data.invoice.status === "paid";

  return (
    <PageWrap>
      <div className="mx-auto max-w-md px-4 py-12">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="text-center space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Platba faktúry</p>
            <h1 className="text-xl font-semibold">{data.company.name}</h1>
            <p className="text-sm text-muted-foreground">Faktúra {data.invoice.number}</p>
          </div>
          <div className="my-6 text-center">
            <div className="text-3xl font-bold tracking-tight">{fmt(data.link.amountCents, data.link.currency)}</div>
            {data.invoice.dueDate && <p className="mt-1 text-xs text-muted-foreground">Splatnosť do {data.invoice.dueDate}</p>}
          </div>

          {paid ? (
            <div className="rounded-lg bg-emerald-50 text-emerald-900 p-4 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span className="text-sm font-medium">Faktúra je už uhradená. Ďakujeme!</span>
            </div>
          ) : (
            <>
              <label className="block text-sm">
                <span className="text-muted-foreground">Váš e-mail (voliteľné, pre potvrdenie)</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </label>
              <button onClick={onPay} disabled={busy}
                className="mt-4 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {busy ? "Otváram bránu…" : "Zaplatiť cez GoPay"}
              </button>
              {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
              {data.link.sandbox && <p className="mt-3 text-center text-xs text-amber-700">Testovací režim — žiadne skutočné peniaze sa neúčtujú.</p>}
            </>
          )}

          <div className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
            <span>Platba prebieha priamo cez GoPay. Peniaze idú na účet príjemcu — nie cez Faktero.</span>
          </div>
        </div>
      </div>
    </PageWrap>
  );
}

function PageWrap({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-gradient-to-b from-emerald-50/30 to-background">{children}</div>;
}
function Center({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-md px-4 py-20 text-center">{children}</div>;
}