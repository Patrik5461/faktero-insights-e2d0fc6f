import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getTransferDetail, completeTransfer, cancelTransfer } from "@/lib/faktero/stock.functions";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";
import { ArrowLeft, ArrowRightLeft, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sklad/presuny/$id")({
  head: () => ({ meta: [{ title: "Detail presunu — Faktero" }] }),
  component: TransferDetailPage,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Koncept",
  completed: "Dokončený",
  cancelled: "Zrušený",
};
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-muted text-muted-foreground",
};

function TransferDetailPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const fetchDetail = useServerFn(getTransferDetail);
  const complete = useServerFn(completeTransfer);
  const cancelFn = useServerFn(cancelTransfer);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchDetail({ data: { id } });
      setData(res);
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa načítať presun.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [id]);

  if (loading || !data) {
    return (
      <>
        <PageHeader title="Detail presunu" />
        <PageBody>
          <div className="rounded-md border p-6 text-sm text-muted-foreground">Načítavam…</div>
        </PageBody>
      </>
    );
  }

  const { transfer, items, stockItems, warehouses, companies, products } = data;
  const whMap: Record<string, any> = Object.fromEntries(
    (warehouses ?? []).map((w: any) => [w.id, w]),
  );
  const coMap: Record<string, any> = Object.fromEntries(
    (companies ?? []).map((c: any) => [c.id, c]),
  );
  const siMap: Record<string, any> = Object.fromEntries(
    (stockItems ?? []).map((s: any) => [s.id, s]),
  );
  const prodMap: Record<string, any> = Object.fromEntries(
    (products ?? []).map((p: any) => [p.id, p]),
  );

  const doComplete = async () => {
    if (!confirm("Naozaj dokončiť presun? Vytvoria sa skladové pohyby (výdaj + príjem).")) return;
    setBusy(true);
    try {
      await complete({ data: { id } });
      toast.success("Presun dokončený.");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Presun sa nepodarilo dokončiť.");
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    if (!confirm("Zrušiť presun?")) return;
    setBusy(true);
    try {
      await cancelFn({ data: { id } });
      toast.success("Presun zrušený.");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa zrušiť.");
    } finally {
      setBusy(false);
    }
  };

  const total = items.reduce(
    (s: number, i: any) => s + Number(i.quantity) * Number(i.unit_price),
    0,
  );

  return (
    <>
      <PageHeader
        title={`Presun ${transfer.id.slice(0, 8)}`}
        description={`Vytvorený ${new Date(transfer.created_at).toLocaleString("sk-SK")}`}
        action={
          <Link
            to="/sklad/presuny"
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Späť
          </Link>
        }
      />
      <PageBody>
        <div className="mx-auto max-w-4xl space-y-5">
          <div className="rounded-md border p-4">
            <div className="flex items-center justify-between">
              <span
                className={`inline-block rounded px-2 py-0.5 text-xs ${STATUS_STYLE[transfer.status] ?? ""}`}
              >
                {STATUS_LABEL[transfer.status] ?? transfer.status}
              </span>
              {transfer.status === "draft" && (
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    onClick={doCancel}
                    className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" /> Zrušiť
                  </button>
                  <button
                    disabled={busy}
                    onClick={doComplete}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Dokončiť presun
                  </button>
                </div>
              )}
            </div>
            <div className="mt-4 flex items-center gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Zo skladu</div>
                <div className="font-medium">{whMap[transfer.warehouse_from_id]?.name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {coMap[transfer.company_id]?.name ?? ""}
                </div>
              </div>
              <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Do</div>
                <div className="font-medium">
                  {transfer.warehouse_to_id ? (whMap[transfer.warehouse_to_id]?.name ?? "—") : "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {transfer.target_company_id
                    ? (coMap[transfer.target_company_id]?.name ?? "Iná firma")
                    : (coMap[transfer.company_id]?.name ?? "")}
                </div>
              </div>
            </div>
            {transfer.note && (
              <div className="mt-3 text-sm text-muted-foreground">{transfer.note}</div>
            )}
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2">Položka</th>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2 text-right">Množstvo</th>
                  <th className="px-3 py-2 text-right">Jedn. cena</th>
                  <th className="px-3 py-2 text-right">Spolu</th>
                  {transfer.target_company_id && <th className="px-3 py-2">Cieľ. položka</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((it: any) => {
                  const src = siMap[it.source_stock_item_id];
                  const tgt = it.target_stock_item_id ? siMap[it.target_stock_item_id] : null;
                  const name = src?.product_id ? prodMap[src.product_id]?.name : null;
                  return (
                    <tr key={it.id} className="border-t">
                      <td className="px-3 py-2">{name ?? "—"}</td>
                      <td className="px-3 py-2">{src?.sku ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{Number(it.quantity)}</td>
                      <td className="px-3 py-2 text-right">{Number(it.unit_price).toFixed(2)} €</td>
                      <td className="px-3 py-2 text-right">
                        {(Number(it.quantity) * Number(it.unit_price)).toFixed(2)} €
                      </td>
                      {transfer.target_company_id && (
                        <td className="px-3 py-2 text-muted-foreground">
                          {tgt
                            ? (tgt.sku ?? tgt.id.slice(0, 8))
                            : transfer.status === "draft"
                              ? "Bude priradená pri dokončení"
                              : "—"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 font-medium">
                  <td className="px-3 py-2" colSpan={4}>
                    Spolu
                  </td>
                  <td className="px-3 py-2 text-right">{total.toFixed(2)} €</td>
                  {transfer.target_company_id && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </PageBody>
    </>
  );
}
