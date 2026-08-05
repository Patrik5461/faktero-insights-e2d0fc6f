import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// --- 1. Issue a signed upload URL the browser can PUT to. ---
export const createImportUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        fileName: z.string().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("is_company_member", {
      _company_id: data.companyId,
      _user_id: context.userId,
    });
    if (!ok.data) throw new Error("Nemáte prístup k firme.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const safe = data.fileName.replace(/[^\w.\-]+/g, "_").slice(0, 120);
    const path = `${data.companyId}/${Date.now()}_${safe}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("imports")
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "Nepodarilo sa pripraviť upload.");
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

// --- 2. After upload, parse + preview. Creates an import_job in 'uploaded' state. ---
export const previewImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        path: z.string().min(1),
        fileName: z.string().min(1),
        mapping: z.record(z.string(), z.string()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("is_company_member", {
      _company_id: data.companyId,
      _user_id: context.userId,
    });
    if (!ok.data) throw new Error("Nemáte prístup k firme.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from("imports")
      .download(data.path);
    if (dlErr || !blob) throw new Error("Súbor sa nepodarilo načítať.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { extractTables, suggestMapping, buildPreview, detectMapping } =
      await import("./import-superfaktura.server");
    const tables = await extractTables(bytes, data.fileName);
    if (!tables.length) throw new Error("V súbore sa nenašli žiadne čitateľné dáta.");
    // Use first / biggest table
    const table = tables.sort((a, b) => b.rows.length - a.rows.length)[0];
    const detection = detectMapping(table.headers, table.rows);
    const mapping = (
      data.mapping && Object.keys(data.mapping).length ? data.mapping : detection.mapping
    ) as Record<string, string>;
    // Keep suggestMapping reference to avoid unused-import warnings if regex-only path needed
    void suggestMapping;
    const preview = buildPreview(table.rows, mapping as any);
    return {
      headers: table.headers,
      sampleRows: table.rows.slice(0, 5),
      totalRows: table.rows.length,
      tableName: table.name,
      mapping,
      preview,
      detection: {
        confidence: detection.confidence,
        confidenceLabel: detection.confidenceLabel,
        detectedSource: detection.detectedSource,
        detectedColumns: detection.detectedColumns,
        perField: detection.perField,
      },
    };
  });

// --- 3. Execute the import. ---
export const executeImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        path: z.string().min(1),
        fileName: z.string().min(1),
        mapping: z.record(z.string(), z.string()),
        options: z
          .object({
            updateExisting: z.boolean().optional(),
            customersOnly: z.boolean().optional(),
            invoicesOnly: z.boolean().optional(),
            generatePdfs: z.boolean().optional(),
            triggerWebhooks: z.boolean().optional(),
          })
          .default({}),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("is_company_member", {
      _company_id: data.companyId,
      _user_id: context.userId,
    });
    if (!ok.data) throw new Error("Nemáte prístup k firme.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from("imports")
      .download(data.path);
    if (dlErr || !blob) throw new Error("Súbor sa nepodarilo načítať.");
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const { extractTables, runImport, buildPreview } = await import("./import-superfaktura.server");
    const tables = await extractTables(bytes, data.fileName);
    if (!tables.length) throw new Error("V súbore sa nenašli žiadne dáta.");
    const table = tables.sort((a, b) => b.rows.length - a.rows.length)[0];
    const preview = buildPreview(table.rows, data.mapping as any);

    const { data: job, error: jobErr } = await supabaseAdmin
      .from("import_jobs")
      .insert({
        company_id: data.companyId,
        source: "superfaktura",
        status: "running",
        file_path: data.path,
        file_name: data.fileName,
        total_rows: table.rows.length,
        mapping: data.mapping,
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
        rows: table.rows,
        mapping: data.mapping as any,
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

// --- 4. Download original uploaded file as signed URL ---
export const getImportFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("import_jobs")
      .select("file_path, company_id")
      .eq("id", data.jobId)
      .single();
    if (error || !job?.file_path) throw new Error("Súbor nenájdený.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("imports")
      .createSignedUrl(job.file_path, 600);
    if (sErr || !signed) throw new Error(sErr?.message ?? "Chyba podpisu URL");
    return { signedUrl: signed.signedUrl };
  });
