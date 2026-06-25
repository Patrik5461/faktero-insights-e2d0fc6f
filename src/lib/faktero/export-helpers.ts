// Client-side export helpers for CSV / XLSX downloads.
export type ExportRow = Record<string, string | number | null | undefined>;

function toCsvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[;"\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export function downloadCsv(filename: string, headers: string[], rows: ExportRow[]) {
  const lines = [headers.map(toCsvCell).join(";")];
  for (const r of rows) lines.push(headers.map((h) => toCsvCell((r as any)[h])).join(";"));
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

export async function downloadXlsx(filename: string, headers: string[], rows: ExportRow[], sheetName = "Export") {
  const XLSX = await import("xlsx");
  const aoa: any[][] = [headers, ...rows.map((r) => headers.map((h) => (r as any)[h] ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerDownload(blob, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportMenuFormats() {
  return [
    { key: "csv", label: "CSV (.csv)" },
    { key: "xlsx", label: "Excel (.xlsx)" },
  ] as const;
}