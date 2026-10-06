import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Zaúčtovanie prijatých faktúr — predkontácia, členenie DPH, kategória a
  príznak „zaúčtované“. Zaúčtované (a ešte neodovzdané) si berie Pohoda:
  konektor aj XML v Odovzdaní. Odovzdanú faktúru už meniť nemožno — v Pohode
  by sa rozišla.

  Všetko ide cez klienta prihláseného (RLS, role).
*/

const kod = z.string().trim().max(30).optional().nullable();

export const navrhyKodovFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    // Návrhy len z toho, čo firma už používa — žiadne vymyslené kódy Pohody.
    const [{ data: firma }, { data: pravidla }, { data: faktury }, { data: doklady }] = await Promise.all([
      supabase
        .from("companies")
        .select("pohoda_predkontacia_prijata, pohoda_clenenie_dph_prijata")
        .eq("id", data.company_id)
        .maybeSingle(),
      supabase.from("pravidla_uctovania").select("predkontacia, clenenie_dph").eq("company_id", data.company_id),
      supabase
        .from("purchase_invoices")
        .select("pohoda_predkontacia, pohoda_clenenie_dph")
        .eq("company_id", data.company_id)
        .not("pohoda_predkontacia", "is", null)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("expense_documents")
        .select("pohoda_predkontacia, pohoda_clenenie_dph")
        .eq("company_id", data.company_id)
        .not("pohoda_predkontacia", "is", null)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    const pocet = (hodnoty: (string | null | undefined)[]) => {
      const m = new Map<string, number>();
      for (const h of hodnoty) {
        const t = String(h ?? "").trim();
        if (t) m.set(t, (m.get(t) ?? 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 40);
    };
    const vsetky = [...(pravidla ?? []), ...(faktury ?? []), ...(doklady ?? [])];
    return {
      predkontacie: pocet([
        firma?.pohoda_predkontacia_prijata,
        ...vsetky.map((r: any) => r.predkontacia ?? r.pohoda_predkontacia),
      ]),
      clenenia: pocet([
        firma?.pohoda_clenenie_dph_prijata,
        ...vsetky.map((r: any) => r.clenenie_dph ?? r.pohoda_clenenie_dph),
      ]),
      predvolenaPredkontacia: (firma?.pohoda_predkontacia_prijata ?? null) as string | null,
      predvoleneClenenie: (firma?.pohoda_clenenie_dph_prijata ?? null) as string | null,
    };
  });

/**
 * Zaúčtuje jednu alebo viac prijatých faktúr. Vyplnené kódy prepíšu tie na
 * faktúre; prázdne nechajú, čo tam je (doplnené pravidlom alebo ručne).
 */
export const zauctujPrijateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        ids: z.array(z.string().uuid()).min(1).max(500),
        predkontacia: kod,
        clenenie: kod,
        kategoria: z.string().trim().max(40).optional().nullable(),
        odpocet: z.boolean().optional(),
        lenUlozit: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { zapocitatelna } = await import("./samofakturacia");
    const { data: riadky, error } = await supabase
      .from("purchase_invoices")
      .select("id, invoice_number, status, exported_at, deleted_at, samofakturacia, samofakturacia_stav, type")
      .eq("company_id", data.company_id)
      .in("id", data.ids);
    if (error) throw new Error(error.message);

    const preskocene: string[] = [];
    const ok: string[] = [];
    for (const r of riadky ?? []) {
      if (r.deleted_at) continue;
      if (r.exported_at) {
        preskocene.push(`${r.invoice_number}: už je odovzdaná do Pohody`);
        continue;
      }
      if (!data.lenUlozit && (r.status === "draft" || r.status === "cancelled")) {
        preskocene.push(`${r.invoice_number}: ${r.status === "draft" ? "koncept" : "stornovaná"}`);
        continue;
      }
      if (!data.lenUlozit && !zapocitatelna(r)) {
        preskocene.push(`${r.invoice_number}: samofaktúra ešte nie je odsúhlasená`);
        continue;
      }
      ok.push(r.id);
    }

    if (ok.length) {
      const zmena: Record<string, unknown> = {};
      if (data.predkontacia !== undefined) zmena.pohoda_predkontacia = data.predkontacia?.trim() || null;
      if (data.clenenie !== undefined) zmena.pohoda_clenenie_dph = data.clenenie?.trim() || null;
      if (data.kategoria !== undefined) zmena.category = data.kategoria?.trim() || null;
      if (data.odpocet !== undefined) zmena.odpocet = data.odpocet;
      // Hromadne sa prázdne pole neprepisuje — nesmie zmazať kód doplnený pravidlom.
      if (data.ids.length > 1) {
        for (const k of Object.keys(zmena)) if (zmena[k] === null) delete zmena[k];
      }
      if (!data.lenUlozit) {
        zmena.zauctovane_at = new Date().toISOString();
        zmena.zauctoval = context.userId;
      }
      if (Object.keys(zmena).length) {
        const { error: e2 } = await supabase.from("purchase_invoices").update(zmena).in("id", ok);
        if (e2) throw new Error(e2.message);
      }
      if (!data.lenUlozit) {
        // „Prijatá“ sa zaúčtovaním stáva „zaúčtovanou“; zaplatená ostáva zaplatená.
        await supabase.from("purchase_invoices").update({ status: "booked" }).in("id", ok).eq("status", "received");
      }
    }
    return { zauctovanych: data.lenUlozit ? 0 : ok.length, ulozenych: ok.length, preskocene };
  });

export const zrusZauctovanieFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: r } = await supabase
      .from("purchase_invoices")
      .select("id, status, exported_at")
      .eq("id", data.id)
      .maybeSingle();
    if (!r) throw new Error("Faktúra sa nenašla.");
    if (r.exported_at) {
      throw new Error("Faktúra je už v Pohode — zaúčtovanie zrušte tam a opravu urobte opravným dokladom.");
    }
    const { error } = await supabase
      .from("purchase_invoices")
      .update({ zauctovane_at: null, zauctoval: null, ...(r.status === "booked" ? { status: "received" } : {}) })
      .eq("id", r.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
