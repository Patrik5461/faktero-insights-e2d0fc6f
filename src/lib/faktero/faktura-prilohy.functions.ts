import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  DRUHY_S_PRILOHAMI,
  MAX_PRILOHA,
  MAX_PRILOH,
  MAX_ZIP_PRILOH,
  cestaPrilohy,
  chybaObsahuPrilohy,
  nazvyDoZipu,
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
  druh: z
    .enum(["invoice", "quote", "sales_order", "purchase_invoice", "expense"])
    .default("invoice"),
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
    const { data: riadky, error } = await (context.supabase as any)
      .from(DRUHY_S_PRILOHAMI[data.druh].prilohy)
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
    const zlyObsah = chybaObsahuPrilohy(typ, bajty);
    if (zlyObsah) throw new Error(zlyObsah);

    const tabulkaPriloh = DRUHY_S_PRILOHAMI[data.druh].prilohy;
    const { count } = await (context.supabase as any)
      .from(tabulkaPriloh)
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

    const { data: riadok, error } = await (context.supabase as any)
      .from(tabulkaPriloh)
      .insert({
        company_id: doklad.company_id,
        /* Práve jeden stĺpec dokladu — inak to databáza odmietne. */
        [stlpec]: doklad.id,
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

const PodlaId = z.object({
  id: z.string().uuid(),
  druh: Doklad.shape.druh,
});

export const odkazNaPrilohuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => PodlaId.parse(d))
  .handler(async ({ data, context }) => {
    const { data: riadok } = await (context.supabase as any)
      .from(DRUHY_S_PRILOHAMI[data.druh].prilohy)
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
  .validator((d: unknown) => PodlaId.parse(d))
  .handler(async ({ data, context }) => {
    const tabulka = DRUHY_S_PRILOHAMI[data.druh].prilohy;
    const { data: riadok } = await (context.supabase as any)
      .from(tabulka)
      .select("id, path")
      .eq("id", data.id)
      .maybeSingle();
    if (!riadok) throw new Error("Príloha sa nenašla.");

    const { error } = await (context.supabase as any).from(tabulka).delete().eq("id", riadok.id);
    if (error) throw new Error(error.message);
    /* Súbor až po riadku: keby zlyhalo mazanie riadku, príloha by ostala
       v zozname bez obsahu. */
    await context.supabase.storage.from(KOS).remove([riadok.path]);
    return { ok: true as const };
  });

/** Súbor samotného dokladu (sken prijatej faktúry, fotka bločku) — iný kôš. */
const HLAVNY_SUBOR: Partial<Record<DruhSPrilohou, string>> = {
  purchase_invoice: "purchase-invoices",
  expense: "expense-receipts",
};

/**
 * „Stiahnuť všetky prílohy“ ako jeden ZIP — doklad, prílohy aj súbor dokladu.
 *
 * Všetko ide klientom prihláseného človeka: doklad aj prílohy cudzej firmy
 * odfiltruje RLS, súbory v úložisku jeho pravidlá. Vracia base64 (ako iné
 * ZIP exporty), preto strop na celkovú veľkosť.
 */
export const zipPrilohFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    Doklad.extend({ nazovDokladu: z.string().trim().max(150).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { tabulka, stlpec, prilohy, nazov } = DRUHY_S_PRILOHAMI[data.druh];
    const kos = HLAVNY_SUBOR[data.druh];
    const { data: doklad } = await (context.supabase as any)
      .from(tabulka)
      .select(kos ? "id, company_id, file_path" : "id, company_id")
      .eq("id", data.dokladId)
      .maybeSingle();
    if (!doklad) throw new Error(`${nazov} sa nenašla.`);

    const { data: riadky, error } = await (context.supabase as any)
      .from(prilohy)
      .select("path, name, size")
      .eq(stlpec, doklad.id)
      .order("created_at");
    if (error) throw new Error(error.message);

    const subory: { kos: string; path: string; name: string; size: number }[] = [];
    if (kos && doklad.file_path) {
      const pripona = String(doklad.file_path).split(".").pop() ?? "pdf";
      subory.push({
        kos,
        path: doklad.file_path,
        name: `${data.nazovDokladu || "doklad"}.${pripona}`,
        size: 0,
      });
    }
    for (const r of (riadky ?? []) as any[])
      subory.push({ kos: KOS, path: r.path, name: r.name, size: Number(r.size) || 0 });
    if (!subory.length) throw new Error("Doklad nemá žiadne prílohy.");
    if (subory.reduce((s, f) => s + f.size, 0) > MAX_ZIP_PRILOH)
      throw new Error("Prílohy sú spolu väčšie než 60 MB — stiahnite ich po jednom.");

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const nazvy = nazvyDoZipu(subory.map((f) => f.name));
    let spolu = 0;
    for (const [i, f] of subory.entries()) {
      const { data: blob, error: chyba } = await context.supabase.storage
        .from(f.kos)
        .download(f.path);
      if (chyba || !blob) throw new Error(`${f.name}: súbor sa nepodarilo načítať.`);
      const bajty = new Uint8Array(await blob.arrayBuffer());
      spolu += bajty.length;
      if (spolu > MAX_ZIP_PRILOH)
        throw new Error("Prílohy sú spolu väčšie než 60 MB — stiahnite ich po jednom.");
      zip.file(nazvy[i], bajty);
    }
    const base64 = await zip.generateAsync({ type: "base64" });
    const meno = nazvyDoZipu([`${data.nazovDokladu || "doklad"}-prilohy.zip`])[0];
    return { base64, filename: meno, pocet: subory.length };
  });
