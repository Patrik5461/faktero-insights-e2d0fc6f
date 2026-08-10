import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ExpenseInput = {
  company_id: string;
  status?: "new" | "processed" | "exported";
  source?: "photo" | "qr" | "upload" | "web";
  supplier_name?: string | null;
  supplier_ico?: string | null;
  supplier_ic_dph?: string | null;
  document_number?: string | null;
  issue_date?: string | null;
  total_amount?: number | null;
  vat_amount?: number | null;
  net_amount?: number | null;
  vat_rate?: number | null;
  currency?: string;
  payment_method?: "hotovost" | "karta" | "prevod";
  category?: string | null;
  note?: string | null;
  file_path?: string | null;
  file_mime?: string | null;
  file_size?: number | null;
  qr_raw?: string | null;
  ai_raw?: unknown;
  /** Položky dokladu — z eKasy alebo z fotky. */
  items?: unknown;
  /** Rozpis základu a DPH po sadzbách; bloček ich má často viac naraz. */
  vat_breakdown?: unknown;
};

const inputSchema = z.object({
  company_id: z.string().uuid(),
  status: z.enum(["new", "processed", "exported"]).optional(),
  source: z.enum(["photo", "qr", "upload", "web"]).optional(),
  supplier_name: z.string().nullable().optional(),
  supplier_ico: z.string().nullable().optional(),
  supplier_ic_dph: z.string().nullable().optional(),
  document_number: z.string().nullable().optional(),
  issue_date: z.string().nullable().optional(),
  total_amount: z.number().nullable().optional(),
  vat_amount: z.number().nullable().optional(),
  net_amount: z.number().nullable().optional(),
  vat_rate: z.number().nullable().optional(),
  currency: z.string().optional(),
  // Rozhoduje, či doklad uberie z pokladne — karta ani prevod hotovosť neberú.
  payment_method: z.enum(["hotovost", "karta", "prevod"]).optional(),
  category: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  file_path: z.string().nullable().optional(),
  file_mime: z.string().nullable().optional(),
  file_size: z.number().nullable().optional(),
  qr_raw: z.string().nullable().optional(),
  ai_raw: z.any().optional(),
  items: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number(),
        unit_price: z.number(),
        vat_rate: z.number(),
        total: z.number().optional(),
      }),
    )
    .nullable()
    .optional(),
  vat_breakdown: z
    .array(z.object({ sadzba: z.number(), zaklad: z.number(), dph: z.number() }))
    .nullable()
    .optional(),
});

export const createExpenseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: ExpenseInput) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("expense_documents")
      .insert({ ...data, created_by: userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateExpenseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; patch: Partial<ExpenseInput> }) => data)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("expense_documents")
      .update(data.patch as any)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteExpenseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await context.supabase.from("expense_documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listExpensesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { company_id: string; month?: string | null; status?: string | null }) => data)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("expense_documents")
      .select("*")
      .eq("company_id", data.company_id)
      .order("issue_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.month) {
      const [y, m] = data.month.split("-").map(Number);
      const from = `${y}-${String(m).padStart(2, "0")}-01`;
      const toMonth = m === 12 ? 1 : m + 1;
      const toYear = m === 12 ? y + 1 : y;
      const to = `${toYear}-${String(toMonth).padStart(2, "0")}-01`;
      q = q.gte("issue_date", from).lt("issue_date", to);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getExpenseFileUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { file_path: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("expense-receipts")
      .createSignedUrl(data.file_path, 3600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

// Export vybraných dokladov ako ZIP (CSV súhrn + priložené súbory)
export const exportExpensesZipFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: {
      company_id: string;
      ids?: string[];
      month?: string | null;
      mark_exported?: boolean;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("expense_documents").select("*").eq("company_id", data.company_id);
    if (data.ids?.length) q = q.in("id", data.ids);
    if (data.month) {
      const [y, m] = data.month.split("-").map(Number);
      const from = `${y}-${String(m).padStart(2, "0")}-01`;
      const toMonth = m === 12 ? 1 : m + 1;
      const toYear = m === 12 ? y + 1 : y;
      const to = `${toYear}-${String(toMonth).padStart(2, "0")}-01`;
      q = q.gte("issue_date", from).lt("issue_date", to);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Žiadne doklady na export");

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    // CSV súhrn
    const header = [
      "id",
      "datum",
      "dodavatel",
      "ico",
      "ic_dph",
      "cislo_dokladu",
      "suma_bez_dph",
      "dph",
      "suma_celkom",
      "dph_sadzba",
      "mena",
      "kategoria",
      "poznamka",
      "subor",
    ].join(";");
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[;"\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    };
    const lines = [header];
    for (const r of rows) {
      lines.push(
        [
          r.id,
          r.issue_date ?? "",
          r.supplier_name ?? "",
          r.supplier_ico ?? "",
          r.supplier_ic_dph ?? "",
          r.document_number ?? "",
          r.net_amount ?? "",
          r.vat_amount ?? "",
          r.total_amount ?? "",
          r.vat_rate ?? "",
          r.currency ?? "EUR",
          r.category ?? "",
          r.note ?? "",
          r.file_path ? r.file_path.split("/").pop() : "",
        ]
          .map(escape)
          .join(";"),
      );
    }
    zip.file("doklady.csv", "\uFEFF" + lines.join("\n"));

    // Priložené súbory
    const files = zip.folder("subory")!;
    for (const r of rows) {
      if (!r.file_path) continue;
      const { data: file } = await supabase.storage.from("expense-receipts").download(r.file_path);
      if (!file) continue;
      const ext = (r.file_path.split(".").pop() || "bin").toLowerCase();
      const namePart = [r.issue_date ?? "no-date", r.supplier_name ?? "doklad", r.id.slice(0, 8)]
        .join("_")
        .replace(/[^a-zA-Z0-9-_ěščřžýáíéúůĎŇŤŠČŘŽÝÁÍÉÚŮ.]+/g, "-");
      files.file(`${namePart}.${ext}`, await file.arrayBuffer());
    }

    const blob = await zip.generateAsync({ type: "base64" });

    if (data.mark_exported) {
      await supabase
        .from("expense_documents")
        .update({ status: "exported", exported_at: new Date().toISOString() })
        .in(
          "id",
          rows.map((r) => r.id),
        );
    }

    return {
      base64: blob,
      filename: `doklady-${data.month ?? new Date().toISOString().slice(0, 7)}.zip`,
      count: rows.length,
    };
  });
