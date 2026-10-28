import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  KOS_PODPORY,
  MAX_PRILOHA_PODPORY,
  MAX_PRILOH_NA_POZIADAVKU,
  cestaPrilohyPodpory,
  typPrilohyPodpory,
} from "./podpora-prilohy";

/**
 * Prílohy k požiadavke v help desku (snímka obrazovky, fotka, PDF).
 *
 * Kôš `podpora-prilohy` nemá pre prihlásených žiadne politiky — píše doň len
 * server servisným kľúčom, a to až keď overí, že požiadavka patrí volajúcemu.
 * Cudzia aj neexistujúca požiadavka vyzerá rovnako, nič sa neprezradí.
 *
 * Súbor ide ako base64 rovnako ako prílohy faktúr: funguje to aj v zabalenej
 * appke cez most (`/api/mobil/podpora-priloha-nahraj`) bez priameho prístupu
 * do úložiska.
 */

const Nahratie = z.object({
  poziadavkaId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  mime: z.string().max(150).default(""),
  /** 10 MB v base64 narastie zhruba na 13,4 MB textu. */
  base64: z.string().min(1).max(14_000_000),
});

export const nahrajPrilohuPodporyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Nahratie.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { nacitajPoziadavku } = await import("./podpora.server");
    const p = await nacitajPoziadavku(data.poziadavkaId);
    if (!p || p.user_id !== userId) throw new Error("Požiadavka sa nenašla.");

    const typ = typPrilohyPodpory(data.mime, data.name);
    if (!typ) throw new Error("Tento typ súboru nepodporujeme.");
    const bajty = Buffer.from(data.base64, "base64");
    if (!bajty.length) throw new Error("Súbor je prázdny.");
    if (bajty.length > MAX_PRILOHA_PODPORY) throw new Error("Súbor je väčší než 10 MB.");

    // Overenie prístupu je hore — odtiaľto už servisným kľúčom.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("podpora_prilohy")
      .select("id", { count: "exact", head: true })
      .eq("poziadavka_id", p.id);
    if ((count ?? 0) >= MAX_PRILOH_NA_POZIADAVKU) {
      throw new Error(`K požiadavke sa dá priložiť najviac ${MAX_PRILOH_NA_POZIADAVKU} súborov.`);
    }

    // Príloha patrí k poslednej správe zákazníka — pri hlásení je to tá prvá.
    const { data: sprava } = await supabaseAdmin
      .from("podpora_spravy")
      .select("id")
      .eq("poziadavka_id", p.id)
      .eq("od_podpory", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const cesta = cestaPrilohyPodpory(p.id, typ);
    const { error: chybaUlozenia } = await supabaseAdmin.storage
      .from(KOS_PODPORY)
      .upload(cesta, bajty, { contentType: typ, upsert: false });
    if (chybaUlozenia) throw new Error(`Súbor sa nepodarilo uložiť: ${chybaUlozenia.message}`);

    const { data: riadok, error } = await supabaseAdmin
      .from("podpora_prilohy")
      .insert({
        poziadavka_id: p.id,
        sprava_id: (sprava as { id: string } | null)?.id ?? null,
        path: cesta,
        name: data.name,
        mime: typ,
        size: bajty.length,
        created_by: userId,
      })
      .select("id, name, mime, size, created_at")
      .single();
    if (error) {
      // Bez riadku by súbor v koši ostal sirotou.
      await supabaseAdmin.storage.from(KOS_PODPORY).remove([cesta]);
      throw new Error(error.message);
    }
    return { priloha: riadok };
  });

/** Odkaz na prílohu pre zákazníka — riadok musí prejsť cez RLS (vlastná požiadavka). */
export const odkazNaPrilohuPodporyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { data: riadok } = await supabase
      .from("podpora_prilohy")
      .select("path, name")
      .eq("id", data.id)
      .maybeSingle();
    if (!riadok) throw new Error("Príloha sa nenašla.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: odkaz, error } = await supabaseAdmin.storage
      .from(KOS_PODPORY)
      .createSignedUrl(riadok.path, 300);
    if (error || !odkaz) throw new Error(error?.message ?? "Odkaz sa nepodarilo vytvoriť.");
    return { url: odkaz.signedUrl, name: riadok.name as string };
  });
