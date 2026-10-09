import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  polozkaZBlocku,
  polozkaZPrijatej,
  suhrnVyuctovania,
  type PolozkaVyuctovania,
  type TypVyuctovania,
} from "./vyuctovanie-vydavkov";

type Sb = any;
const STL_BLOCKU =
  "id, issue_date, supplier_name, document_number, payment_method, total_amount, vat_amount, currency, exported_at, vyuctovanie_id";
const STL_PRIJATEJ =
  "id, issue_date, supplier_name, invoice_number, payment_method, amount_without_vat, vat_amount, amount_total, currency, exported_at, vyuctovanie_id";

/** Položky vyúčtovania — bločky a prijaté faktúry s jeho `vyuctovanie_id`. */
async function polozky(supabase: Sb, ids: string[]): Promise<Record<string, PolozkaVyuctovania[]>> {
  if (!ids.length) return {};
  const [{ data: b }, { data: p }] = await Promise.all([
    supabase.from("expense_documents").select(STL_BLOCKU).in("vyuctovanie_id", ids),
    supabase
      .from("purchase_invoices")
      .select(STL_PRIJATEJ)
      .in("vyuctovanie_id", ids)
      .is("deleted_at", null),
  ]);
  const out: Record<string, PolozkaVyuctovania[]> = {};
  for (const r of b ?? []) (out[r.vyuctovanie_id] ??= []).push(polozkaZBlocku(r));
  for (const r of p ?? []) (out[r.vyuctovanie_id] ??= []).push(polozkaZPrijatej(r));
  return out;
}

export const zoznamVyuctovaniFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Sb;
    const { data: rows, error } = await supabase
      .from("vyuctovania_vydavkov")
      .select("*")
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const p = await polozky(
      supabase,
      (rows ?? []).map((r: any) => r.id),
    );
    return (rows ?? []).map((r: any) => ({
      ...r,
      suhrn: suhrnVyuctovania(p[r.id] ?? [], r.typ, Number(r.zaloha), r.mena),
    }));
  });

export const detailVyuctovaniaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Sb;
    const { data: v } = await supabase
      .from("vyuctovania_vydavkov")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!v) throw new Error("Vyúčtovanie sa nenašlo.");
    const p = (await polozky(supabase, [v.id]))[v.id] ?? [];
    return { vyuctovanie: v, polozky: p };
  });

/** Doklady na výber do vyúčtovania (podľa id) — na predvyplnenie nového. */
export const dokladyNaVyuctovanieFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        blocky: z.array(z.string().uuid()).max(500).default([]),
        prijate: z.array(z.string().uuid()).max(500).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Sb;
    const [{ data: b }, { data: p }] = await Promise.all([
      data.blocky.length
        ? supabase
            .from("expense_documents")
            .select(STL_BLOCKU)
            .eq("company_id", data.company_id)
            .in("id", data.blocky)
        : { data: [] },
      data.prijate.length
        ? supabase
            .from("purchase_invoices")
            .select(STL_PRIJATEJ)
            .eq("company_id", data.company_id)
            .in("id", data.prijate)
        : { data: [] },
    ]);
    return {
      polozky: [...(b ?? []).map(polozkaZBlocku), ...(p ?? []).map(polozkaZPrijatej)],
      // Doklad už v inom vyúčtovaní — do nového ho nepustíme bez povšimnutia.
      vInom: [...(b ?? []), ...(p ?? [])]
        .filter((r: any) => r.vyuctovanie_id)
        .map((r: any) => r.id as string),
    };
  });

const Doklad = z.object({ druh: z.enum(["blocek", "prijata"]), id: z.string().uuid() });

export const ulozVyuctovanieFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        id: z.string().uuid().nullable().optional(),
        nazov: z.string().trim().min(1).max(200),
        typ: z.enum(["zaloha", "vlastne", "karta"]),
        zamestnanec_id: z.string().uuid().nullable().optional(),
        zamestnanec_meno: z.string().max(200).nullable().optional(),
        obdobie_od: z.string().nullable().optional(),
        obdobie_do: z.string().nullable().optional(),
        zaloha: z.number().min(0).max(1e9).default(0),
        mena: z.string().length(3).default("EUR"),
        predkontacia: z.string().max(40).nullable().optional(),
        clenenie_dph: z.string().max(40).nullable().optional(),
        datum_uctovania: z.string().nullable().optional(),
        poznamka: z.string().max(1000).nullable().optional(),
        stav: z.enum(["otvorene", "uzavrete"]).default("otvorene"),
        doklady: z.array(Doklad).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Sb;
    const userId = (context as any).userId as string;
    const d = (v?: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const t = (v?: string | null) => (String(v ?? "").trim() ? String(v).trim() : null);
    const riadok = {
      company_id: data.company_id,
      nazov: data.nazov,
      typ: data.typ,
      zamestnanec_id: data.zamestnanec_id ?? null,
      zamestnanec_meno: t(data.zamestnanec_meno),
      obdobie_od: d(data.obdobie_od),
      obdobie_do: d(data.obdobie_do),
      zaloha: data.typ === "zaloha" ? data.zaloha : 0,
      mena: data.mena.toUpperCase(),
      predkontacia: t(data.predkontacia),
      clenenie_dph: t(data.clenenie_dph),
      datum_uctovania: d(data.datum_uctovania),
      poznamka: t(data.poznamka),
      stav: data.stav,
      updated_at: new Date().toISOString(),
    };
    let id = data.id ?? null;
    if (id) {
      const { error } = await supabase
        .from("vyuctovania_vydavkov")
        .update(riadok)
        .eq("id", id)
        .eq("company_id", data.company_id);
      if (error) throw new Error(error.message);
    } else {
      const { data: novy, error } = await supabase
        .from("vyuctovania_vydavkov")
        .insert({ ...riadok, created_by: userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      id = novy.id as string;
    }
    const vysledok = await priradDoklady(supabase, data.company_id, id!, data.doklady, true, {
      predkontacia: riadok.predkontacia,
      clenenie: riadok.clenenie_dph,
    });
    return { id, ...vysledok };
  });

/** „Pridať do existujúceho" — doklady sa k vyúčtovaniu pridajú, ostatné ostanú. */
export const pridajDoVyuctovaniaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        id: z.string().uuid(),
        doklady: z.array(Doklad).min(1).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Sb;
    const { data: v } = await supabase
      .from("vyuctovania_vydavkov")
      .select("id, stav, predkontacia, clenenie_dph")
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!v) throw new Error("Vyúčtovanie sa nenašlo.");
    if (v.stav === "uzavrete") throw new Error("Vyúčtovanie je uzavreté — najprv ho otvorte.");
    return priradDoklady(supabase, data.company_id, v.id, data.doklady, false, {
      predkontacia: v.predkontacia,
      clenenie: v.clenenie_dph,
    });
  });

/**
 * Priradí doklady k vyúčtovaniu. `nahradit` = zoznam je úplný, čo v ňom nie je,
 * sa z vyúčtovania vyberie. Doklad z iného vyúčtovania sa nepresunie potichu —
 * vráti sa medzi `vInom`. Predkontácia a členenie vyúčtovania sa doplnia
 * dokladom, ktoré ich nemajú a ešte neodišli do účtovníctva.
 */
async function priradDoklady(
  supabase: Sb,
  companyId: string,
  id: string,
  doklady: { druh: "blocek" | "prijata"; id: string }[],
  nahradit: boolean,
  kody: { predkontacia: string | null; clenenie: string | null },
): Promise<{ priradenych: number; vInom: number }> {
  let priradenych = 0;
  let vInom = 0;
  for (const [druh, tabulka] of [
    ["blocek", "expense_documents"],
    ["prijata", "purchase_invoices"],
  ] as const) {
    const ids = doklady.filter((x) => x.druh === druh).map((x) => x.id);
    if (nahradit) {
      let q = supabase
        .from(tabulka)
        .update({ vyuctovanie_id: null })
        .eq("company_id", companyId)
        .eq("vyuctovanie_id", id);
      if (ids.length) q = q.not("id", "in", `(${ids.join(",")})`);
      const { error } = await q;
      if (error) throw new Error(error.message);
    }
    if (!ids.length) continue;
    const { data: zmenene, error } = await supabase
      .from(tabulka)
      .update({ vyuctovanie_id: id })
      .eq("company_id", companyId)
      .in("id", ids)
      .or(`vyuctovanie_id.is.null,vyuctovanie_id.eq.${id}`)
      .select("id");
    if (error) throw new Error(error.message);
    priradenych += zmenene?.length ?? 0;
    vInom += ids.length - (zmenene?.length ?? 0);
    for (const [stlpec, hodnota] of [
      ["pohoda_predkontacia", kody.predkontacia],
      ["pohoda_clenenie_dph", kody.clenenie],
    ] as const) {
      if (!hodnota) continue;
      await supabase
        .from(tabulka)
        .update({ [stlpec]: hodnota })
        .eq("vyuctovanie_id", id)
        .is("exported_at", null)
        .or(`${stlpec}.is.null,${stlpec}.eq.`);
    }
  }
  return { priradenych, vInom };
}

export const zmazVyuctovanieFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Sb;
    // Doklady ostávajú — vyúčtovanie ich len zoskupovalo (cudzí kľúč ich uvoľní).
    const { error } = await supabase
      .from("vyuctovania_vydavkov")
      .delete()
      .eq("id", data.id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const pdfVyuctovaniaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Sb;
    const { data: v } = await supabase
      .from("vyuctovania_vydavkov")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!v) throw new Error("Vyúčtovanie sa nenašlo.");
    const [{ data: firma }, p] = await Promise.all([
      supabase
        .from("companies")
        .select("name, ico, street, zip, city")
        .eq("id", v.company_id)
        .maybeSingle(),
      polozky(supabase, [v.id]),
    ]);
    const { pdfVyuctovania } = await import("./vyuctovanie-vydavkov-pdf.server");
    const obsah = await pdfVyuctovania({
      firma: firma ?? { name: "" },
      nazov: v.nazov,
      typ: v.typ as TypVyuctovania,
      zamestnanec: v.zamestnanec_meno,
      obdobieOd: v.obdobie_od,
      obdobieDo: v.obdobie_do,
      zaloha: Number(v.zaloha ?? 0),
      mena: v.mena ?? "EUR",
      predkontacia: v.predkontacia,
      datumUctovania: v.datum_uctovania,
      poznamka: v.poznamka,
      polozky: p[v.id] ?? [],
    });
    const meno =
      String(v.nazov)
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "vyuctovanie";
    return { nazov: `${meno}.pdf`, base64: Buffer.from(obsah).toString("base64") };
  });
