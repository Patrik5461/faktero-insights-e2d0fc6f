import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { getMovementDetail } from "@/lib/faktero/stock.functions";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sklad/pohyby/$id")({
  head: () => ({ meta: [{ title: "Detail pohybu — Faktero" }] }),
  component: MovementDetail,
});

const TYPE_LABEL: Record<string, string> = {
  prijem: "Príjem", vydaj: "Výdaj", oprava: "Oprava",
  inventura: "Inventúra", faktura: "Faktúra", dobropis: "Dobropis",
};
const SHOW_STOCK_DEBUG = import.meta.env.DEV || (typeof window !== "undefined" && window.location.hostname.includes("lovable"));

function MovementDetail() {
  const { id } = Route.useParams();
  const fetchDetail = useServerFn(getMovementDetail);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) { setLoading(false); return; }
    fetchDetail({ data: { company_id: cid, movement_id: id } })
      .then((d) => { console.info("[sklad-debug:movement-detail:success]", { company_id: cid, movement_id: id, result: d }); setData(d); setError(null); })
      .catch((e) => { console.error("[sklad-debug:movement-detail:error]", { company_id: cid, movement_id: id, error: e }); setError(e?.message ?? String(e)); setData(null); })
      .finally(() => setLoading(false));
  }, [id, fetchDetail]);

  if (loading) return <PageBody><div className="text-sm text-muted-foreground">Načítavam…</div></PageBody>;
  if (!data?.movement) return <PageBody><div className="text-sm text-muted-foreground">Pohyb sa nenašiel.</div>{SHOW_STOCK_DEBUG && error && <pre className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</pre>}</PageBody>;

  const m = data.movement;
  return (
    <>
      <PageHeader title={`Pohyb ${TYPE_LABEL[m.type] ?? m.type}`} description={new Date(m.created_at).toLocaleString("sk-SK")} action={
        <Link to="/sklad/pohyby" className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
          <ArrowLeft className="h-4 w-4" /> Späť na pohyby
        </Link>
      } />
      <PageBody>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <dl className="grid gap-3 text-sm">
              <Pair label="Typ pohybu" value={TYPE_LABEL[m.type] ?? m.type} />
              <Pair label="Množstvo" value={`${Number(m.quantity) > 0 ? "+" : ""}${m.quantity}`} accent={Number(m.quantity) >= 0 ? "text-emerald-600" : "text-destructive"} />
              <Pair label="Jednotková cena" value={`${Number(m.unit_price).toFixed(4)} €`} />
              <Pair label="Celková hodnota" value={`${Number(m.total_value).toFixed(2)} €`} />
              <Pair label="Sklad" value={data.warehouse?.name ?? "—"} />
              <Pair label="Skladová karta" value={
                data.product ? (
                  <Link to="/sklad/produkty/$id" params={{ id: data.product.id }} className="text-primary hover:underline">{data.product.name}</Link>
                ) : (data.stockItem?.sku ?? "—")
              } />
            </dl>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <dl className="grid gap-3 text-sm">
              <Pair label="Vytvoril" value={data.createdByEmail ?? "—"} />
              <Pair label="Dátum vytvorenia" value={new Date(m.created_at).toLocaleString("sk-SK")} />
              <Pair label="Referencia" value={
                data.invoice ? (
                  <Link to="/faktury/$id" params={{ id: data.invoice.id }} className="text-primary hover:underline">Faktúra {data.invoice.invoice_number}</Link>
                ) : m.reference_type ?? "—"
              } />
              <Pair label="Poznámka" value={m.note ?? "—"} />
            </dl>
          </div>
        </div>
      </PageBody>
    </>
  );
}

function Pair({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (<div><dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt><dd className={`mt-0.5 ${accent ?? ""}`}>{value}</dd></div>);
}