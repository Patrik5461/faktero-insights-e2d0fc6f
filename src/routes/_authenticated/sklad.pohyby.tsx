import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Link, useNavigate } from "@tanstack/react-router";
import { Download, ChevronDown, Plus, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight } from "lucide-react";
import { downloadCsv, downloadXlsx, type ExportRow } from "@/lib/faktero/export-helpers";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sklad/pohyby")({
  head: () => ({ meta: [{ title: "Skladové pohyby — Faktero" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    stock_item_id: typeof s.stock_item_id === "string" ? s.stock_item_id : undefined,
  }),
  component: MovementsPage,
});

const TYPE_LABEL: Record<string, string> = {
  prijem: "Príjem", vydaj: "Výdaj", oprava: "Oprava",
  inventura: "Inventúra", faktura: "Faktúra", dobropis: "Dobropis",
};

function MovementsPage() {
  const { stock_item_id } = Route.useSearch();
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [items, setItems] = useState<Record<string, any>>({});
  const [warehouses, setWarehouses] = useState<Record<string, string>>({});
  const [allWarehouses, setAllWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [products, setProducts] = useState<Record<string, { name: string }>>({});
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [invoices, setInvoices] = useState<Record<string, { id: string; number: string }>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [productSearch, setProductSearch] = useState<string>("");
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setLoading(true);
    (async () => {
      let q = supabase.from("stock_movements").select("*").eq("company_id", cid).order("created_at", { ascending: false }).limit(1000);
      if (filter) q = q.eq("type", filter as any);
      if (stock_item_id) q = q.eq("stock_item_id", stock_item_id);
      if (warehouseFilter) q = q.eq("warehouse_id", warehouseFilter);
      if (dateFrom) q = q.gte("created_at", new Date(dateFrom).toISOString());
      if (dateTo) {
        const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }
      const { data } = await q;
      setRows(data ?? []);
      const ids = Array.from(new Set((data ?? []).map((r: any) => r.stock_item_id)));
      if (ids.length) {
        const { data: si } = await supabase.from("stock_items").select("id, sku, product_id").in("id", ids);
        const m: Record<string, any> = {};
        (si ?? []).forEach((x: any) => { m[x.id] = x; });
        setItems(m);
        const prodIds = Array.from(new Set((si ?? []).map((x: any) => x.product_id).filter(Boolean)));
        if (prodIds.length) {
          const { data: pr } = await supabase.from("products").select("id, name").in("id", prodIds);
          const pm: Record<string, { name: string }> = {};
          (pr ?? []).forEach((p: any) => { pm[p.id] = { name: p.name }; });
          setProducts(pm);
        } else setProducts({});
      } else { setItems({}); setProducts({}); }
      const { data: whAll } = await supabase.from("warehouses").select("id, name").eq("company_id", cid).order("created_at");
      setAllWarehouses(whAll ?? []);
      const wm: Record<string, string> = {};
      (whAll ?? []).forEach((w: any) => { wm[w.id] = w.name; });
      setWarehouses(wm);
      const userIds = Array.from(new Set((data ?? []).map((r: any) => r.created_by).filter(Boolean)));
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
        const pm: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => { pm[p.id] = p.full_name || p.email || ""; });
        setProfiles(pm);
      }
      const invIds = Array.from(new Set((data ?? []).filter((r: any) => r.reference_type === "invoice" && r.reference_id).map((r: any) => r.reference_id)));
      if (invIds.length) {
        const { data: inv } = await supabase.from("invoices").select("id, invoice_number").in("id", invIds);
        const im: Record<string, { id: string; number: string }> = {};
        (inv ?? []).forEach((i: any) => { im[i.id] = { id: i.id, number: i.invoice_number }; });
        setInvoices(im);
      } else setInvoices({});
      setLoading(false);
    })();
  }, [filter, stock_item_id, warehouseFilter, dateFrom, dateTo]);

  const visibleRows = rows.filter((m) => {
    if (!productSearch) return true;
    const q = productSearch.toLowerCase();
    const si = items[m.stock_item_id];
    const prodName = si?.product_id ? (products[si.product_id]?.name ?? "") : "";
    return (si?.sku ?? "").toLowerCase().includes(q) || prodName.toLowerCase().includes(q);
  });

  async function exportMovements(format: "csv" | "xlsx") {
    setExportOpen(false);
    if (!visibleRows.length) return toast.error("Žiadne dáta na export.");
    const headers = ["Dátum", "Typ pohybu", "Produkt", "SKU", "Sklad", "Množstvo", "Jednotková cena", "Celková hodnota", "Referencia", "Poznámka", "Vytvoril"];
    const data: ExportRow[] = visibleRows.map((m) => {
      const si = items[m.stock_item_id];
      const prodName = si?.product_id ? (products[si.product_id]?.name ?? "") : "";
      const refLabel = m.reference_type === "invoice" && invoices[m.reference_id]
        ? `Faktúra ${invoices[m.reference_id].number}`
        : m.reference_type ?? "";
      return {
        "Dátum": new Date(m.created_at).toLocaleString("sk-SK"),
        "Typ pohybu": TYPE_LABEL[m.type] ?? m.type,
        "Produkt": prodName,
        "SKU": si?.sku ?? "",
        "Sklad": warehouses[m.warehouse_id] ?? "",
        "Množstvo": Number(m.quantity),
        "Jednotková cena": Number(m.unit_price),
        "Celková hodnota": Number(m.total_value),
        "Referencia": refLabel,
        "Poznámka": m.note ?? "",
        "Vytvoril": profiles[m.created_by] ?? "",
      };
    });
    const base = `pohyby-${new Date().toISOString().slice(0, 10)}`;
    if (format === "csv") downloadCsv(base, headers, data);
    else await downloadXlsx(base, headers, data, "Pohyby");
    toast.success(`Exportované ${data.length} riadkov.`);
  }

  return (
    <>
      <PageHeader title="Skladové pohyby" description="História všetkých pohybov skladu." action={
        <div className="relative">
          <button onClick={() => setExportOpen((o) => !o)} className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-secondary">
            <Download className="h-4 w-4" /> Export pohybov <ChevronDown className="h-3 w-3" />
          </button>
          {exportOpen && (
            <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-border bg-popover p-1 shadow-md">
              <button onClick={() => exportMovements("csv")} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted">CSV (.csv)</button>
              <button onClick={() => exportMovements("xlsx")} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted">Excel (.xlsx)</button>
            </div>
          )}
        </div>
      } />
      <PageBody>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">Všetky typy</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">Všetky sklady</option>
            {allWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            Od <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            Do <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
          </label>
          <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Hľadať produkt / SKU…" className="w-56 rounded-md border border-input bg-background px-3 py-2 text-sm" />
          {stock_item_id && (
            <div className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs">
              Filter: skladová karta {stock_item_id.slice(0, 8)}…
              <Link to="/sklad/pohyby" className="text-primary hover:underline">× zrušiť</Link>
            </div>
          )}
        </div>
        {/* Desktop table */}
        <div className="hidden md:block overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Dátum</th><th className="p-3">Typ</th>
                <th className="p-3">Položka</th><th className="p-3">Sklad</th>
                <th className="p-3 text-right">Množstvo</th><th className="p-3 text-right">Hodnota</th>
                <th className="p-3">Referencia / Poznámka</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Načítavam…</td></tr>}
              {!loading && visibleRows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Žiadne pohyby.</td></tr>}
              {visibleRows.map((m) => (
                <tr key={m.id} className="cursor-pointer hover:bg-muted/30" onClick={() => navigate({ to: "/sklad/pohyby/$id", params: { id: m.id } })}>
                  <td className="p-3 text-muted-foreground">{new Date(m.created_at).toLocaleString("sk-SK")}</td>
                  <td className="p-3 font-medium">{TYPE_LABEL[m.type] ?? m.type}</td>
                  <td className="p-3">{items[m.stock_item_id]?.sku ?? m.stock_item_id.slice(0, 8)}</td>
                  <td className="p-3 text-muted-foreground">{warehouses[m.warehouse_id] ?? "—"}</td>
                  <td className={`p-3 text-right ${Number(m.quantity) >= 0 ? "text-emerald-600" : "text-destructive"}`}>{Number(m.quantity) > 0 ? "+" : ""}{m.quantity}</td>
                  <td className="p-3 text-right">{Number(m.total_value).toFixed(2)} €</td>
                  <td className="p-3 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {m.reference_type === "invoice" && invoices[m.reference_id] ? (
                          <Link to="/faktury/$id" params={{ id: invoices[m.reference_id].id }} className="text-primary hover:underline">
                            Faktúra {invoices[m.reference_id].number}
                          </Link>
                        ) : m.note ?? ""}
                      </span>
                      <Link to="/sklad/pohyby/$id" params={{ id: m.id }} className="shrink-0 text-primary hover:underline">Detail</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {loading && <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">Načítavam…</div>}
          {!loading && visibleRows.length === 0 && <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">Žiadne pohyby.</div>}
          {visibleRows.map((m) => (
            <Link key={m.id} to="/sklad/pohyby/$id" params={{ id: m.id }} className="block rounded-xl border border-border bg-card p-3 hover:bg-muted/30">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{new Date(m.created_at).toLocaleString("sk-SK")}</span>
                <span className="rounded bg-muted px-2 py-0.5 font-medium text-foreground">{TYPE_LABEL[m.type] ?? m.type}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="font-medium">{items[m.stock_item_id]?.sku ?? m.stock_item_id.slice(0, 8)}</div>
                <div className={Number(m.quantity) >= 0 ? "text-emerald-600 font-semibold" : "text-destructive font-semibold"}>
                  {Number(m.quantity) > 0 ? "+" : ""}{m.quantity}
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{warehouses[m.warehouse_id] ?? "—"}</span>
                <span>{Number(m.total_value).toFixed(2)} €</span>
              </div>
              {m.note && <div className="mt-1 text-xs text-muted-foreground">{m.note}</div>}
            </Link>
          ))}
        </div>
      </PageBody>
    </>
  );
}