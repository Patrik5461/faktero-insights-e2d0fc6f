import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/*
  Import prijatých dokladov (Doklado, Pohoda, tabuľka, ZIP so skenmi).
  Súbory nahrá prehliadač do kbelíka `imports` cez `createImportUploadUrl`;
  sem prídu len ich cesty.
*/

const Subory = z
  .array(z.object({ path: z.string().min(3).max(400), meno: z.string().min(1).max(255) }))
  .min(1)
  .max(20);

async function overClena(context: any, companyId: string) {
  const ok = await context.supabase.rpc("is_company_member", {
    _company_id: companyId,
    _user_id: context.userId,
  });
  if (!ok.data) throw new Error("Nemáte prístup k firme.");
}

async function stiahni(companyId: string, subory: z.infer<typeof Subory>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const vstupy = [];
  for (const s of subory) {
    // Cesta chodí z prehliadača — bez tejto kontroly by sa dal načítať cudzí súbor.
    if (!s.path.startsWith(`${companyId}/`)) throw new Error("Súbor nepatrí k tejto firme.");
    const { data, error } = await supabaseAdmin.storage.from("imports").download(s.path);
    if (error || !data) throw new Error(`${s.meno}: súbor sa nepodarilo načítať.`);
    vstupy.push({ meno: s.meno, bajty: new Uint8Array(await data.arrayBuffer()) });
  }
  return { supabaseAdmin, vstupy };
}

export const nahladImportuPrijatychFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ companyId: z.string().uuid(), subory: Subory }).parse(d))
  .handler(async ({ data, context }) => {
    await overClena(context, data.companyId);
    const { supabaseAdmin, vstupy } = await stiahni(data.companyId, data.subory);
    const { naplanuj, suhrnPlanu } = await import("./import-prijatych.server");
    const plan = await naplanuj(supabaseAdmin, data.companyId, vstupy);
    if (!plan.zaznamy.length && !plan.skeny.length) {
      throw new Error(
        plan.poznamky[0] ?? "V súboroch sa nenašli prijaté doklady ani skeny (PDF, fotky).",
      );
    }
    return suhrnPlanu(plan);
  });

export const spustiImportPrijatychFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        subory: Subory,
        stav: z.enum(["new", "processed", "exported"]),
        doPokladne: z.boolean(),
        citatSkeny: z.boolean(),
        zdrojAplikacie: z.string().trim().min(1).max(60),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await overClena(context, data.companyId);
    const { supabaseAdmin, vstupy } = await stiahni(data.companyId, data.subory);
    const { naplanuj, suhrnPlanu, vykonajImport } = await import("./import-prijatych.server");
    const plan = await naplanuj(supabaseAdmin, data.companyId, vstupy);
    const celkom = plan.zaznamy.length + (data.citatSkeny ? plan.skenyBezParu.length : 0);

    const { data: job, error } = await supabaseAdmin
      .from("import_jobs")
      .insert({
        company_id: data.companyId,
        source: `Prijaté doklady (${data.zdrojAplikacie})`,
        status: "running",
        file_path: data.subory[0]!.path,
        file_name: data.subory.map((s) => s.meno).join(", ").slice(0, 250),
        total_rows: celkom,
        options: { stav: data.stav, doPokladne: data.doPokladne, citatSkeny: data.citatSkeny },
        preview: suhrnPlanu(plan),
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !job) throw new Error(error?.message ?? "Import sa nepodarilo spustiť.");

    // Beží ďalej sám — sto skenov číta AI aj desať minút.
    void vykonajImport({
      klient: supabaseAdmin,
      jobId: job.id,
      companyId: data.companyId,
      userId: context.userId,
      plan,
      stav: data.stav,
      doPokladne: data.doPokladne,
      citatSkeny: data.citatSkeny,
      zdrojAplikacie: data.zdrojAplikacie,
    }).catch(async (e: any) => {
      await supabaseAdmin
        .from("import_jobs")
        .update({
          status: "failed",
          error_message: String(e?.message ?? e).slice(0, 500),
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    });
    return { jobId: job.id, celkom };
  });

export const stavImportuPrijatychFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ companyId: z.string().uuid(), jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await overClena(context, data.companyId);
    const { data: job, error } = await context.supabase
      .from("import_jobs")
      .select("status, total_rows, processed_rows, result, error_message")
      .eq("id", data.jobId)
      .eq("company_id", data.companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Import sa nenašiel.");
    return job;
  });
