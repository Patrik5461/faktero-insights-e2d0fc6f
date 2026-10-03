import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  DRUHY_S_PRILOHAMI,
  MAX_PRILOHA,
  MAX_PRILOH,
  cestaPrilohy,
  typSuboru,
  type DruhSPrilohou,
} from "./faktura-prilohy";

/**
 * Prílohy k vydanému dokladu — faktúre, cenovej ponuke a prijatej objednávke.
 *
 * Zápis ide klientom prihláseného človeka, takže cudziu firmu odfiltruje RLS.
 * Čo sa strážiť musí, je zvyšok: typ a veľkosť súboru, počet príloh na doklad
 * a to, že cesta v úložisku naozaj patrí tej firme a tomu dokladu — inak by
 * sa dal k vlastnej faktúre prilepiť cudzí súbor.
 */
const KOS = "invoice-attachments";

/** Z middleware chodí klient prihláseného človeka; viac z neho tu netreba. */
type Kontext = { supabase: SupabaseClient<Database> };

const Doklad = z.object({
  druh: z.enum(["invoice", "quote", "sales_order"]).default("invoice"),
  dokladId: z.string().uuid(),
});

/** Doklad cez klienta prihláseného človeka — cudziu firmu odfiltruje RLS. */
async function dokladFirmy(ctx: Kontext, druh: DruhSPrilohou, dokladId: string) {
  const { tabulka, nazov } = DRUHY_S_PRILOHAMI[druh];
  const { data } = await ctx.supabase
    .from(tabulka)
    .select("id, company_id")
    .eq("id", dokladId)
    .maybeSingle();
  if (!data) throw new Error(`${nazov} sa nenašla.`);
  return data as { id: string; company_id: string };
}

export const prilohyFakturyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Doklad.parse(d))
  .handler(async ({ data, context }) => {
    const { data: riadky, error } = await context.supabase
      .from("invoice_attachments")
      .select("id, name, mime, size, created_at")
      .eq(DRUHY_S_PRILOHAMI[data.druh].stlpec, data.dokladId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return { prilohy: riadky ?? [] };
  });

const Nahratie = Doklad.extend({
  name: z.string().min(1).max(200),
  mime: z.string().max(150),
  /** Obsah súboru; 15 MB v base64 narastie zhruba na 20 MB textu. */
  base64: z.string().min(1).max(21_000_000),
});

export const nahrajPrilohuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Nahratie.parse(d))
  .handler(async ({ data, context }) => {
    const doklad = await dokladFirmy(context, data.druh, data.dokladId);
    const stlpec = DRUHY_S_PRILOHAMI[data.druh].stlpec;

    const typ = typSuboru(data.mime, data.name);
    if (!typ) throw new Error("Tento typ súboru nepodporujeme.");

    const bajty = Buffer.from(data.base64, "base64");
    if (!bajty.length) throw new Error("Súbor je prázdny.");
    if (bajty.length > MAX_PRILOHA) throw new Error("Súbor je väčší než 15 MB.");

    const { count } = await context.supabase
      .from("invoice_attachments")
      .select("id", { count: "exact", head: true })
      .eq(stlpec, doklad.id);
    if ((count ?? 0) >= MAX_PRILOH) {
      throw new Error(`K dokladu sa dá priložiť najviac ${MAX_PRILOH} súborov.`);
    }

    const cesta = cestaPrilohy(doklad.company_id, doklad.id, typ);
    const { error: chybaUlozenia } = await context.supabase.storage
      .from(KOS)
      .upload(cesta, bajty, { contentType: typ, upsert: false });
    if (chybaUlozenia) throw new Error(`Súbor sa nepodarilo uložiť: ${chybaUlozenia.message}`);

    const { data: riadok, error } = await context.supabase
      .from("invoice_attachments")
      .insert({
        company_id: doklad.company_id,
        /* Práve jeden stĺpec dokladu — inak to databáza odmietne. */
        invoice_id: data.druh === "invoice" ? doklad.id : null,
        quote_id: data.druh === "quote" ? doklad.id : null,
        sales_order_id: data.druh === "sales_order" ? doklad.id : null,
        path: cesta,
        name: data.name,
        mime: typ,
        size: bajty.length,
        created_by: context.userId,
      })
      .select("id, name, mime, size, created_at")
      .single();
    if (error) {
      /* Keď zápis neprejde, súbor v úložisku by ostal sirotou. */
      await context.supabase.storage.from(KOS).remove([cesta]);
      throw new Error(error.message);
    }
    return { priloha: riadok };
  });

export const odkazNaPrilohuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: riadok } = await context.supabase
      .from("invoice_attachments")
      .select("path, name")
      .eq("id", data.id)
      .maybeSingle();
    if (!riadok) throw new Error("Príloha sa nenašla.");
    const { data: odkaz, error } = await context.supabase.storage
      .from(KOS)
      .createSignedUrl(riadok.path, 120, { download: riadok.name });
    if (error || !odkaz) throw new Error(error?.message ?? "Odkaz sa nepodarilo vytvoriť.");
    return { url: odkaz.signedUrl, name: riadok.name };
  });

export const zmazPrilohuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: riadok } = await context.supabase
      .from("invoice_attachments")
      .select("id, path")
      .eq("id", data.id)
      .maybeSingle();
    if (!riadok) throw new Error("Príloha sa nenašla.");

    const { error } = await context.supabase
      .from("invoice_attachments")
      .delete()
      .eq("id", riadok.id);
    if (error) throw new Error(error.message);
    /* Súbor až po riadku: keby zlyhalo mazanie riadku, príloha by ostala
       v zozname bez obsahu. */
    await context.supabase.storage.from(KOS).remove([riadok.path]);
    return { ok: true as const };
  });
