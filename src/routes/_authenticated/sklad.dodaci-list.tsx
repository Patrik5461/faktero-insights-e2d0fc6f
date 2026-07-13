import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { aiParseDeliveryNoteFn, importDeliveryNoteFn, type DeliveryNoteItem } from "@/lib/faktero/ai-delivery-note.functions";
import { captureReceipt } from "@/lib/mobile/receipt-scanner";
import { Camera, Upload, Loader2, Trash2, Plus, FileText, History } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sklad/dodaci-list")({
  head: () => ({ meta: [{ title: "Naskenovať dodací list — Faktero" }] }),
  component: DeliveryNoteScanPage,
});

type Row = DeliveryNoteItem & { existing_product_id?: string | null };
type ProductOption = { id: string; name: string; code: string | null };

function DeliveryNoteScanPage() {
  const nav = useNavigate();
  const parseFn = useServerFn(aiParseDeliveryNoteFn);
  const importFn = useServerFn(importDeliveryNoteFn);

  const [fileMeta, setFileMeta] = useState<{ name: string; mime: string; dataUrl: string } | null>(null);
  const [supplier, setSupplier] = useState<string>("");
  const [deliveryNumber, setDeliveryNumber] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const dragRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    (async () => {
      const [{ data: whs }, { data: prods }] = await Promise.all([
        supabase.from("warehouses").select("id, name").eq("company_id", cid).eq("active", true).order("name"),
        supabase.from("products").select("id, name, code").eq("company_id", cid).is("deleted_at", null).order("name").limit(500),
      ]);
      setWarehouses(whs ?? []);
      if (whs?.length) setWarehouseId(whs[0].id);
      setProducts(prods ?? []);
    })();
  }, []);

  async function handleFile(file: File) {
    if (file.size > 15 * 1024 * 1024) return toast.error("Súbor je príliš veľký (max 15 MB).");
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) return toast.error("Podporujeme JPG, PNG, WebP alebo PDF.");
    const dataUrl: string = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(new Error("Nepodarilo sa načítať súbor"));
      r.readAsDataURL(file);
    });
    setFileMeta({ name: file.name, mime: file.type, dataUrl });
    setRows([]);
    setStoragePath(null);

    // upload to storage
    const cid = getActiveCompanyId();
    if (cid) {
      try {
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `delivery-notes/${cid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from("imports").upload(path, file, { contentType: file.type, upsert: false });
        if (!error) setStoragePath(path);
      } catch {}
    }

    // parse
    setParsing(true);
    try {
      const result = await parseFn({ data: { file_data_url: dataUrl, mime_type: file.type } });
      setSupplier(result.supplier ?? "");
      setDeliveryNumber(result.delivery_number ?? "");
      setRows(result.items.map((i) => ({ ...i, existing_product_id: matchExistingProduct(i, products) })));
      if (!result.items.length) toast.warning("AI nenašlo žiadne položky, doplňte manuálne.");
      else toast.success(`AI extrahovalo ${result.items.length} položiek.`);
    } catch (e: any) {
      toast.error(e?.message ?? "AI spracovanie zlyhalo.");
    } finally {
      setParsing(false);
    }
  }

  async function shootPhoto() {
    const cap = await captureReceipt();
    if (!cap) return;
    // Convert data URL back to File
    const blob = await (await fetch(cap.dataUrl)).blob();
    const file = new File([blob], `scan-${Date.now()}.jpg`, { type: cap.mimeType || "image/jpeg" });
    handleFile(file);
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addRow() {
    setRows((prev) => [...prev, { name: "", code: null, quantity: 1, unit: "ks", unit_price: 0, total_price: null, existing_product_id: null }]);
  }

  async function doImport() {
    const cid = getActiveCompanyId();
    if (!cid) return toast.error("Vyberte firmu.");
    if (!warehouseId) return toast.error("Vyberte sklad.");
    const valid = rows.filter((r) => r.name.trim() && r.quantity > 0);
    if (!valid.length) return toast.error("Žiadne platné položky.");
    setImporting(true);
    try {
      const res = await importFn({
        data: {
          company_id: cid,
          warehouse_id: warehouseId,
          storage_path: storagePath,
          source_filename: fileMeta?.name ?? null,
          supplier: supplier || null,
          delivery_number: deliveryNumber || null,
          items: valid.map((r) => ({
            name: r.name.trim(),
            code: r.code?.trim() || null,
            quantity: Number(r.quantity),
            unit: r.unit || "ks",
            unit_price: r.unit_price != null ? Number(r.unit_price) : null,
            existing_product_id: r.existing_product_id || null,
          })),
        },
      });
      toast.success(`Import: ${res.movements} pohybov, ${res.createdProducts} nových produktov.`);
      nav({ to: "/sklad/pohyby" });
    } catch (e: any) {
      toast.error(e?.message ?? "Import zlyhal.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Naskenovať dodací list"
        description="AI automaticky extrahuje položky z fotografie alebo PDF."
        action={
          <Link to="/sklad/dodacie-listy" className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
            <History className="h-4 w-4" /> História
          </Link>
        }
      />
      <PageBody>
        {!fileMeta && (
          <div
            ref={dragRef}
            onDragOver={(e) => { e.preventDefault(); dragRef.current?.classList.add("border-primary"); }}
            onDragLeave={() => dragRef.current?.classList.remove("border-primary")}
            onDrop={(e) => {
              e.preventDefault();
              dragRef.current?.classList.remove("border-primary");
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            className="mx-auto flex max-w-2xl flex-col items-center gap-4 rounded-xl border-2 border-dashed border-border bg-card p-8 text-center transition-colors"
          >
            <FileText className="h-10 w-10 text-muted-foreground" />
            <div>
              <div className="text-base font-medium">Nahrajte alebo odfoťte dodací list</div>
              <div className="mt-1 text-xs text-muted-foreground">JPG, PNG, WebP alebo PDF (max 15 MB)</div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button onClick={shootPhoto} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                <Camera className="h-4 w-4" /> Odfotiť
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-secondary">
                <Upload className="h-4 w-4" /> Vybrať súbor
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">Môžete tiež pretiahnuť súbor sem.</p>
          </div>
        )}

        {fileMeta && (
          <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-border bg-card p-2">
                {fileMeta.mime.startsWith("image/") ? (
                  <img src={fileMeta.dataUrl} alt="náhľad" className="max-h-64 w-full object-contain" />
                ) : (
                  <div className="flex h-40 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                    <FileText className="h-8 w-8" />
                    <span>{fileMeta.name}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => { setFileMeta(null); setRows([]); setStoragePath(null); }}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-xs hover:bg-secondary"
              >
                Nahrať iný súbor
              </button>
            </div>

            <div className="space-y-3">
              {parsing && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-card p-3 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> AI spracováva dokument…
                </div>
              )}

              <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Sklad</span>
                  <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                    {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Dodávateľ</span>
                  <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" placeholder="—" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Číslo DL</span>
                  <input value={deliveryNumber} onChange={(e) => setDeliveryNumber(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" placeholder="—" />
                </label>
              </div>

              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-3">
                  <div className="text-sm font-semibold">Položky ({rows.length})</div>
                  <button onClick={addRow} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary">
                    <Plus className="h-3.5 w-3.5" /> Pridať riadok
                  </button>
                </div>
                {rows.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    {parsing ? "Čakám na AI…" : "Žiadne položky. Pridajte manuálne alebo nahrajte iný súbor."}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs text-muted-foreground">
                        <tr>
                          <th className="p-2 text-left">Názov / produkt v sklade</th>
                          <th className="p-2 text-left">Kód</th>
                          <th className="p-2 text-right">Množstvo</th>
                          <th className="p-2 text-left">MJ</th>
                          <th className="p-2 text-right">Cena/ks</th>
                          <th className="p-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {rows.map((r, i) => (
                          <tr key={i}>
                            <td className="p-1.5">
                              <input value={r.name} onChange={(e) => updateRow(i, { name: e.target.value })} className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
                              <select
                                value={r.existing_product_id ?? ""}
                                onChange={(e) => updateRow(i, { existing_product_id: e.target.value || null })}
                                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground"
                              >
                                <option value="">— vytvoriť nový / auto-priradiť —</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ""}</option>
                                ))}
                              </select>
                            </td>
                            <td className="p-1.5">
                              <input value={r.code ?? ""} onChange={(e) => updateRow(i, { code: e.target.value || null })} className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm" />
                            </td>
                            <td className="p-1.5 text-right">
                              <input type="number" step="0.001" value={r.quantity} onChange={(e) => updateRow(i, { quantity: Number(e.target.value) })} className="w-24 rounded-md border border-input bg-background px-2 py-1 text-right text-sm" />
                            </td>
                            <td className="p-1.5">
                              <input value={r.unit} onChange={(e) => updateRow(i, { unit: e.target.value })} className="w-16 rounded-md border border-input bg-background px-2 py-1 text-sm" />
                            </td>
                            <td className="p-1.5 text-right">
                              <input type="number" step="0.0001" value={r.unit_price ?? 0} onChange={(e) => updateRow(i, { unit_price: Number(e.target.value) })} className="w-24 rounded-md border border-input bg-background px-2 py-1 text-right text-sm" />
                            </td>
                            <td className="p-1.5 text-right">
                              <button onClick={() => removeRow(i)} className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  disabled={importing || rows.length === 0 || parsing}
                  onClick={doImport}
                  className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {importing ? "Importujem…" : `Importovať do skladu (${rows.length})`}
                </button>
              </div>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}

function matchExistingProduct(item: DeliveryNoteItem, products: ProductOption[]): string | null {
  if (item.code) {
    const byCode = products.find((p) => p.code && p.code.toLowerCase() === item.code!.toLowerCase());
    if (byCode) return byCode.id;
  }
  const nm = item.name.toLowerCase().trim();
  const exact = products.find((p) => p.name.toLowerCase() === nm);
  if (exact) return exact.id;
  const partial = products.find((p) => nm.length > 3 && p.name.toLowerCase().includes(nm));
  return partial?.id ?? null;
}
