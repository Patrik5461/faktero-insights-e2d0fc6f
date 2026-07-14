import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { getProductStockDetail } from "@/lib/faktero/stock.functions";
import { useStockPermissions } from "@/hooks/useStockPermissions";
import { ArrowLeft, Download, FileText, Package, Pencil, Warehouse } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sklad/produkty/$id")({
  head: () => ({ meta: [{ title: "Skladová karta — Faktero" }] }),
  component: ProductStockDetail,
});

const TYPE_LABEL: Record<string, string> = {
  prijem: "Príjem", vydaj: "Výdaj", oprava: "Oprava",
  inventura: "Inventúra", faktura: "Faktúra", dobropis: "Dobropis",
};

function ProductStockDetail() {
  const { id } = Route.useParams();
  const fetchDetail = useServerFn(getProductStockDetail);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { canMutate, canManage } = useStockPermissions();
  void nav;

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) { setLoading(false); return; }
    fetchDetail({ data: { company_id: cid, product_id: id } })
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id, fetchDetail]);

  function exportMovementsCsv() {
    if (!data?.movements) return;
    const headers = ["Dátum", "Typ", "Množstvo", "Jedn. cena", "Hodnota", "Poznámka"];
    const lines = [headers.join(";")];
    for (const m of data.movements) {
      lines.push([
        new Date(m.created_at).toLocaleString("sk-SK"),
        TYPE_LABEL[m.type] ?? m.type,
        String(m.quantity),
        Number(m.unit_price).toFixed(4),
        Number(m.total_value).toFixed(2),
        (m.note ?? "").replaceAll(";", ","),
      ].join(";"));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `pohyby-${data.product?.code ?? id}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  if (loading) return <PageBody><div className="text-sm text-muted-foreground">Načítavam…</div></PageBody>;
  if (!data?.product) return <PageBody><div className="text-sm text-muted-foreground">Produkt sa nenašiel.</div></PageBody>;

  const p = data.product;
  const si = data.stockItem;
  const stockValue = si ? data.totalQuantity * Number(si.purchase_price ?? 0) : 0;

  return (
    <>
      <PageHeader title={p.name} description={`SKU ${si?.sku ?? p.code ?? "—"}`} action={
        <div className="flex flex-wrap gap-2">
          <Link to="/sklad/produkty" className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
            <ArrowLeft className="h-4 w-4" /> Späť
          </Link>
          {canManage && (
            <Link to="/sklad/produkty/$id/upravit" params={{ id }} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Pencil className="h-4 w-4" /> Upraviť kartu
            </Link>
          )}
          <button onClick={exportMovementsCsv} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
            <Download className="h-4 w-4" /> Export pohybov CSV
          </button>
        </div>
      } />
      <PageBody>
        <div className="grid gap-4 md:grid-cols-3">
          <Stat label="Celkový stav" value={`${data.totalQuantity} ${si?.unit ?? ""}`} />
          <Stat label="Rezervované" value={`${data.reservedQuantity} ${si?.unit ?? ""}`} />
          <Stat label="Hodnota skladu" value={`${stockValue.toFixed(2)} €`} />
          <Stat label="Minimálny stav" value={si ? `${Number(si.min_stock).toFixed(2)} ${si.unit}` : "—"} />
          <Stat label="Nákupná cena" value={si ? `${Number(si.purchase_price).toFixed(2)} €` : "—"} />
          <Stat label="Predajná cena" value={si ? `${Number(si.sale_price).toFixed(2)} €` : "—"} />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Fotografia</div>
            {data.photoSignedUrl ? (
              <img src={data.photoSignedUrl} alt={p.name} className="aspect-square w-full rounded-md object-cover" />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                Bez fotografie
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4 text-primary" /> Detaily produktu</div>
            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <Pair label="Názov (SK)" value={p.name} />
              <Pair label="Názov (EN)" value={si?.name_en ?? "—"} />
              <Pair label="Kód" value={p.code ?? "—"} />
              <Pair label="SKU" value={si?.sku ?? "—"} />
              <Pair label="Čiarový kód / EAN" value={si?.barcode ?? "—"} />
              <Pair label="Jednotka" value={si?.unit ?? p.unit} />
              <Pair label="DPH %" value={`${si?.vat_rate ?? p.vat_rate}`} />
              <Pair label="Kategória" value={data.category?.name ?? "—"} />
              <Pair label="Dodávateľ" value={data.supplier?.name ?? "—"} />
              <Pair label="Lokácia (regál/pozícia)" value={si?.location ?? "—"} />
              <Pair label="Sledovať zásoby" value={si?.track_stock ? "Áno" : "Nie"} />
            </dl>
            {(si?.description || p.description) && (
              <div className="mt-3 border-t border-border pt-3 text-sm">
                <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Popis</div>
                <p className="whitespace-pre-wrap text-muted-foreground">{si?.description ?? p.description}</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Warehouse className="h-4 w-4 text-primary" /> Stav v skladoch</div>
          {data.levels.length === 0 ? (
            <div className="text-sm text-muted-foreground">Žiadne zaznamenané stavy.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="p-2">Sklad</th><th className="p-2 text-right">Množstvo</th><th className="p-2 text-right">Rezervované</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.levels.map((l: any) => (
                  <tr key={l.warehouse_id}>
                    <td className="p-2">{l.warehouses?.name ?? l.warehouse_id.slice(0, 8)}</td>
                    <td className="p-2 text-right tabular-nums">{Number(l.quantity).toFixed(2)}</td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">{Number(l.reserved_quantity ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {canMutate && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/sklad/prijem" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Príjem</Link>
            <Link to="/sklad/vydaj" className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary">Výdaj</Link>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-primary" /> Posledných 20 pohybov</div>
          {data.movements.length === 0 ? (
            <div className="text-sm text-muted-foreground">Žiadne pohyby.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="p-2">Dátum</th><th className="p-2">Typ</th><th className="p-2 text-right">Množstvo</th><th className="p-2 text-right">Hodnota</th><th className="p-2"></th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.movements.map((m: any) => (
                  <tr key={m.id}>
                    <td className="p-2 text-muted-foreground">{new Date(m.created_at).toLocaleString("sk-SK")}</td>
                    <td className="p-2">{TYPE_LABEL[m.type] ?? m.type}</td>
                    <td className={`p-2 text-right tabular-nums ${Number(m.quantity) >= 0 ? "text-emerald-600" : "text-destructive"}`}>{Number(m.quantity) > 0 ? "+" : ""}{m.quantity}</td>
                    <td className="p-2 text-right tabular-nums">{Number(m.total_value).toFixed(2)} €</td>
                    <td className="p-2 text-right"><Link to="/sklad/pohyby/$id" params={{ id: m.id }} className="text-xs text-primary hover:underline">Detail</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {data.invoiceRefs.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">Súvisiace faktúry</div>
            <ul className="divide-y divide-border text-sm">
              {data.invoiceRefs.map((inv: any) => (
                <li key={inv.id} className="flex items-center justify-between py-2">
                  <Link to="/faktury/$id" params={{ id: inv.id }} className="text-primary hover:underline">{inv.invoice_number}</Link>
                  <span className="text-xs text-muted-foreground">{inv.status} · {Number(inv.total ?? 0).toFixed(2)} €</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PageBody>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
function Pair({ label, value }: { label: string; value: string }) {
  return (<div><dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-0.5">{value}</dd></div>);
}