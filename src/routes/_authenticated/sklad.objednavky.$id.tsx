import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listWarehousesForCompany } from "@/lib/faktero/stock.functions";
import {
  cancelPurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrder,
  receivePurchaseOrder,
  sendPurchaseOrder,
} from "@/lib/faktero/purchase-orders.functions";
import { STAV_POPIS, type StavObjednavky } from "@/lib/faktero/objednavky-dodavatel";
import { ArrowLeft, PackageCheck, Send, Trash2, X } from "lucide-react";
import { formatovacMeny } from "@/lib/faktero/mena";

export const Route = createFileRoute("/_authenticated/sklad/objednavky/$id")({
  head: () => ({ meta: [{ title: "Objednávka — Faktero" }] }),
  component: PurchaseOrderDetail,
});

function suma(n: number, mena = "EUR") {
  return formatovacMeny(mena, "sk-SK")(n || 0);
}

function PurchaseOrderDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const fetchOrder = useServerFn(getPurchaseOrder);
  const fetchWarehouses = useServerFn(listWarehousesForCompany);
  const doSend = useServerFn(sendPurchaseOrder);
  const doCancel = useServerFn(cancelPurchaseOrder);
  const doDelete = useServerFn(deletePurchaseOrder);
  const doReceive = useServerFn(receivePurchaseOrder);

  const [data, setData] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sprava, setSprava] = useState<string | null>(null);
  const [prijemSklad, setPrijemSklad] = useState("");
  const [prijem, setPrijem] = useState<Record<string, number>>({});

  const cid = useMemo(() => getActiveCompanyId(), []);

  const nacitaj = useCallback(() => {
    if (!cid) {
      setLoading(false);
      return;
    }
    return fetchOrder({ data: { company_id: cid, id } })
      .then((d: any) => {
        setData(d);
        setPrijemSklad((s) => s || d?.order?.warehouse_id || "");
        // Predvyplní sa to, čo ešte neprišlo — najčastejší prípad je, že dorazí
        // celý zvyšok objednávky.
        const predvolba: Record<string, number> = {};
        (d?.items ?? []).forEach((it: any) => {
          if (it.zostava > 0) predvolba[it.id] = it.zostava;
        });
        setPrijem(predvolba);
      })
      .finally(() => setLoading(false));
  }, [cid, id, fetchOrder]);

  useEffect(() => {
    nacitaj();
    if (cid)
      fetchWarehouses({ data: { company_id: cid } }).then((w: any) => setWarehouses(w ?? []));
  }, [nacitaj, cid, fetchWarehouses]);

  async function akcia(fn: () => Promise<any>, hlaska?: string) {
    setBusy(true);
    setError(null);
    setSprava(null);
    try {
      await fn();
      if (hlaska) setSprava(hlaska);
      await nacitaj();
    } catch (e: any) {
      setError(e?.message ?? "Akcia zlyhala");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <PageBody>
        <div className="text-sm text-muted-foreground">Načítavam…</div>
      </PageBody>
    );
  }
  if (!data) {
    return (
      <PageBody>
        <div className="text-sm text-muted-foreground">Objednávka sa nenašla.</div>
      </PageBody>
    );
  }

  const o = data.order;
  const stav = o.status as StavObjednavky;
  const otvorena = stav === "sent" || stav === "partially_received";
  const riadkyNaPrijem = (data.items ?? []).filter((it: any) => it.zostava > 0);

  return (
    <>
      <PageHeader
        title={`Objednávka ${o.order_number}`}
        description={`${o.supplier_name ?? "Bez dodávateľa"} · ${STAV_POPIS[stav] ?? stav}`}
        action={
          <Link
            to="/sklad/objednavky"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" /> Späť
          </Link>
        }
      />
      <PageBody>
        <div className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {sprava && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
              {sprava}
            </div>
          )}

          <div className="grid gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-4">
            <div>
              <div className="text-xs text-muted-foreground">Vystavená</div>
              <div>{o.order_date}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Očakávané dodanie</div>
              <div>{o.expected_date ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Sklad</div>
              <div>{data.warehouse?.name ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Spolu</div>
              <div className="font-semibold">{suma(data.total, o.currency)}</div>
            </div>
            {data.job && (
              <div className="sm:col-span-4">
                <div className="text-xs text-muted-foreground">Zákazka</div>
                <Link
                  to="/zakazky/$id"
                  params={{ id: data.job.id }}
                  className="text-primary hover:underline"
                >
                  {data.job.job_number} — {data.job.name}
                </Link>
              </div>
            )}
            {o.note && (
              <div className="sm:col-span-4">
                <div className="text-xs text-muted-foreground">Poznámka</div>
                <div>{o.note}</div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {stav === "draft" && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    akcia(
                      () => doSend({ data: { company_id: cid!, id } }),
                      "Objednávka je odoslaná — od teraz sa počíta ako tovar na ceste.",
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" /> Označiť ako odoslanú
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    akcia(async () => {
                      await doDelete({ data: { company_id: cid!, id } });
                      nav({ to: "/sklad/objednavky" });
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" /> Zmazať
                </button>
              </>
            )}
            {otvorena && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  akcia(
                    () => doCancel({ data: { company_id: cid!, id } }),
                    "Objednávka je zrušená.",
                  )
                }
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
              >
                <X className="h-4 w-4" /> Zrušiť objednávku
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Položka</th>
                  <th className="p-3 text-right">Objednané</th>
                  <th className="p-3 text-right">Prijaté</th>
                  <th className="p-3 text-right">Zostáva</th>
                  <th className="p-3 text-right">Cena / MJ</th>
                  {otvorena && <th className="p-3 text-right">Prijať teraz</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data.items ?? []).map((it: any) => (
                  <tr key={it.id}>
                    <td className="p-3">
                      {it.name}
                      {!it.stock_item_id && (
                        <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-600">
                          bez skladovej karty
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {Number(it.quantity).toFixed(2)} {it.unit ?? ""}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {Number(it.received_quantity).toFixed(2)}
                    </td>
                    <td className="p-3 text-right tabular-nums font-medium">
                      {it.zostava.toFixed(2)}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {suma(Number(it.unit_price), o.currency)}
                    </td>
                    {otvorena && (
                      <td className="p-3 text-right">
                        {it.zostava > 0 ? (
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            max={it.zostava}
                            value={prijem[it.id] ?? 0}
                            onChange={(e) =>
                              setPrijem((p) => ({ ...p, [it.id]: Number(e.target.value) }))
                            }
                            className="input w-24 text-right"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">vybavené</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {otvorena && riadkyNaPrijem.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 text-sm font-semibold">Príjem na sklad</div>
              <p className="mb-3 text-xs text-muted-foreground">
                Príjem vytvorí skladový pohyb s cenou z objednávky, takže sa premietne do váženej
                nákupnej ceny zásoby. Prijať sa dá najviac to, čo zostáva.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">Sklad</span>
                  <select
                    value={prijemSklad}
                    onChange={(e) => setPrijemSklad(e.target.value)}
                    className="input"
                  >
                    <option value="">— vyberte —</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy || !prijemSklad}
                  onClick={() => {
                    const lines = Object.entries(prijem)
                      .map(([item_id, quantity]) => ({ item_id, quantity: Number(quantity) }))
                      .filter((l) => l.quantity > 0);
                    if (lines.length === 0) {
                      setError("Zadajte aspoň jedno množstvo na príjem.");
                      return;
                    }
                    akcia(
                      () =>
                        doReceive({
                          data: { company_id: cid!, id, warehouse_id: prijemSklad, lines },
                        }),
                      "Tovar je naskladnený.",
                    );
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <PackageCheck className="h-4 w-4" /> Prijať na sklad
                </button>
              </div>
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
