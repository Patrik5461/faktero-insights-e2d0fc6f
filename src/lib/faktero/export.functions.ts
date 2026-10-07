import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ExportFormat =
  | "pohoda_xml"
  | "omega_txt"
  | "money_s3_xml"
  | "isdoc_zip"
  | "flexi_xml"
  | "csv_univerzal";

export const exportInvoicesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; invoiceIds: string[]; format: ExportFormat }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { EXPORT_STRATEGIES } = await import("./export.server");
    const strategy = EXPORT_STRATEGIES[data.format];
    if (!strategy) throw new Error("Neznámy formát exportu");
    if (!data.invoiceIds.length) throw new Error("Žiadne faktúry");

    const [{ data: company, error: cErr }, { data: invsVsetky, error: iErr }] = await Promise.all([
      supabase.from("companies").select("*").eq("id", data.companyId).single(),
      supabase
        .from("invoices")
        .select("*")
        .eq("company_id", data.companyId)
        .in("id", data.invoiceIds)
        // Poistka aj na serveri: zoznam sa dá obísť priamym volaním.
        .is("deleted_at", null),
    ]);
    if (cErr) throw new Error(cErr.message);
    if (iErr) throw new Error(iErr.message);
    if (!company) throw new Error("Firma nenájdená");
    if (!invsVsetky || invsVsetky.length === 0) throw new Error("Faktúry nenájdené");
    // Schvaľovanie: do účtovníctva len schválené.
    const { ok: invs, cakaju } = await (await import("./schvalovanie.server")).lenSchvalene(
      supabase,
      data.companyId,
      "vystavena",
      invsVsetky,
    );
    if (!invs.length) throw new Error(`Vybrané faktúry čakajú na schválenie (${cakaju}).`);

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

    // Predkontácie a členenie DPH sú kódy z Pohody účtovníka; bez nich sa
    // doklad naimportuje, ale všetko okolo účtovania si musí doklikať sám.
    const built = await strategy.build({
      company,
      invoices: bundle,
      nastavenia: {
        predkontacia: company.pohoda_predkontacia,
        predkontaciaZaloha: company.pohoda_predkontacia_zaloha,
        predkontaciaDobropis: company.pohoda_predkontacia_dobropis,
        dobropisKladny: Boolean((company as any).pohoda_dobropis_kladny),
        clenenieDph: company.pohoda_clenenie_dph,
        clenenieDphPdp: company.pohoda_clenenie_dph_pdp,
        banka: company.pohoda_banka,
        stredisko: company.pohoda_stredisko,
        zamknuteDo: company.locked_until,
        predkontaciaRozuctovat: company.pohoda_predkontacia_rozuctovat,
      },
    });

    // Doklad, ktorý do súboru neprešiel, sa nesmie tváriť ako odovzdaný —
    // inak by pri ďalšom exporte vypadol ako „už poslané" a nikde by nebol.
    const preskocene = new Map(
      (built.preskocene ?? []).map((d) => [String(d).split(" — ")[0], String(d)]),
    );
    const vyvezene = invs.filter((i) => !preskocene.has(i.invoice_number));

    const dates = vyvezene
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
        invoice_count: vyvezene.length,
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
          status: preskocene.has(inv.invoice_number) ? "skipped" : "ok",
          error: preskocene.get(inv.invoice_number) ?? null,
        })),
      );
    }

    return {
      jobId: job?.id,
      fileName: built.fileName,
      content: built.content,
      mime: built.mime,
      // Omega chce Windows-1250; prevod robí až sťahovanie v prehliadači.
      encoding: strategy.encoding,
      invoiceCount: vyvezene.length,
      preskocene: built.preskocene ?? [],
    };
  });

export const getExportContentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { jobId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("export_jobs")
      .select("id, file_name, file_content, format")
      .eq("id", data.jobId)
      .single();
    if (error) throw new Error(error.message);
    // Starší súbor z histórie sa musí stiahnuť v tom kódovaní, v akom vznikol.
    const { EXPORT_STRATEGIES: STRATEGIE } = await import("./export.server");
    const strategia = STRATEGIE[job.format as ExportFormat];
    // Zaúčtované doklady do iných programov majú vlastné formáty.
    const { PROGRAMY_UCTOVANIA } = await import("./uctovanie-programy");
    const program = PROGRAMY_UCTOVANIA.find((p) => p.format === job.format);
    return {
      fileName: job.file_name,
      content: job.file_content,
      mime: strategia?.mime ?? program?.mime ?? "application/xml",
      encoding: (strategia?.encoding ?? program?.encoding ?? "utf-8") as
        | "utf-8"
        | "windows-1250"
        | "base64",
    };
  });
