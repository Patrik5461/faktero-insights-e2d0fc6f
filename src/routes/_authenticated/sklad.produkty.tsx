import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { createStockProductDebug, getStockDebugSnapshot } from "@/lib/faktero/stock.functions";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  AlertTriangle,
  Download,
  History,
  Upload,
  ChevronDown,
  Archive,
  ArchiveRestore,
  X,
  Check,
  Settings,
} from "lucide-react";
import { downloadCsv, downloadXlsx, type ExportRow } from "@/lib/faktero/export-helpers";
import { StockSettingsDialog } from "@/components/faktero/StockSettingsDialog";

export const Route = createFileRoute("/_authenticated/sklad/produkty")({
  head: () => ({ meta: [{ title: "Skladové položky — Faktero" }] }),
  validateSearch: (s: Record<string, unknown>): { filter?: "low_stock" } => ({
    filter: s.filter === "low_stock" ? ("low_stock" as const) : undefined,
  }),
  component: StockItemsPage,
});

type SI = {
  id?: string;
  product_id?: string | null;
  sku?: string | null;
  barcode?: string | null;
  purchase_price: number;
  sale_price: number;
  vat_rate: number;
  unit: string;
  track_stock: boolean;
  min_stock: number;
  avg_purchase_price?: number;
  last_purchase_price?: number;
  archived_at?: string | null;
};
const EMPTY: SI = {
  sku: "",
  barcode: "",
  purchase_price: 0,
  sale_price: 0,
  vat_rate: 23,
  unit: "ks",
  track_stock: true,
  min_stock: 0,
};

type NewProduct = {
  name: string;
  sku: string;
  barcode: string;
  unit: string;
  sale_price: number;
  purchase_price: number;
  vat_rate: number;
  track_stock: boolean;
  min_stock: number;
  initial_quantity: number;
  warehouse_id: string;
};
const EMPTY_NEW: NewProduct = {
  name: "",
  sku: "",
  barcode: "",
  unit: "ks",
  sale_price: 0,
  purchase_price: 0,
  vat_rate: 23,
  track_stock: true,
  min_stock: 0,
  initial_quantity: 0,
  warehouse_id: "",
};

const SHOW_STOCK_DEBUG =
  import.meta.env.DEV ||
  (typeof window !== "undefined" && window.location.hostname.includes("lovable"));

function StockItemsPage() {
  const { filter: urlFilter } = Route.useSearch();
  const createProductWithDebug = useServerFn(createStockProductDebug);
  const fetchDebugSnapshot = useServerFn(getStockDebugSnapshot);
  const [rows, setRows] = useState<any[]>([]);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [products, setProducts] = useState<any[]>([]);
  const [editing, setEditing] = useState<SI | null>(null);
  const [creating, setCreating] = useState<NewProduct | null>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string; color: string | null }>
  >([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [recentMovements, setRecentMovements] = useState<any[]>([]);
  const [debug, setDebug] = useState<any>(null);
  const [levelsByItemWh, setLevelsByItemWh] = useState<
    Record<string, Array<{ warehouse_id: string; quantity: number; reserved: number }>>
  >({});
  const [reservedByItem, setReservedByItem] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [showArchived, setShowArchived] = useState(false);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setLoading(true);
    const [
      { data: items },
      { data: lvl },
      { data: prods },
      { data: wh },
      { data: cats },
      { data: resv },
      snapshot,
    ] = await Promise.all([
      showArchived
        ? supabase
            .from("stock_items")
            .select("*")
            .eq("company_id", cid)
            .not("archived_at", "is", null)
            .order("archived_at", { ascending: false })
        : supabase
            .from("stock_items")
            .select("*")
            .eq("company_id", cid)
            .is("archived_at", null)
            .order("created_at", { ascending: false }),
      supabase
        .from("stock_levels")
        .select("stock_item_id, warehouse_id, quantity, reserved_quantity")
        .eq("company_id", cid),
      supabase
        .from("products")
        .select("id, name, code, unit_price, vat_rate, unit")
        .eq("company_id", cid)
        .is("deleted_at", null),
      supabase
        .from("warehouses")
        .select("id, name")
        .eq("company_id", cid)
        .eq("active", true)
        .order("created_at"),
      supabase
        .from("stock_categories")
        .select("id, name, color")
        .eq("company_id", cid)
        .order("name"),
      (supabase as any)
        .from("stock_reservations")
        .select("stock_item_id, quantity")
        .eq("company_id", cid)
        .eq("status", "active"),
      SHOW_STOCK_DEBUG
        ? fetchDebugSnapshot({ data: { company_id: cid } }).catch((e) => ({
            errors: [{ message: e?.message ?? String(e) }],
          }))
        : Promise.resolve(null),
    ]);
    setRows(items ?? []);
    const m: Record<string, number> = {};
    const perWh: Record<
      string,
      Array<{ warehouse_id: string; quantity: number; reserved: number }>
    > = {};
    (lvl ?? []).forEach((l: any) => {
      m[l.stock_item_id] = (m[l.stock_item_id] ?? 0) + Number(l.quantity);
      (perWh[l.stock_item_id] ||= []).push({
        warehouse_id: l.warehouse_id,
        quantity: Number(l.quantity),
        reserved: Number(l.reserved_quantity ?? 0),
      });
    });
    const rm: Record<string, number> = {};
    (resv ?? []).forEach((r: any) => {
      rm[r.stock_item_id] = (rm[r.stock_item_id] ?? 0) + Number(r.quantity);
    });
    setLevels(m);
    setLevelsByItemWh(perWh);
    setReservedByItem(rm);
    setProducts(prods ?? []);
    setWarehouses(wh ?? []);
    setCategories((cats ?? []) as any);
    if (SHOW_STOCK_DEBUG && snapshot)
      setDebug((prev: any) => ({
        ...(snapshot as any),
        last_stock_error: prev?.last_stock_error ?? (snapshot as any)?.errors?.[0]?.message ?? null,
        last_created_product_id: prev?.last_created_product_id ?? null,
        last_created_stock_item_id: prev?.last_created_stock_item_id ?? null,
        last_movement_id: prev?.last_movement_id ?? null,
        last_raw_debug: prev?.last_raw_debug ?? null,
      }));
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, [showArchived]);

  // Load recent movements for the currently edited item
  useEffect(() => {
    if (!editing?.id) {
      setRecentMovements([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("stock_movements")
        .select("id, type, quantity, created_at, note")
        .eq("stock_item_id", editing.id!)
        .order("created_at", { ascending: false })
        .limit(5);
      setRecentMovements(data ?? []);
    })();
  }, [editing?.id]);

  async function save(s: SI) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const payload = { ...s, company_id: cid };
    const op = s.id
      ? supabase.from("stock_items").update(payload).eq("id", s.id)
      : supabase.from("stock_items").insert(payload);
    const { error } = await op;
    if (error) return toast.error(error.message);
    toast.success("Uložené");
    setEditing(null);
    load();
  }

  async function openCreate() {
    const cid = getActiveCompanyId();
    if (!cid) return toast.error("Vyberte firmu.");
    setCreating({ ...EMPTY_NEW, warehouse_id: warehouses[0]?.id ?? "" });
  }

  async function createProduct(n: NewProduct) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    if (!n.name.trim()) return toast.error("Zadajte názov tovaru.");
    setSaving(true);
    try {
      const result = await createProductWithDebug({
        data: { company_id: cid, ...n, warehouse_id: n.warehouse_id || null },
      });
      const rawDebug = (result as any).debug;
      console.info("[sklad-debug:add-goods:client-result]", result);
      setDebug((prev: any) => ({
        ...(prev ?? {}),
        ...(rawDebug ?? {}),
        last_stock_error: (result as any).ok
          ? null
          : ((result as any).error ?? rawDebug?.exact_error?.message ?? "Neznáma chyba"),
        last_created_product_id:
          (result as any).product?.id ??
          rawDebug?.product_insert_result?.data?.id ??
          prev?.last_created_product_id ??
          null,
        last_created_stock_item_id:
          (result as any).stockItem?.id ??
          rawDebug?.stock_item_insert_result?.data?.id ??
          prev?.last_created_stock_item_id ??
          null,
        last_movement_id:
          (result as any).movement?.id ??
          rawDebug?.stock_movement_insert_result?.data?.id ??
          prev?.last_movement_id ??
          null,
        last_raw_debug: rawDebug ?? result,
      }));
      if (!(result as any).ok) {
        const message = (result as any).error ?? "Chyba pri ukladaní.";
        toast.error(SHOW_STOCK_DEBUG ? `Sklad chyba: ${message}` : message);
        return;
      }
      toast.success(`Tovar "${(result as any).product?.name ?? n.name}" pridaný.`);
      setCreating(null);
      load();
    } catch (e: any) {
      console.error("[sklad-debug:add-goods:client-exception]", e);
      setDebug((prev: any) => ({
        ...(prev ?? {}),
        last_stock_error: e?.message ?? String(e),
        last_raw_debug: e,
      }));
      toast.error(e?.message ?? "Chyba pri ukladaní.");
    } finally {
      setSaving(false);
    }
  }

  const filtered = rows.filter((r) => {
    if (
      search &&
      !(
        (r.sku ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (r.barcode ?? "").toLowerCase().includes(search.toLowerCase())
      )
    )
      return false;
    if (urlFilter === "low_stock") {
      const qty = levels[r.id] ?? 0;
      if (!(r.track_stock && qty < Number(r.min_stock ?? 0))) return false;
    }
    if (warehouseFilter) {
      const hasInWh = (levelsByItemWh[r.id] ?? []).some((l) => l.warehouse_id === warehouseFilter);
      if (!hasInWh) return false;
    }
    if (categoryFilter) {
      if (categoryFilter === "__none__") {
        if (r.category_id) return false;
      } else if (r.category_id !== categoryFilter) return false;
    }
    return true;
  });

  const selectedIds = Object.entries(selected)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const allOnPageSelected = filtered.length > 0 && filtered.every((r) => selected[r.id]);
  function toggleSelect(id: string) {
    setSelected((p) => ({ ...p, [id]: !p[id] }));
  }
  function toggleSelectAll(on: boolean) {
    if (on)
      setSelected((p) => ({ ...p, ...Object.fromEntries(filtered.map((r) => [r.id, true])) }));
    else setSelected({});
  }
  function clearSelection() {
    setSelected({});
  }

  async function bulkArchive() {
    const cid = getActiveCompanyId();
    if (!cid || !selectedIds.length) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from("stock_items")
      .update({ archived_at: new Date().toISOString() })
      .in("id", selectedIds)
      .eq("company_id", cid);
    setBulkBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Archivované: ${selectedIds.length}`);
    clearSelection();
    load();
  }
  async function bulkRestore() {
    const cid = getActiveCompanyId();
    if (!cid || !selectedIds.length) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from("stock_items")
      .update({ archived_at: null })
      .in("id", selectedIds)
      .eq("company_id", cid);
    setBulkBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Obnovené: ${selectedIds.length}`);
    clearSelection();
    load();
  }
  function bulkExportCsv() {
    const items = rows.filter((r) => selected[r.id]);
    if (!items.length) return toast.error("Nič nie je vybraté.");
    const headers = [
      "SKU",
      "Názov",
      "Čiarový kód",
      "Jednotka",
      "Stav",
      "Min",
      "Nákup",
      "Predaj",
      "DPH %",
    ];
    const data: ExportRow[] = items.map((s) => {
      const prod = products.find((p) => p.id === s.product_id);
      return {
        SKU: s.sku ?? "",
        Názov: prod?.name ?? "",
        "Čiarový kód": s.barcode ?? "",
        Jednotka: s.unit ?? "ks",
        Stav: levels[s.id] ?? 0,
        Min: Number(s.min_stock),
        Nákup: Number(s.purchase_price),
        Predaj: Number(s.sale_price),
        "DPH %": Number(s.vat_rate),
      };
    });
    downloadCsv(`sklad-vyber-${new Date().toISOString().slice(0, 10)}`, headers, data);
    toast.success(`Exportované ${data.length} riadkov.`);
  }

  async function commitInlineName(item: any) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const v = editingNameValue.trim();
    setEditingNameId(null);
    if (!v) return;
    if (item.product_id) {
      const prod = products.find((p) => p.id === item.product_id);
      if (prod?.name === v) return;
      const { error } = await supabase
        .from("products")
        .update({ name: v })
        .eq("id", item.product_id)
        .eq("company_id", cid);
      if (error) return toast.error(error.message);
    } else {
      if (item.sku === v) return;
      const { error } = await supabase
        .from("stock_items")
        .update({ sku: v })
        .eq("id", item.id)
        .eq("company_id", cid);
      if (error) return toast.error(error.message);
    }
    toast.success("Uložené");
    load();
  }

  function buildExportRows(): { headers: string[]; rows: ExportRow[] } {
    const headers = [
      "SKU",
      "Názov produktu",
      "Čiarový kód",
      "Jednotka",
      "Sklad",
      "Aktuálny stav",
      "Rezervované množstvo",
      "Minimálny stav",
      "Nákupná cena",
      "Predajná cena",
      "DPH %",
      "Hodnota skladu",
      "Sledovanie skladu",
    ];
    const whName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? "—";
    const out: ExportRow[] = [];
    for (const s of filtered) {
      const prod = products.find((p) => p.id === s.product_id);
      const perWh = levelsByItemWh[s.id] ?? [];
      const sources = warehouseFilter
        ? perWh.filter((l) => l.warehouse_id === warehouseFilter)
        : perWh;
      if (sources.length === 0) {
        out.push({
          SKU: s.sku ?? "",
          "Názov produktu": prod?.name ?? "",
          "Čiarový kód": s.barcode ?? "",
          Jednotka: s.unit ?? "ks",
          Sklad: "—",
          "Aktuálny stav": 0,
          "Rezervované množstvo": 0,
          "Minimálny stav": Number(s.min_stock),
          "Nákupná cena": Number(s.purchase_price),
          "Predajná cena": Number(s.sale_price),
          "DPH %": Number(s.vat_rate),
          "Hodnota skladu": 0,
          "Sledovanie skladu": s.track_stock ? "áno" : "nie",
        });
        continue;
      }
      for (const l of sources) {
        out.push({
          SKU: s.sku ?? "",
          "Názov produktu": prod?.name ?? "",
          "Čiarový kód": s.barcode ?? "",
          Jednotka: s.unit ?? "ks",
          Sklad: whName(l.warehouse_id),
          "Aktuálny stav": l.quantity,
          "Rezervované množstvo": l.reserved,
          "Minimálny stav": Number(s.min_stock),
          "Nákupná cena": Number(s.purchase_price),
          "Predajná cena": Number(s.sale_price),
          "DPH %": Number(s.vat_rate),
          "Hodnota skladu": Number((l.quantity * Number(s.purchase_price ?? 0)).toFixed(2)),
          "Sledovanie skladu": s.track_stock ? "áno" : "nie",
        });
      }
    }
    return { headers, rows: out };
  }

  async function exportStock(format: "csv" | "xlsx") {
    setExportOpen(false);
    const { headers, rows: data } = buildExportRows();
    if (!data.length) return toast.error("Žiadne dáta na export.");
    const base = `sklad-${new Date().toISOString().slice(0, 10)}`;
    if (format === "csv") downloadCsv(base, headers, data);
    else await downloadXlsx(base, headers, data, "Sklad");
    toast.success(`Exportované ${data.length} riadkov.`);
  }

  return (
    <>
      <PageHeader
        title="Skladové položky"
        description="Skladové karty napojené na produkty."
        action={
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <button
                onClick={() => setExportOpen((o) => !o)}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-secondary"
              >
                <Download className="h-4 w-4" /> Export skladu <ChevronDown className="h-3 w-3" />
              </button>
              {exportOpen && (
                <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-border bg-popover p-1 shadow-md">
                  <button
                    onClick={() => exportStock("csv")}
                    className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    CSV (.csv)
                  </button>
                  <button
                    onClick={() => exportStock("xlsx")}
                    className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    Excel (.xlsx)
                  </button>
                </div>
              )}
            </div>
            <Link
              to="/sklad/import"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-secondary"
            >
              <Upload className="h-4 w-4" /> Import skladu
            </Link>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Pridať tovar
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center justify-center rounded-md border border-border bg-card p-2 hover:bg-secondary"
              title="Nastavenia skladu (kategórie, sklady)"
              aria-label="Nastavenia skladu"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        }
      />
      <PageBody>
        {SHOW_STOCK_DEBUG && (
          <div className="mb-4 rounded-lg border border-amber-300/50 bg-amber-50 p-3 text-xs text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
            <div className="mb-2 font-semibold">Sklad diagnostika</div>
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
              <DebugLine
                label="active company_id"
                value={debug?.company_id ?? getActiveCompanyId() ?? "—"}
              />
              <DebugLine
                label="warehouses count"
                value={debug?.warehouses_count ?? warehouses.length}
              />
              <DebugLine
                label="stock_items count"
                value={debug?.stock_items_count ?? rows.length}
              />
              <DebugLine
                label="stock_movements count"
                value={debug?.stock_movements_count ?? "—"}
              />
              <DebugLine
                label="last stock error"
                value={debug?.last_stock_error ?? debug?.exact_error?.message ?? "—"}
              />
              <DebugLine
                label="last created product id"
                value={
                  debug?.last_created_product_id ?? debug?.product_insert_result?.data?.id ?? "—"
                }
              />
              <DebugLine
                label="last created stock item id"
                value={
                  debug?.last_created_stock_item_id ??
                  debug?.stock_item_insert_result?.data?.id ??
                  "—"
                }
              />
              <DebugLine
                label="last movement id"
                value={
                  debug?.last_movement_id ?? debug?.stock_movement_insert_result?.data?.id ?? "—"
                }
              />
            </div>
            {debug?.last_raw_debug && (
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-background/70 p-2 text-[11px]">
                {JSON.stringify(debug.last_raw_debug, null, 2)}
              </pre>
            )}
          </div>
        )}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Hľadať SKU, čiarový kód…"
              className="w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Všetky sklady</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Všetky kategórie</option>
              <option value="__none__">Bez kategórie</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {urlFilter === "low_stock" && (
              <div className="inline-flex items-center gap-2 rounded-md border border-amber-300/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Filter: pod minimom
                <Link to="/sklad/produkty" className="text-primary hover:underline">
                  × zrušiť
                </Link>
              </div>
            )}
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => {
                  setShowArchived(e.target.checked);
                  clearSelection();
                }}
              />
              Archivované
            </label>
          </div>
          <Link to="/produkty" className="text-sm text-primary hover:underline">
            Spravovať produkty →
          </Link>
        </div>

        {selectedIds.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <div className="text-sm">
              <span className="font-medium">{selectedIds.length}</span> vybraných
              <button
                onClick={clearSelection}
                className="ml-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" /> zrušiť výber
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                disabled={bulkBusy}
                onClick={bulkExportCsv}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5" /> Export CSV
              </button>
              {showArchived ? (
                <button
                  disabled={bulkBusy}
                  onClick={bulkRestore}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-60"
                >
                  <ArchiveRestore className="h-3.5 w-3.5" /> Obnoviť z archívu
                </button>
              ) : (
                <button
                  disabled={bulkBusy}
                  onClick={bulkArchive}
                  className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-60"
                >
                  <Archive className="h-3.5 w-3.5" /> Archivovať vybrané
                </button>
              )}
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3 w-10">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                    aria-label="Vybrať všetky"
                  />
                </th>
                <th className="p-3">SKU</th>
                <th className="p-3">Produkt</th>
                <th className="p-3 text-right">Na sklade</th>
                <th className="p-3 text-right">Rezerv.</th>
                <th className="p-3 text-right">K dispozícii</th>
                <th className="p-3 text-right">Min</th>
                <th className="p-3 text-right">Nákupná</th>
                <th className="p-3 text-right">Priem. NC</th>
                <th className="p-3 text-right">Predajná</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground">
                    Načítavam…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground">
                    {showArchived ? "Žiadne archivované karty." : "Žiadne skladové karty."}
                  </td>
                </tr>
              )}
              {filtered.map((s) => {
                const qty = levels[s.id] ?? 0;
                const reserved = reservedByItem[s.id] ?? 0;
                const available = qty - reserved;
                const minStock = Number(s.min_stock ?? 0);
                const belowAvail = s.track_stock && (available < 0 || available < minStock);
                const prod = products.find((p) => p.id === s.product_id);
                const isEditingName = editingNameId === s.id;
                const displayName = prod?.name ?? s.sku ?? "—";
                const isArchived = !!s.archived_at;
                return (
                  <tr
                    key={s.id}
                    className={`hover:bg-muted/30 ${isArchived ? "opacity-60" : ""} ${selected[s.id] ? "bg-primary/5" : ""}`}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={!!selected[s.id]}
                        onChange={() => toggleSelect(s.id)}
                        aria-label={`Vybrať ${s.sku ?? ""}`}
                      />
                    </td>
                    <td className="p-3 font-medium">{s.sku ?? "—"}</td>
                    <td
                      className="p-3 text-muted-foreground"
                      onDoubleClick={() => {
                        if (isArchived) return;
                        setEditingNameId(s.id);
                        setEditingNameValue(displayName);
                      }}
                      title="Dvojklik pre úpravu názvu"
                    >
                      {isEditingName ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={editingNameValue}
                            onChange={(e) => setEditingNameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitInlineName(s);
                              if (e.key === "Escape") setEditingNameId(null);
                            }}
                            onBlur={() => commitInlineName(s)}
                            className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
                          />
                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => commitInlineName(s)}
                            className="rounded p-1 hover:bg-muted"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        displayName
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums">{qty.toFixed(2)}</td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {reserved > 0 ? reserved.toFixed(2) : "—"}
                    </td>
                    <td
                      className={`p-3 text-right tabular-nums ${belowAvail ? "font-semibold text-amber-600" : ""}`}
                    >
                      {belowAvail && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                      {available.toFixed(2)}
                    </td>
                    <td className="p-3 text-right">{Number(s.min_stock).toFixed(2)}</td>
                    <td className="p-3 text-right tabular-nums">
                      {Number(s.purchase_price).toFixed(2)} €
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {s.avg_purchase_price != null
                        ? `${Number(s.avg_purchase_price).toFixed(4)} €`
                        : "—"}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {Number(s.sale_price).toFixed(2)} €
                    </td>
                    <td className="p-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {isArchived ? (
                          <button
                            onClick={async () => {
                              const cid = getActiveCompanyId();
                              if (!cid) return;
                              const { error } = await supabase
                                .from("stock_items")
                                .update({ archived_at: null })
                                .eq("id", s.id)
                                .eq("company_id", cid);
                              if (error) return toast.error(error.message);
                              toast.success("Obnovené");
                              load();
                            }}
                            className="rounded p-1.5 hover:bg-muted"
                            title="Obnoviť z archívu"
                          >
                            <ArchiveRestore className="h-4 w-4" />
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditing(s)}
                              className="rounded p-1.5 hover:bg-muted"
                              title="Upraviť"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={async () => {
                                const cid = getActiveCompanyId();
                                if (!cid) return;
                                if (!confirm("Archivovať túto skladovú kartu?")) return;
                                const { error } = await supabase
                                  .from("stock_items")
                                  .update({ archived_at: new Date().toISOString() })
                                  .eq("id", s.id)
                                  .eq("company_id", cid);
                                if (error) return toast.error(error.message);
                                toast.success("Archivované");
                                load();
                              }}
                              className="rounded p-1.5 hover:bg-muted text-destructive"
                              title="Archivovať"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PageBody>

      {editing && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-border bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">
              {editing.id ? "Upraviť skladovú kartu" : "Nová skladová karta"}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(editing);
              }}
              className="mt-4 grid gap-3 sm:grid-cols-2"
            >
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium">Produkt</span>
                <select
                  value={editing.product_id ?? ""}
                  onChange={(e) => setEditing({ ...editing, product_id: e.target.value || null })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">— bez napojenia —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <In
                label="SKU"
                value={editing.sku ?? ""}
                onChange={(v) => setEditing({ ...editing, sku: v })}
              />
              <In
                label="Čiarový kód"
                value={editing.barcode ?? ""}
                onChange={(v) => setEditing({ ...editing, barcode: v })}
              />
              <In
                label="Nákupná cena"
                type="number"
                value={String(editing.purchase_price)}
                onChange={(v) => setEditing({ ...editing, purchase_price: Number(v) })}
              />
              <In
                label="Predajná cena"
                type="number"
                value={String(editing.sale_price)}
                onChange={(v) => setEditing({ ...editing, sale_price: Number(v) })}
              />
              <In
                label="DPH %"
                type="number"
                value={String(editing.vat_rate)}
                onChange={(v) => setEditing({ ...editing, vat_rate: Number(v) })}
              />
              <In
                label="MJ"
                value={editing.unit}
                onChange={(v) => setEditing({ ...editing, unit: v })}
              />
              <In
                label="Minimálny stav"
                type="number"
                value={String(editing.min_stock)}
                onChange={(v) => setEditing({ ...editing, min_stock: Number(v) })}
              />
              <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.track_stock}
                  onChange={(e) => setEditing({ ...editing, track_stock: e.target.checked })}
                />
                Sledovať sklad
              </label>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
                >
                  Zrušiť
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Uložiť
                </button>
              </div>
            </form>
            {editing.id && (
              <div className="mt-5 rounded-lg border border-border bg-muted/20 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 text-sm font-medium">
                    <History className="h-4 w-4" /> Posledné pohyby
                  </div>
                  <Link
                    to="/sklad/pohyby"
                    search={{ stock_item_id: editing.id }}
                    className="text-xs text-primary hover:underline"
                  >
                    Všetky pohyby →
                  </Link>
                </div>
                {recentMovements.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Žiadne pohyby.</div>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {recentMovements.map((m) => (
                      <li key={m.id} className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          {new Date(m.created_at).toLocaleString("sk-SK")}
                        </span>
                        <span className="font-medium">{m.type}</span>
                        <span
                          className={
                            Number(m.quantity) >= 0
                              ? "text-emerald-600 tabular-nums"
                              : "text-destructive tabular-nums"
                          }
                        >
                          {Number(m.quantity) > 0 ? "+" : ""}
                          {m.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {creating && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 overflow-y-auto"
          onClick={() => !saving && setCreating(null)}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Pridať tovar</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Vytvorí produkt a skladovú kartu. Ak zadáte počiatočný stav, vytvorí sa aj príjem.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createProduct(creating);
              }}
              className="mt-4 grid gap-3 sm:grid-cols-2"
            >
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium">Názov *</span>
                <input
                  required
                  autoFocus
                  value={creating.name}
                  onChange={(e) => setCreating({ ...creating, name: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
              <In
                label="SKU"
                value={creating.sku}
                onChange={(v) => setCreating({ ...creating, sku: v })}
              />
              <In
                label="Čiarový kód"
                value={creating.barcode}
                onChange={(v) => setCreating({ ...creating, barcode: v })}
              />
              <In
                label="Jednotka"
                value={creating.unit}
                onChange={(v) => setCreating({ ...creating, unit: v })}
              />
              <In
                label="DPH %"
                type="number"
                value={String(creating.vat_rate)}
                onChange={(v) => setCreating({ ...creating, vat_rate: Number(v) || 0 })}
              />
              <In
                label="Predajná cena"
                type="number"
                value={String(creating.sale_price)}
                onChange={(v) => setCreating({ ...creating, sale_price: Number(v) || 0 })}
              />
              <In
                label="Nákupná cena"
                type="number"
                value={String(creating.purchase_price)}
                onChange={(v) => setCreating({ ...creating, purchase_price: Number(v) || 0 })}
              />
              <In
                label="Minimálny stav"
                type="number"
                value={String(creating.min_stock)}
                onChange={(v) => setCreating({ ...creating, min_stock: Number(v) || 0 })}
              />
              <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={creating.track_stock}
                  onChange={(e) => setCreating({ ...creating, track_stock: e.target.checked })}
                />
                Sledovať sklad
              </label>
              <div className="sm:col-span-2 mt-2 rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Počiatočný stav (voliteľné)
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium">Sklad</span>
                    <select
                      value={creating.warehouse_id}
                      onChange={(e) => setCreating({ ...creating, warehouse_id: e.target.value })}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <In
                    label="Počiatočné množstvo"
                    type="number"
                    value={String(creating.initial_quantity)}
                    onChange={(v) => setCreating({ ...creating, initial_quantity: Number(v) || 0 })}
                  />
                </div>
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setCreating(null)}
                  className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary disabled:opacity-60"
                >
                  Zrušiť
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? "Ukladám…" : "Pridať tovar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <StockSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} onChanged={load} />
    </>
  );
}

function In({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}

function DebugLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="font-medium">{label}:</span> <span className="break-all">{value}</span>
    </div>
  );
}
