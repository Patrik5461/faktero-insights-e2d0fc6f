import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { formatDuration, formatSpeed, sourceLabel } from "@/lib/faktero/trip-format";

export const Route = createFileRoute("/_authenticated/jazdy/export")({
  head: () => ({ meta: [{ title: "Export jázd — Faktero" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    vehicle_id: typeof s.vehicle_id === "string" && s.vehicle_id ? s.vehicle_id : undefined,
  }),
  component: ExportPage,
});

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function esc(s: any) { const v = s == null ? "" : String(s); return /[";\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v; }

function ExportPage() {
  const { vehicle_id } = Route.useSearch();
  const navigate = useNavigate({ from: "/jazdy/export" });
  const today = new Date().toISOString().slice(0, 10);
  const from0 = new Date(); from0.setMonth(from0.getMonth() - 1);
  const [from, setFrom] = useState(from0.toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [vehicles, setVehicles] = useState<Array<{ id: string; name: string; license_plate: string | null }>>([]);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    supabase.from("vehicles").select("id, name, license_plate").eq("company_id", cid).order("name")
      .then(({ data }) => setVehicles((data ?? []) as any));
  }, []);

  async function fetchRows() {
    const cid = getActiveCompanyId();
    if (!cid) throw new Error("Žiadna firma");
    let q = supabase
      .from("trips")
      .select("trip_date, driver_name, start_location, end_location, purpose, distance_km, duration_seconds, average_speed_kmh, start_time, end_time, external_source, note, vehicles(name, license_plate)")
      .eq("company_id", cid)
      .gte("trip_date", from).lte("trip_date", to)
      .order("trip_date");
    if (vehicle_id) q = q.eq("vehicle_id", vehicle_id);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async function exportCsv() {
    setBusy(true);
    try {
      const rows = await fetchRows();
      const header = ["Vozidlo","ŠPZ","Dátum","Od","Do","Trvanie","Km","Priemerná rýchlosť (km/h)","Vodič","Typ jazdy","Zdroj","Poznámka"];
      const lines = [header.join(";")];
      rows.forEach((r: any) => {
        const speedTxt = formatSpeed(r.distance_km, r.duration_seconds, r.average_speed_kmh).replace(" km/h", "");
        lines.push([
          r.vehicles?.name, r.vehicles?.license_plate, r.trip_date,
          r.start_location, r.end_location,
          formatDuration(r.duration_seconds),
          r.distance_km, speedTxt,
          r.driver_name, r.purpose, sourceLabel(r.external_source), r.note,
        ].map(esc).join(";"));
      });
      download(`kniha-jazd-${from}-${to}.csv`, "\uFEFF" + lines.join("\n"), "text/csv;charset=utf-8");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function exportXlsx() {
    // Minimal SpreadsheetML 2003 (.xls) — opens in Excel/LibreOffice without deps.
    setBusy(true);
    try {
      const rows = await fetchRows();
      const header = ["Vozidlo","ŠPZ","Dátum","Od","Do","Trvanie","Km","Priemerná rýchlosť","Vodič","Typ jazdy","Zdroj","Poznámka"];
      const xmlEsc = (s: any) => String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
      const cell = (v: any, type = "String") => `<Cell><Data ss:Type="${type}">${xmlEsc(v)}</Data></Cell>`;
      const headerRow = `<Row>${header.map((h) => cell(h)).join("")}</Row>`;
      const bodyRows = rows.map((r: any) => {
        const speedTxt = formatSpeed(r.distance_km, r.duration_seconds, r.average_speed_kmh);
        return `<Row>${[
          cell(r.vehicles?.name ?? ""), cell(r.vehicles?.license_plate ?? ""), cell(r.trip_date),
          cell(r.start_location ?? ""), cell(r.end_location ?? ""),
          cell(formatDuration(r.duration_seconds)),
          cell(r.distance_km ?? 0, "Number"),
          cell(speedTxt),
          cell(r.driver_name ?? ""), cell(r.purpose ?? ""), cell(sourceLabel(r.external_source)), cell(r.note ?? ""),
        ].join("")}</Row>`;
      }).join("");
      const xml = `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Kniha jazd"><Table>${headerRow}${bodyRows}</Table></Worksheet></Workbook>`;
      download(`kniha-jazd-${from}-${to}.xls`, xml, "application/vnd.ms-excel");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function exportPdf() {
    setBusy(true);
    try {
      const rows = await fetchRows();
      const w = window.open("", "_blank");
      if (!w) return;
      const total = rows.reduce((a: number, r: any) => a + Number(r.distance_km), 0);
      const tr = rows.map((r: any) => `<tr><td>${r.vehicles?.name ?? ""} ${r.vehicles?.license_plate ?? ""}</td><td>${r.trip_date}</td><td>${r.start_location ?? ""}</td><td>${r.end_location ?? ""}</td><td>${formatDuration(r.duration_seconds)}</td><td style="text-align:right">${Number(r.distance_km).toFixed(1)}</td><td style="text-align:right">${formatSpeed(r.distance_km, r.duration_seconds, r.average_speed_kmh)}</td><td>${r.driver_name ?? ""}</td><td>${r.purpose ?? ""}</td><td>${sourceLabel(r.external_source)}</td></tr>`).join("");
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Kniha jázd ${from} – ${to}</title><style>body{font-family:system-ui;padding:24px;color:#111}h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:11px}th,td{border:1px solid #ddd;padding:5px 6px;text-align:left}th{background:#f3f4f6}tfoot td{font-weight:600;background:#f9fafb}</style></head><body><h1>Kniha jázd</h1><div>Obdobie: ${from} – ${to}</div><table><thead><tr><th>Vozidlo</th><th>Dátum</th><th>Od</th><th>Do</th><th>Trvanie</th><th style="text-align:right">Km</th><th style="text-align:right">Priemer</th><th>Vodič</th><th>Typ</th><th>Zdroj</th></tr></thead><tbody>${tr}</tbody><tfoot><tr><td colspan="5">Spolu</td><td style="text-align:right">${total.toFixed(1)} km</td><td colspan="4"></td></tr></tfoot></table><script>window.onload=()=>window.print()</script></body></html>`);
      w.document.close();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Export jázd" description="Exportujte záznamy pre účtovníctvo." />
      <PageBody>
        <div className="grid max-w-2xl gap-4">
          <label className="block">
            <span className="text-sm font-medium">Vozidlo</span>
            <select
              value={vehicle_id ?? ""}
              onChange={(e) => navigate({ search: { vehicle_id: e.target.value || undefined } as any })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Všetky vozidlá</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.name}{v.license_plate ? ` — ${v.license_plate}` : ""}</option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="text-sm font-medium">Od</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
            <label className="block"><span className="text-sm font-medium">Do</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={exportPdf} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"><Download className="h-4 w-4" /> PDF</button>
            <button disabled={busy} onClick={exportCsv} className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary disabled:opacity-60"><Download className="h-4 w-4" /> CSV</button>
            <button disabled={busy} onClick={exportXlsx} className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary disabled:opacity-60"><Download className="h-4 w-4" /> XLSX</button>
          </div>
          <p className="text-xs text-muted-foreground">PDF sa generuje cez tlač prehliadača. XLSX je vo formáte SpreadsheetML 2003 (.xls) — otvoria ho Excel aj LibreOffice.</p>
        </div>
      </PageBody>
    </>
  );
}