import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ExistujuciDoklad, NajdenaDuplicita, NespracovanyNaDuplicity } from "./nespracovane-duplicity";

/*
  „Odstrániť duplicity“ v Nespracovaných dokladoch. Najprv `nahlad` — zoznam,
  čo je duplicitou čoho; po potvrdení `odstran` s vybranými id. Server
  duplicity zráta znova a do koša (`kos_dokladov`, dá sa obnoviť) presunie len
  tie, ktoré sú stále duplicitou — rovnako ako mazanie jedného nespracovaného.

  Práva: `overPristup` so zápisom do dokladov, všetko ostatné klientom
  prihláseného (RLS).
*/

async function overPrava(context: any, companyId: string) {
  const { overPristup } = await import("./over-pristup");
  await overPristup(context, companyId, { oblast: "doklady", zapis: true });
}

const s = (v: unknown) => (v == null || String(v).trim() === "" ? null : String(v).trim());
const cislo = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Po kúskoch — PostgREST vracia najviac 1 000 riadkov a dlhé `in` neznesie. */
function kusky<T>(xs: T[], n = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function vsetkyNespracovane(sb: any, companyId: string) {
  const out: Record<string, any>[] = [];
  for (let od = 0; ; od += 1000) {
    const { data, error } = await sb
      .from("nespracovane_doklady")
      .select(
        "id, created_at, stav, subor_hash, file_name, udaje, ai_ico:ai->>supplier_ico, ai_nazov:ai->>supplier_name, ai_cislo:ai->>invoice_number, ai_suma:ai->>amount_total",
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: true })
      .range(od, od + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function naPorovnanie(r: Record<string, any>): NespracovanyNaDuplicity {
  const u = r.udaje ?? {};
  // Kým sa doklad číta, údaje ešte nemá — porovná sa len súbor.
  const cita = r.stav === "cita";
  const nazov = s(u.dodavatel?.nazov) ?? s(r.ai_nazov);
  const c = cita ? null : (s(u.cislo) ?? s(r.ai_cislo));
  return {
    id: r.id,
    vytvorene: String(r.created_at ?? ""),
    hash: s(r.subor_hash),
    ico: cita ? null : (s(u.dodavatel?.ico) ?? s(r.ai_ico)),
    cislo: c,
    suma: cita ? null : (cislo(u.celkom) ?? cislo(r.ai_suma)),
    popis: [c, nazov].filter(Boolean).join(", ") || s(r.file_name) || "Nespracovaný doklad",
  };
}

async function existujuce(sb: any, companyId: string, n: NespracovanyNaDuplicity[]): Promise<ExistujuciDoklad[]> {
  const hashe = [...new Set(n.map((x) => x.hash).filter(Boolean))] as string[];
  const cisla = [...new Set(n.filter((x) => x.ico && x.suma != null).map((x) => x.cislo).filter(Boolean))] as string[];
  const dotaz = async (p: PromiseLike<{ data: unknown; error: unknown }>) => {
    const { data, error } = await p;
    if (error) throw new Error((error as any).message ?? "Nepodarilo sa načítať doklady.");
    return (data ?? []) as Record<string, any>[];
  };
  const out: ExistujuciDoklad[] = [];
  const prijata = (r: Record<string, any>): ExistujuciDoklad => ({
    agenda: "prijata",
    id: r.id,
    hash: s(r.subor_hash),
    ico: s(r.supplier_ico),
    cislo: s(r.invoice_number),
    suma: cislo(r.amount_total),
    popis: [r.invoice_number, r.supplier_name].filter(Boolean).join(", "),
  });
  const blocek = (r: Record<string, any>): ExistujuciDoklad => ({
    agenda: "blocek",
    id: r.id,
    hash: s(r.subor_hash),
    ico: s(r.supplier_ico),
    cislo: s(r.document_number),
    suma: cislo(r.total_amount),
    popis: [r.document_number, r.supplier_name].filter(Boolean).join(", "),
  });
  const PI = "id, subor_hash, supplier_ico, supplier_name, invoice_number, amount_total";
  const ED = "id, subor_hash, supplier_ico, supplier_name, document_number, total_amount";
  const ulohy: Promise<void>[] = [];
  for (const k of kusky(hashe)) {
    ulohy.push(
      dotaz(sb.from("purchase_invoices").select(PI).eq("company_id", companyId).is("deleted_at", null).in("subor_hash", k)).then((r) => void out.push(...r.map(prijata))),
      dotaz(sb.from("expense_documents").select(ED).eq("company_id", companyId).in("subor_hash", k)).then((r) => void out.push(...r.map(blocek))),
      dotaz(sb.from("other_documents").select("id, subor_hash, subject, sender").eq("company_id", companyId).in("subor_hash", k)).then(
        (r) =>
          void out.push(
            ...r.map((x) => ({
              agenda: "ostatny" as const,
              id: x.id,
              hash: s(x.subor_hash),
              ico: null,
              cislo: null,
              suma: null,
              popis: [x.subject, x.sender].filter(Boolean).join(", "),
            })),
          ),
      ),
    );
  }
  for (const k of kusky(cisla)) {
    ulohy.push(
      dotaz(sb.from("purchase_invoices").select(PI).eq("company_id", companyId).is("deleted_at", null).in("invoice_number", k)).then((r) => void out.push(...r.map(prijata))),
      dotaz(sb.from("expense_documents").select(ED).eq("company_id", companyId).in("document_number", k)).then((r) => void out.push(...r.map(blocek))),
    );
  }
  await Promise.all(ulohy);
  return out;
}

async function zratajDuplicity(sb: any, companyId: string): Promise<NajdenaDuplicita[]> {
  const rows = (await vsetkyNespracovane(sb, companyId)).map(naPorovnanie);
  const { najdiDuplicityNespracovanych } = await import("./nespracovane-duplicity");
  return najdiDuplicityNespracovanych(rows, await existujuce(sb, companyId, rows));
}

export const duplicityNespracovanychFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await overPrava(context, data.company_id);
    return { duplicity: await zratajDuplicity(context.supabase as any, data.company_id) };
  });

export const odstranDuplicityNespracovanychFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await overPrava(context, data.company_id);
    const sb = context.supabase as any;
    // Len to, čo je duplicitou aj teraz — medzitým mohol niekto doklad spracovať či zmazať.
    const stale = new Map((await zratajDuplicity(sb, data.company_id)).map((d) => [d.id, d]));
    const ids = data.ids.filter((id) => stale.has(id));
    let presunute = 0;
    const chyby: string[] = [];
    for (const k of kusky(ids, 50)) {
      const { data: rows, error } = await sb
        .from("nespracovane_doklady")
        .select("*")
        .eq("company_id", data.company_id)
        .in("id", k);
      if (error) throw new Error(error.message);
      for (const r of (rows ?? []) as Record<string, any>[]) {
        // Rovnako ako zmazNespracovaneFn: záznam do koša, potom zmazať.
        const { error: e1 } = await sb.from("kos_dokladov").insert({
          company_id: r.company_id,
          druh: "nespracovany",
          zaznam_id: r.id,
          zaznam: r,
          vazby: {},
          popis:
            [r.udaje?.dodavatel?.nazov, r.udaje?.cislo].filter(Boolean).join(" · ") || r.file_name || "Nespracovaný doklad",
          zmazal: context.userId,
        });
        if (e1) {
          chyby.push(`${stale.get(r.id)?.popis ?? r.id}: ${e1.message}`);
          continue;
        }
        const { error: e2 } = await sb.from("nespracovane_doklady").delete().eq("id", r.id);
        if (e2) chyby.push(`${stale.get(r.id)?.popis ?? r.id}: ${e2.message}`);
        else presunute++;
      }
    }
    return { presunute, preskocene: data.ids.length - ids.length, chyby };
  });
