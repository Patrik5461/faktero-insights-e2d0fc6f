import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Nespracované doklady (ako v Doklado) — zoznam, nahratie, detail, uloženie
  rozpracovaného, vytvorenie dokladu a zmazanie do koša.
*/

const DRUH = z.enum(["faktura", "zalohova", "dobropis", "blocek", "ostatny"]);

export const nespracovaneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const [{ data: rows }, { data: blocky }] = await Promise.all([
      supabase
        .from("nespracovane_doklady")
        .select("id, zdroj, stav, druh, file_name, udaje, chyba, created_at")
        .eq("company_id", data.company_id)
        .order("created_at", { ascending: false })
        .limit(300),
      // Bločky z appky a formulára čakajú na kontrolu v Dokladoch — patria sem tiež.
      supabase
        .from("expense_documents")
        .select("id, supplier_name, document_number, total_amount, currency, issue_date, created_at, source")
        .eq("company_id", data.company_id)
        .eq("status", "new")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);
    return {
      doklady: (rows ?? []).map((r: any) => ({
        id: r.id as string,
        typ: "nespracovany" as const,
        zdroj: r.zdroj as string,
        stav: r.stav as string,
        druh: (r.druh ?? null) as string | null,
        dodavatel: (r.udaje?.dodavatel?.nazov as string) || null,
        cislo: (r.udaje?.cislo as string) || null,
        datum: (r.udaje?.datumVystavenia as string) || null,
        suma:
          r.udaje?.celkom != null
            ? Number(r.udaje.celkom)
            : Array.isArray(r.udaje?.rozpis)
              ? r.udaje.rozpis.reduce((a: number, x: any) => a + Number(x.zaklad || 0) + Number(x.dph || 0), 0)
              : null,
        mena: (r.udaje?.mena as string) || "EUR",
        subor: r.file_name as string | null,
        chyba: r.chyba as string | null,
        vytvorene: r.created_at as string,
      })),
      blocky: (blocky ?? []).map((b: any) => ({
        id: b.id as string,
        typ: "blocek" as const,
        zdroj: b.source as string,
        dodavatel: b.supplier_name as string | null,
        cislo: b.document_number as string | null,
        datum: b.issue_date as string | null,
        suma: b.total_amount == null ? null : Number(b.total_amount),
        mena: (b.currency as string) || "EUR",
        vytvorene: b.created_at as string,
      })),
    };
  });

export const nahrajNespracovaneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        nazov: z.string().min(1).max(255),
        mime: z.string().min(3).max(120),
        subor: z.string().min(16).max(21_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const bajty = Buffer.from(data.subor, "base64");
    if (!bajty.length) throw new Error("Súbor je prázdny.");
    if (bajty.length > 15 * 1024 * 1024) throw new Error("Súbor je väčší než 15 MB.");
    const { assertCompanyActive } = await import("./active-check.server");
    await assertCompanyActive(data.company_id);
    const { zalozNespracovany, vytazNespracovany } = await import("./nespracovane.server");
    const { id } = await zalozNespracovany(context.supabase as any, {
      companyId: data.company_id,
      userId: context.userId,
      zdroj: "nahratie",
      bajty,
      nazov: data.nazov,
      mime: data.mime,
    });
    // Vyťaženie trvá aj desiatky sekúnd — beží na pozadí, zoznam sa doptáva.
    void vytazNespracovany(id);
    return { id };
  });

export const detailNespracovanehoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: r } = await supabase.from("nespracovane_doklady").select("*").eq("id", data.id).maybeSingle();
    if (!r) throw new Error("Doklad sa nenašiel — možno ho už niekto spracoval.");
    const { nacitajUdaje, udajeZAi } = await import("./nespracovane");
    const dnes = new Date().toISOString().slice(0, 10);
    const ulozene = nacitajUdaje(r.udaje);
    const udaje = ulozene.dodavatel.nazov || ulozene.cislo || !r.ai ? ulozene : udajeZAi(r.ai, dnes);
    let url: string | null = null;
    if (r.file_path) {
      const { data: s } = await supabase.storage.from("nespracovane").createSignedUrl(r.file_path, 3600);
      url = s?.signedUrl ?? null;
    }
    // Ďalší v poradí — po vytvorení sa dá rovno pokračovať.
    const { data: dalsi } = await supabase
      .from("nespracovane_doklady")
      .select("id")
      .eq("company_id", r.company_id)
      .neq("id", r.id)
      .lt("created_at", r.created_at)
      .order("created_at", { ascending: false })
      .limit(1);
    return {
      id: r.id as string,
      companyId: r.company_id as string,
      zdroj: r.zdroj as string,
      stav: r.stav as string,
      chyba: r.chyba as string | null,
      druh: (r.druh ?? null) as string | null,
      subor: { url, nazov: r.file_name as string | null, mime: r.file_mime as string | null },
      udaje,
      dalsiId: (dalsi?.[0]?.id as string | undefined) ?? null,
    };
  });

const UdajeVstup = z.record(z.string(), z.unknown());

export const ulozNespracovaneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), druh: DRUH.nullable(), udaje: UdajeVstup }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { nacitajUdaje } = await import("./nespracovane");
    const { data: r, error } = await supabase
      .from("nespracovane_doklady")
      .update({ druh: data.druh, udaje: nacitajUdaje(data.udaje), updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!r?.length) throw new Error("Doklad sa nenašiel.");
    return { ok: true };
  });

export const vytvorZNespracovanehoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid(), druh: DRUH, udaje: UdajeVstup }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { nacitajUdaje, chybajuce, NAZVY_POLI } = await import("./nespracovane");
    const u = nacitajUdaje(data.udaje);
    const chyba = chybajuce(data.druh, u);
    if (chyba.length) throw new Error(`Doplňte: ${chyba.map((k) => NAZVY_POLI[k] ?? k).join(", ")}.`);
    const { data: r } = await supabase.from("nespracovane_doklady").select("*").eq("id", data.id).maybeSingle();
    if (!r) throw new Error("Doklad sa nenašiel — možno ho už niekto spracoval.");
    const { assertCompanyActive } = await import("./active-check.server");
    await assertCompanyActive(r.company_id);
    const { vytvorDoklad } = await import("./nespracovane.server");
    return vytvorDoklad(supabase, context.userId, r, data.druh, u);
  });

/** Do koša — dá sa obnoviť, kým sa kôš nevysype (súbor ostáva v úložisku). */
export const zmazNespracovaneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: r } = await supabase.from("nespracovane_doklady").select("*").eq("id", data.id).maybeSingle();
    if (!r) throw new Error("Doklad sa nenašiel.");
    const { error: e1 } = await supabase.from("kos_dokladov").insert({
      company_id: r.company_id,
      druh: "nespracovany",
      zaznam_id: r.id,
      zaznam: r,
      vazby: {},
      popis:
        [r.udaje?.dodavatel?.nazov, r.udaje?.cislo].filter(Boolean).join(" · ") || r.file_name || "Nespracovaný doklad",
      zmazal: context.userId,
    });
    if (e1) throw new Error(e1.message);
    const { error } = await supabase.from("nespracovane_doklady").delete().eq("id", r.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
