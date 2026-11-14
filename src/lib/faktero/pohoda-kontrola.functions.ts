import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Exporty → „Kontrola pred odovzdaním“ a „Rozdiely oproti Pohode“.
  Logika je v `pohoda-kontrola.server.ts`; číta sa prihláseným klientom.
*/

/** Doklady, ktoré ručný export, balík aj konektor do Pohody nepustia, s dôvodom. */
export const zastaveneDokladyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { zastaveneDoklady } = await import("./pohoda-kontrola.server");
    const vsetky = await zastaveneDoklady(context.supabase as any, data.company_id);
    // Stav konektora (čaká na odpoveď, odmietnuté, držané opravy) — chyba ho len skryje.
    const { stavKonektora } = await import("./pohoda-kontrola.server");
    const konektor = await stavKonektora(context.supabase as any, data.company_id).catch((e) => {
      console.error("[kontrola pohody] stav konektora", e);
      return null;
    });
    return {
      doklady: vsetky.filter((d) => !d.varovanie),
      // Upozornenia doklad nezastavia (napr. záväzkový kód v rozúčtovaní).
      varovania: vsetky.filter((d) => d.varovanie),
      konektor,
    };
  });

/**
 * Oprava odovzdaného dokladu (V13): človek potvrdil, že pôvodnú verziu v
 * POHODE zmazal — konektor opravu pri ďalšom behu pošle. Potvrdenie platí
 * len pre aktuálnu verziu dokladu.
 */
export const potvrdZmazanieVPohodeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        druh: z.enum(["faktura", "prijata", "doklad", "pokladna"]),
        id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { overPravoVratenia } = await import("./over-pristup");
    const ctx = { supabase: context.supabase as any, userId: context.userId as string };
    await overPravoVratenia(
      ctx,
      data.company_id,
      data.druh === "faktura" ? "faktury" : data.druh === "pokladna" ? "pokladna" : "doklady",
    );
    const tabulka = {
      faktura: "invoices",
      prijata: "purchase_invoices",
      doklad: "expense_documents",
      pokladna: "cash_entries",
    }[data.druh];
    // Doklad musí prihlásený vidieť (RLS) — až potom sa zapisuje servisným kľúčom.
    const { data: doklad } = await (context.supabase as any)
      .from(tabulka)
      .select("id, pohoda_verzia, exported_at")
      .eq("company_id", data.company_id)
      .eq("id", data.id)
      .maybeSingle();
    if (!doklad) throw new Error("Doklad sa nenašiel.");
    if (doklad.exported_at) throw new Error("Doklad je už odovzdaný.");
    const verzia = Math.trunc(Number(doklad.pohoda_verzia) || 0);
    if (verzia <= 0) throw new Error("Doklad nie je oprava odovzdaného dokladu.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { potvrdZmazanieVPohode } = await import("./pohoda-konektor-potvrdenie.server");
    await potvrdZmazanieVPohode(supabaseAdmin, {
      companyId: data.company_id,
      druh: data.druh,
      id: data.id,
      verzia,
      userId: context.userId as string,
    });
    return { ok: true };
  });

/** Odovzdané doklady, ktoré sa od odoslaného XML zmenili (alebo by dnes neprešli). */
export const rozdielyOprotiPohodeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { rozdielyOprotiPohode } = await import("./pohoda-kontrola.server");
    return await rozdielyOprotiPohode(context.supabase as any, data.company_id);
  });
