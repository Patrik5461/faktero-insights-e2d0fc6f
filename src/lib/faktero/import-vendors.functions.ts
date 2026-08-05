import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const VendorEnum = z.enum(["money-s3", "omega", "idoklad", "kros"]);

const PreviewInput = z.object({
  companyId: z.string().uuid(),
  source: VendorEnum,
  path: z.string().min(1),
  fileName: z.string().min(1),
});

const ExecuteInput = PreviewInput.extend({
  options: z
    .object({
      updateExisting: z.boolean().optional(),
      customersOnly: z.boolean().optional(),
      invoicesOnly: z.boolean().optional(),
    })
    .default({}),
});

async function assertMember(ctx: any, companyId: string) {
  const ok = await ctx.supabase.rpc("is_company_member", {
    _company_id: companyId,
    _user_id: ctx.userId,
  });
  if (!ok.data) throw new Error("Nemáte prístup k firme.");
}

export const previewVendorImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => PreviewInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: blob, error } = await supabaseAdmin.storage.from("imports").download(data.path);
    if (error || !blob) throw new Error(error?.message ?? "Súbor sa nepodarilo načítať.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { parseVendorFile, summarize } = await import("./import-vendors.server");
    const rows = parseVendorFile(data.source, data.fileName, bytes);
    if (rows.length === 0)
      throw new Error("V súbore sa nenašli žiadne faktúry v očakávanom formáte.");
    return { preview: summarize(rows), rowCount: rows.length };
  });

export const executeVendorImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ExecuteInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from("imports")
      .download(data.path);
    if (dlErr || !blob) throw new Error(dlErr?.message ?? "Súbor sa nepodarilo načítať.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { parseVendorFile, summarize } = await import("./import-vendors.server");
    const { runImport } = await import("./import-superfaktura.server");

    const rows = parseVendorFile(data.source, data.fileName, bytes);
    if (rows.length === 0)
      throw new Error("V súbore sa nenašli žiadne faktúry v očakávanom formáte.");
    const preview = summarize(rows);

    // Identity mapping — canonical row keys are already FieldKey names.
    const canonicalKeys: string[] = [
      "invoice_number",
      "variable_symbol",
      "issue_date",
      "due_date",
      "delivery_date",
      "status",
      "currency",
      "subtotal",
      "vat_total",
      "total",
      "notes",
      "external_id",
      "customer_name",
      "customer_ico",
      "customer_dic",
      "customer_ic_dph",
      "customer_email",
      "customer_phone",
      "customer_street",
      "customer_city",
      "customer_zip",
      "customer_country",
      "item_name",
      "item_description",
      "item_quantity",
      "item_unit",
      "item_unit_price",
      "item_vat_rate",
      "item_total",
    ];
    const mapping = Object.fromEntries(canonicalKeys.map((k) => [k, k])) as any;

    // Rows must be Record<string,string> for runImport; drop undefineds and stringify.
    const importRows: Record<string, string>[] = rows.map((r) => {
      const o: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) if (v != null) o[k] = String(v);
      return o;
    });

    const sourceLabels: Record<string, string> = {
      "money-s3": "Money S3",
      omega: "Omega",
      idoklad: "iDoklad",
      kros: "KROS",
    };

    const { data: job, error: jobErr } = await supabaseAdmin
      .from("import_jobs")
      .insert({
        company_id: data.companyId,
        source: sourceLabels[data.source] ?? data.source,
        status: "running",
        file_path: data.path,
        file_name: data.fileName,
        total_rows: importRows.length,
        mapping,
        options: data.options,
        preview,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (jobErr || !job) throw new Error(jobErr?.message ?? "Nepodarilo sa vytvoriť úlohu importu.");

    try {
      const r = await runImport({
        jobId: job.id,
        companyId: data.companyId,
        rows: importRows,
        mapping,
        options: data.options,
      });
      await supabaseAdmin
        .from("import_jobs")
        .update({
          status: r.failed_rows > 0 && r.imported_invoices === 0 ? "failed" : "completed",
          imported_customers: r.imported_customers,
          imported_invoices: r.imported_invoices,
          failed_rows: r.failed_rows,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      return { jobId: job.id, ...r };
    } catch (e: any) {
      await supabaseAdmin
        .from("import_jobs")
        .update({
          status: "failed",
          error_message: String(e?.message ?? e),
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      throw e;
    }
  });
