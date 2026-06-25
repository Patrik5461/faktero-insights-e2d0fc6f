import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { importStockCsv } from "@/lib/faktero/stock.functions";
import { toast } from "sonner";
import { Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sklad/import")({
  head: () => ({ meta: [{ title: "Import skladu CSV — Faktero" }] }),
  component: ImportStockPage,
});

const ALIASES: Record<string, string[]> = {
  sku: ["sku", "kód", "kod", "code"],
  name: ["názov", "nazov", "name", "produkt", "product"],
  barcode: ["čiarový kód", "ciarovy kod", "barcode", "ean"],
  unit: ["jednotka", "mj", "unit"],
  purchase_price: ["nákupná cena", "nakupna cena", "purchase_price", "purchase price"],
  sale_price: ["predajná cena", "predajna cena", "sale_price", "sale price", "cena"],
  vat_rate: ["dph", "vat", "vat_rate"],
  min_stock: ["minimálny stav", "minimalny stav", "min stock", "min_stock", "minimum"],
  initial_stock: ["počiatočný stav", "pociatocny stav", "initial stock", "initial_stock", "stav"],
  warehouse_name: ["sklad", "warehouse", "warehouse_name"],
};

function detectField(header: string): string | null {
  const h = header.trim().toLowerCase();
  for (const [field, names] of Object.entries(ALIASES)) {
    if (names.some((n) => n.toLowerCase() === h)) return field;
  }
  return null;
}

function ImportStockPage() {
  const fetchImport = useServerFn(importStockCsv);
  const [rows, setRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // header -> field
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function onFile(file: File) {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<any>(ws, { header: 1, raw: false, defval: "" });
    if (!json.length) return toast.error("Súbor je prázdny.");
    const hdr = (json[0] as string[]).map((h) => String(h ?? "").trim());
    setHeaders(hdr);
    const auto: Record<string, string> = {};
    hdr.forEach((h) => { const f = detectField(h); if (f) auto[h] = f; });
    setMapping(auto);
    const data = (json.slice(1) as any[]).map((arr) => {
      const o: Record<string, any> = {};
      hdr.forEach((h, i) => { o[h] = arr[i] ?? ""; });
      return o;
    }).filter((r) => Object.values(r).some((v) => String(v).trim() !== ""));
    setRows(data);
    setResult(null);
  }

  function buildRows() {
    return rows.map((r) => {
      const out: any = {};
      for (const [hdr, field] of Object.entries(mapping)) {
        if (field) out[field] = r[hdr];
      }
      return out;
    }).filter((r) => r.name && String(r.name).trim() !== "");
  }

  async function runImport() {
    const cid = getActiveCompanyId();
    if (!cid) return toast.error("Vyberte firmu.");
    const payload = buildRows();
    if (!payload.length) return toast.error("Žiadne riadky s názvom produktu.");
    setBusy(true);
    try {
      const res = await fetchImport({ data: { company_id: cid, rows: payload as any } });
      setResult(res);
      toast.success(`Import dokončený. Vytvorené ${res.createdItems}, aktualizované ${res.updatedItems}.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Import zlyhal.");
    } finally {
      setBusy(false);
    }
  }

  const preview = buildRows().slice(0, 10);

  return (
    <>
      <PageHeader title="Import skladu CSV" description="Nahrajte CSV alebo XLSX so skladovými kartami." action={
        <Link to="/sklad/produkty" className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">Späť</Link>
      } />
      <PageBody>
        <div className="rounded-xl border border-border bg-card p-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Upload className="h-4 w-4" /> Vybrať CSV / XLSX
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            Podporované stĺpce: SKU, Názov, Čiarový kód, Jednotka, Nákupná cena, Predajná cena, DPH, Minimálny stav, Počiatočný stav, Sklad.
          </p>
        </div>

        {headers.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">Mapovanie stĺpcov</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {headers.map((h) => (
                <label key={h} className="flex items-center gap-2 text-sm">
                  <span className="w-1/2 truncate text-muted-foreground">{h}</span>
                  <select value={mapping[h] ?? ""} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })} className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                    <option value="">— ignorovať —</option>
                    {Object.keys(ALIASES).map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}

        {preview.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">Náhľad ({rows.length} riadkov, zobrazujem 10)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>{Object.keys(preview[0]).map((k) => <th key={k} className="p-1">{k}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.map((r, i) => (
                    <tr key={i}>{Object.keys(preview[0]).map((k) => <td key={k} className="p-1">{String(r[k] ?? "")}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button disabled={busy} onClick={runImport} className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {busy ? "Importujem…" : `Potvrdiť import (${rows.length} riadkov)`}
            </button>
          </div>
        )}

        {result && (
          <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm">
            <div className="mb-2 font-semibold">Výsledok importu</div>
            <ul className="space-y-1">
              <li>Nové produkty: <strong>{result.createdProducts}</strong></li>
              <li>Aktualizované produkty: <strong>{result.updatedProducts}</strong></li>
              <li>Nové skladové karty: <strong>{result.createdItems}</strong></li>
              <li>Aktualizované skladové karty: <strong>{result.updatedItems}</strong></li>
              <li>Počiatočné pohyby: <strong>{result.initialMovements}</strong></li>
              {result.errors > 0 && <li className="text-destructive">Chyby: <strong>{result.errors}</strong></li>}
            </ul>
            {result.errorList?.length > 0 && (
              <details className="mt-3"><summary className="cursor-pointer text-xs text-muted-foreground">Detaily chýb</summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {result.errorList.map((e: any, i: number) => <li key={i}>Riadok {e.row}: {e.reason}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}