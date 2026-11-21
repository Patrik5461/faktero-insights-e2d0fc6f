import { supabase } from "@/integrations/supabase/client";
import { sFirmouAktivnej } from "@/lib/faktero/nazov-suboru-aktivnej-firmy";
import { vsPrijatej } from "@/lib/faktero/variabilny-symbol";
import { bezVzorca } from "@/lib/bezpecny-text";

/*
  „Stiahnuť ZIP (PDF + CSV)“ z lišty výberu prijatých faktúr a prijatých
  zálohových faktúr: prílohy z úložiska `purchase-invoices` + súhrn v CSV.
  Obe agendy sú v tej istej tabuľke `purchase_invoices`, preto jeden kód.
*/

type Prekladac = (text: string, p?: Record<string, string | number>) => string;

export function csvSuhrnPrijatych(items: any[], t: Prekladac): string {
  const header = [
    t("Číslo"),
    t("Dodávateľ"),
    t("IČO"),
    t("Vystavená"),
    t("Dodanie (DUZP)"),
    t("Splatnosť"),
    t("Suma"),
    t("Mena"),
    t("Stav"),
    t("VS"),
  ];
  const rowsCsv = items.map((r) =>
    [
      r.invoice_number,
      r.supplier_name,
      r.supplier_ico ?? "",
      r.issue_date,
      r.delivery_date || r.issue_date,
      r.due_date,
      Number(r.amount_total ?? 0).toFixed(2),
      r.currency ?? "EUR",
      r.status,
      vsPrijatej(r),
    ]
      // Meno dodávateľa píše cudzí človek (e-mail, eFaktúra) — `=HYPERLINK(…)` nesmie ožiť v Exceli.
      .map((v) => `"${bezVzorca(v ?? "").replace(/"/g, '""')}"`)
      .join(";"),
  );
  return "﻿" + [header.join(";"), ...rowsCsv].join("\n");
}

/** Stiahne ZIP; vráti počet príloh v poriadku a bez prílohy/s chybou. */
export async function stiahniZipPrijatych(
  items: any[],
  t: Prekladac,
  predpona: string,
): Promise<{ ok: number; fail: number }> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  let ok = 0,
    fail = 0;
  for (const r of items) {
    if (!r.file_path) {
      fail++;
      continue;
    }
    try {
      const { data } = await supabase.storage
        .from("purchase-invoices")
        .createSignedUrl(r.file_path, 300);
      if (!data?.signedUrl) {
        fail++;
        continue;
      }
      const resp = await fetch(data.signedUrl);
      if (!resp.ok) {
        fail++;
        continue;
      }
      const bytes = new Uint8Array(await resp.arrayBuffer());
      const ext = r.file_path.split(".").pop() || "pdf";
      const safe = String(r.invoice_number || r.id).replace(/[^\w.-]+/g, "_");
      zip.file(`${safe}.${ext}`, bytes);
      ok++;
    } catch {
      fail++;
    }
  }
  zip.file("_suhrn.csv", csvSuhrnPrijatych(items, t));
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = await sFirmouAktivnej(`${predpona}-${new Date().toISOString().slice(0, 10)}.zip`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { ok, fail };
}
