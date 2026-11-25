import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Zaheslované PDF (Patrik 25. 11.):
  - odomknutie nespracovaného dokladu heslom (aj s uložením hesla firmy),
  - správa uložených hesiel firmy (Nastavenia → Heslá k PDF).
  Heslo sa nikdy nevracia do prehliadača; ukladá sa šifrované (encryptSecret).
*/

const Uuid = z.string().uuid();

function normalizujOdosielatela(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim().toLowerCase().replace(/^@/, "");
  return s ? s.slice(0, 200) : null;
}

export const odomkniNespracovanyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: Uuid,
        id: Uuid,
        heslo: z.string().min(1).max(200),
        /** Uložiť heslo firmy, aby sa ďalšie PDF od toho istého odosielateľa odomkli samy. */
        zapamatat: z.boolean().optional(),
        nazov: z.string().trim().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { oblast: "doklady", zapis: true });
    const supabase = context.supabase as any;
    // Riadok musí prihlásený vidieť (RLS) — až potom sa súbor mení servisným kľúčom.
    const { data: r } = await supabase
      .from("nespracovane_doklady")
      .select("id, company_id, file_path, file_mime, file_name, inbox_message_id")
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!r?.file_path) throw new Error("Doklad sa nenašiel alebo nemá súbor.");
    const { cestaPatriFirme } = await import("./cesta-firmy");
    if (!cestaPatriFirme(r.file_path, r.company_id)) throw new Error("Súbor nepatrí k tejto firme.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { KOS_NESPRACOVANYCH, odosielatelSpravy, vytazNespracovany } = await import("./nespracovane.server");
    const { data: subor, error } = await supabaseAdmin.storage.from(KOS_NESPRACOVANYCH).download(r.file_path);
    if (error || !subor) throw new Error("Súbor sa nepodarilo načítať.");
    const { odheslujPdf } = await import("./pdf-heslo.server");
    const odomknute = await odheslujPdf(Buffer.from(await subor.arrayBuffer()), data.heslo);
    if (!odomknute) throw new Error("Nesprávne heslo.");

    const up = await supabaseAdmin.storage
      .from(KOS_NESPRACOVANYCH)
      .upload(r.file_path, odomknute, { contentType: r.file_mime ?? "application/pdf", upsert: true });
    if (up.error) throw new Error(`Odomknutý súbor sa nepodarilo uložiť: ${up.error.message}`);
    await supabaseAdmin
      .from("nespracovane_doklady")
      .update({ stav: "cita", chyba: null, file_size: odomknute.length, updated_at: new Date().toISOString() })
      .eq("id", r.id);

    if (data.zapamatat) {
      const odosielatel = await odosielatelSpravy(supabaseAdmin, r.inbox_message_id);
      const { encryptSecret } = await import("./payment-crypto.server");
      await (supabaseAdmin as any).from("pdf_hesla").insert({
        company_id: data.company_id,
        nazov: data.nazov?.trim() || odosielatel || (r.file_name ? `Heslo k súboru ${r.file_name}` : "Heslo k PDF"),
        odosielatel: normalizujOdosielatela(odosielatel),
        heslo_sifrovane: encryptSecret(data.heslo),
        created_by: context.userId,
      });
    }
    void vytazNespracovany(r.id);
    return { ok: true };
  });

export type HesloPdf = { id: string; nazov: string; odosielatel: string | null; created_at: string };

export const zoznamHesielPdfFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: Uuid }).parse(d))
  .handler(async ({ data, context }): Promise<HesloPdf[]> => {
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { spravca: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r, error } = await (supabaseAdmin as any)
      .from("pdf_hesla")
      .select("id, nazov, odosielatel, created_at")
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (r ?? []) as HesloPdf[];
  });

export const pridajHesloPdfFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: Uuid,
        nazov: z.string().trim().min(1).max(120),
        odosielatel: z.string().trim().max(200).optional().nullable(),
        heslo: z.string().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { spravca: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { encryptSecret } = await import("./payment-crypto.server");
    const { error } = await (supabaseAdmin as any).from("pdf_hesla").insert({
      company_id: data.company_id,
      nazov: data.nazov,
      odosielatel: normalizujOdosielatela(data.odosielatel),
      heslo_sifrovane: encryptSecret(data.heslo),
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const zmazHesloPdfFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: Uuid, id: Uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { spravca: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("pdf_hesla").delete().eq("id", data.id).eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
