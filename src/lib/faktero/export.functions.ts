import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ExportFormat = "pohoda_xml";

export const exportInvoicesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; invoiceIds: string[]; format: ExportFormat }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { EXPORT_STRATEGIES } = await import("./export.server");
    const strategy = EXPORT_STRATEGIES[data.format];
    if (!strategy) throw new Error("Neznámy formát exportu");
    if (!data.invoiceIds.length) throw new Error("Žiadne faktúry");

    const [{ data: company, error: cErr }, { data: invs, error: iErr }] = await Promise.all([
      supabase.from("companies").select("*").eq("id", data.companyId).single(),
      supabase
        .from("invoices")
        .select("*")
        .eq("company_id", data.companyId)
        .in("id", data.invoiceIds),
    ]);
    if (cErr) throw new Error(cErr.message);
    if (iErr) throw new Error(iErr.message);
    if (!company) throw new Error("Firma nenájdená");
    if (!invs || invs.length === 0) throw new Error("Faktúry nenájdené");

    const { data: items, error: itErr } = await supabase
      .from("invoice_items")
      .select("*")
      .in(
        "invoice_id",
        invs.map((i) => i.id),
      )
      .order("position");
    if (itErr) throw new Error(itErr.message);

    const bundle = invs.map((invoice) => ({
      invoice,
      items: (items ?? []).filter((it) => it.invoice_id === invoice.id),
    }));

    const built = strategy.build({ company, invoices: bundle });

    const dates = invs
      .map((i) => i.issue_date)
      .filter(Boolean)
      .sort();
    const { data: job, error: jErr } = await supabase
      .from("export_jobs")
      .insert({
        company_id: data.companyId,
        created_by: userId,
        format: strategy.format,
        target_system: strategy.target_system,
        status: "completed",
        invoice_count: invs.length,
        date_from: dates[0] ?? null,
        date_to: dates[dates.length - 1] ?? null,
        file_name: built.fileName,
        file_content: built.content,
      })
      .select()
      .single();
    if (jErr) throw new Error(jErr.message);

    if (job) {
      await supabase.from("export_logs").insert(
        invs.map((inv) => ({
          export_job_id: job.id,
          company_id: data.companyId,
          invoice_id: inv.id,
          invoice_number: inv.invoice_number,
          status: "ok",
        })),
      );
    }

    return {
      jobId: job?.id,
      fileName: built.fileName,
      content: built.content,
      mime: built.mime,
      invoiceCount: invs.length,
    };
  });

export const getExportContentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { jobId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("export_jobs")
      .select("id, file_name, file_content")
      .eq("id", data.jobId)
      .single();
    if (error) throw new Error(error.message);
    return { fileName: job.file_name, content: job.file_content };
  });
