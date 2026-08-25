import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  createTransfer,
  listUserCompaniesForTransfer,
  listWarehousesForCompany,
  zalozZakladnySklad,
  previewTransferMatching,
} from "@/lib/faktero/stock.functions";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";
import { Trash2, Plus, ArrowRightLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sklad/presuny/nova")({
  head: () => ({ meta: [{ title: "Nový presun — Faktero" }] }),
  component: NewTransferPage,
});

type LineItem = { source_stock_item_id: string; quantity: string; unit_price: string };

function NewTransferPage() {
  const nav = useNavigate();
  const create = useServerFn(createTransfer);
  const fetchCompanies = useServerFn(listUserCompaniesForTransfer);
  const fetchTargetWhs = useServerFn(listWarehousesForCompany);
  const zalozSklad = useServerFn(zalozZakladnySklad);
  const fetchMatching = useServerFn(previewTransferMatching);

  const [mode, setMode] = useState<"warehouse" | "company">("warehouse");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [targetWarehouses, setTargetWarehouses] = useState<any[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [productMap, setProductMap] = useState<Record<string, string>>({});
  const [warehouseFrom, setWarehouseFrom] = useState("");
  const [warehouseTo, setWarehouseTo] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { source_stock_item_id: "", quantity: "1", unit_price: "0" },
  ]);
  const [matches, setMatches] = useState<
    Record<string, { matched_target_id: string | null; matched_by: string | null }>
  >({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setCompanyId(cid);
    (async () => {
      const [{ data: wh }, { data: si }, { data: prods }, cos] = await Promise.all([
        supabase
          .from("warehouses")
          .select("id, name")
          .eq("company_id", cid)
          .eq("active", true)
          .order("name"),
        supabase
          .from("stock_items")
          .select("id, sku, barcode, product_id, sale_price, purchase_price, avg_purchase_price")
          .eq("company_id", cid)
          .is("archived_at", null)
          .order("sku"),
        supabase.from("products").select("id, name").eq("company_id", cid).is("deleted_at", null),
        fetchCompanies({ data: { exclude_company_id: cid } }),
      ]);
      const pm: Record<string, string> = {};
      (prods ?? []).forEach((p: any) => {
        pm[p.id] = p.name;
      });
      setProductMap(pm);
      setWarehouses(wh ?? []);
      setStockItems(si ?? []);
      setCompanies(cos ?? []);
      if ((wh ?? []).length) setWarehouseFrom(wh![0].id);
    })();
  }, [fetchCompanies]);

  useEffect(() => {
    if (mode !== "company" || !targetCompany) {
      setTargetWarehouses([]);
      setWarehouseTo("");
      return;
    }
    (async () => {
      const list = await fetchTargetWhs({ data: { company_id: targetCompany } });
      setTargetWarehouses(list ?? []);
      if ((list ?? []).length) setWarehouseTo(list[0].id);
    })();
  }, [mode, targetCompany, fetchTargetWhs]);

  // Auto matching preview for inter-company transfers
  useEffect(() => {
    if (mode !== "company" || !targetCompany || !companyId) {
      setMatches({});
      return;
    }
    const ids = items.map((i) => i.source_stock_item_id).filter(Boolean);
    if (!ids.length) {
      setMatches({});
      return;
    }
    (async () => {
      const res = await fetchMatching({
        data: {
          source_company_id: companyId,
          target_company_id: targetCompany,
          source_stock_item_ids: ids,
        },
      }).catch(() => []);
      const map: Record<string, { matched_target_id: string | null; matched_by: string | null }> =
        {};
      (res ?? []).forEach((r: any) => {
        map[r.source_id] = { matched_target_id: r.matched_target_id, matched_by: r.matched_by };
      });
      setMatches(map);
    })();
  }, [items, mode, targetCompany, companyId, fetchMatching]);

  const itemLabel = (si: any) => {
    const prod = si.product_id ? productMap[si.product_id] : null;
    return `${si.sku ?? "—"}${prod ? ` · ${prod}` : ""}`;
  };

  const updateItem = (idx: number, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const canSubmit = useMemo(() => {
    if (!companyId || !warehouseFrom) return false;
    if (mode === "warehouse" && (!warehouseTo || warehouseTo === warehouseFrom)) return false;
    if (mode === "company" && (!targetCompany || !warehouseTo)) return false;
    return items.every((it) => it.source_stock_item_id && Number(it.quantity) > 0);
  }, [companyId, warehouseFrom, warehouseTo, mode, targetCompany, items]);

  const submit = async () => {
    if (!companyId || !canSubmit) return;
    setBusy(true);
    try {
      const res = await create({
        data: {
          company_id: companyId,
          warehouse_from_id: warehouseFrom,
          warehouse_to_id: warehouseTo,
          target_company_id: mode === "company" ? targetCompany : null,
          note: note || null,
          items: items.map((it) => ({
            source_stock_item_id: it.source_stock_item_id,
            quantity: Number(it.quantity),
            unit_price: Number(it.unit_price || 0),
          })),
        },
      });
      toast.success("Presun vytvorený ako koncept.");
      nav({ to: "/sklad/presuny/$id", params: { id: res.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa vytvoriť presun.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Nový presun"
        description="Presun medzi skladmi jednej firmy alebo medzi vlastnými firmami"
      />
      <PageBody>
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Mode selector */}
          <div className="flex gap-2 rounded-md border p-1 bg-muted/30 w-fit">
            <button
              type="button"
              onClick={() => setMode("warehouse")}
              className={`px-4 py-2 rounded text-sm ${mode === "warehouse" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              Medzi skladmi
            </button>
            <button
              type="button"
              onClick={() => setMode("company")}
              className={`px-4 py-2 rounded text-sm ${mode === "company" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              Medzi firmami
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] items-end">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Zo skladu</label>
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={warehouseFrom}
                onChange={(e) => setWarehouseFrom(e.target.value)}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="pb-3 text-muted-foreground">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            {mode === "warehouse" ? (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Do skladu</label>
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  value={warehouseTo}
                  onChange={(e) => setWarehouseTo(e.target.value)}
                >
                  <option value="">— vyberte —</option>
                  {warehouses
                    .filter((w) => w.id !== warehouseFrom)
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Cieľová firma</label>
                  <select
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    value={targetCompany}
                    onChange={(e) => setTargetCompany(e.target.value)}
                  >
                    <option value="">— vyberte —</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                {targetCompany && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Cieľový sklad
                    </label>
                    <select
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                      value={warehouseTo}
                      onChange={(e) => setWarehouseTo(e.target.value)}
                    >
                      <option value="">— vyberte —</option>
                      {targetWarehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                    {targetWarehouses.length === 0 && (
                      <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100 dark:border-amber-900/40">
                        Cieľová firma zatiaľ nemá žiadny sklad — presun by nemal kam prísť.
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              const w: any = await zalozSklad({
                                data: { company_id: targetCompany },
                              });
                              const list = await fetchTargetWhs({
                                data: { company_id: targetCompany },
                              });
                              setTargetWarehouses(list ?? []);
                              setWarehouseTo(w?.id ?? "");
                              toast.success("Cieľová firma má teraz Hlavný sklad.");
                            } catch (e: any) {
                              toast.error(e?.message ?? "Sklad sa nepodarilo založiť.");
                            } finally {
                              setBusy(false);
                            }
                          }}
                          className="ml-1 font-medium underline disabled:opacity-50"
                        >
                          Založiť jej Hlavný sklad
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {companies.length === 0 && mode === "company" && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100 dark:border-amber-900/40">
              Nemáte prístup k žiadnej ďalšej firme. Pridajte sa do inej firmy pre presuny medzi
              firmami.
            </div>
          )}

          {/* Items */}
          <div className="rounded-md border">
            <div className="flex items-center justify-between border-b px-3 py-2 bg-muted/30">
              <div className="text-sm font-medium">Položky</div>
              <button
                type="button"
                onClick={() =>
                  setItems((p) => [
                    ...p,
                    { source_stock_item_id: "", quantity: "1", unit_price: "0" },
                  ])
                }
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <Plus className="h-4 w-4" /> Pridať položku
              </button>
            </div>
            <div className="divide-y">
              {items.map((it, idx) => {
                const m = matches[it.source_stock_item_id];
                return (
                  <div
                    key={idx}
                    className="grid gap-2 p-3 sm:grid-cols-[1fr_120px_120px_auto] items-center"
                  >
                    <div>
                      <select
                        className="w-full rounded-md border px-2 py-1.5 text-sm"
                        value={it.source_stock_item_id}
                        onChange={(e) => {
                          // Cena presunu je nákladová — bez predvyplnenia
                          // z váženej ceny odchádzal tovar ocenený na nulu.
                          const si = stockItems.find((x: any) => x.id === e.target.value);
                          const cena =
                            Number(si?.avg_purchase_price ?? 0) || Number(si?.purchase_price ?? 0);
                          updateItem(idx, {
                            source_stock_item_id: e.target.value,
                            ...(it.unit_price === "0" || it.unit_price === ""
                              ? { unit_price: cena ? String(cena) : it.unit_price }
                              : {}),
                          });
                        }}
                      >
                        <option value="">— vyberte položku —</option>
                        {stockItems.map((si) => (
                          <option key={si.id} value={si.id}>
                            {itemLabel(si)}
                          </option>
                        ))}
                      </select>
                      {mode === "company" && it.source_stock_item_id && m && (
                        <div className="mt-1 text-xs">
                          {m.matched_target_id ? (
                            <span className="text-emerald-700 dark:text-emerald-300">
                              ✓ Nájdená v cieľovej firme (
                              {m.matched_by === "sku" ? "podľa SKU" : "podľa čiarového kódu"})
                            </span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-300">
                              Nie je v cieľovej firme — pri dokončení sa vytvorí nová.
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Množstvo"
                      className="w-full rounded-md border px-2 py-1.5 text-sm"
                      value={it.quantity}
                      onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Cena"
                      className="w-full rounded-md border px-2 py-1.5 text-sm"
                      value={it.unit_price}
                      onChange={(e) => updateItem(idx, { unit_price: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                      disabled={items.length === 1}
                      className="rounded p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Poznámka</label>
            <textarea
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {!canSubmit && (
            <p className="text-right text-xs text-muted-foreground">
              {!warehouseFrom
                ? "Vyberte zdrojový sklad."
                : mode === "company" && !targetCompany
                  ? "Vyberte cieľovú firmu."
                  : !warehouseTo
                    ? "Vyberte cieľový sklad."
                    : mode === "warehouse" && warehouseTo === warehouseFrom
                      ? "Cieľový sklad musí byť iný než zdrojový."
                      : "Doplňte položku a množstvo väčšie než nula."}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Link to="/sklad/presuny" className="rounded-md border px-4 py-2 text-sm">
              Zrušiť
            </Link>
            <button
              type="button"
              disabled={!canSubmit || busy}
              onClick={submit}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Vytváram…" : "Vytvoriť presun"}
            </button>
          </div>
        </div>
      </PageBody>
    </>
  );
}
