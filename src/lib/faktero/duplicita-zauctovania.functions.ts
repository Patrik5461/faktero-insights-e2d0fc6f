import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Duplicity jedného dokladu — pre upozornenie a vypnuté „Zaúčtovať“ na
 * detaile. Číta klientom prihláseného (RLS).
 */
export const duplicityDokladuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        druh: z.enum(["prijata", "blocek"]),
        id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: row } = await sb
      .from(data.druh === "prijata" ? "purchase_invoices" : "expense_documents")
      .select("*")
      .eq("company_id", data.company_id)
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return [];
    const { duplicityDokladov } = await import("./duplicita-zauctovania.server");
    const mapa = await duplicityDokladov(sb, data.company_id, data.druh, [row]);
    return mapa.get(row.id) ?? [];
  });

/**
 * Pred uložením prijatej faktúry vo formulári: `blok` — tá istá faktúra už
 * v evidencii je (neuloží sa), `mozna` — rovnaké číslo od toho istého
 * dodávateľa s inou sumou či z iného roka (uloží sa po potvrdení).
 * Číta klientom prihláseného (RLS).
 */
export const ulozenaPrijataFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        invoice_number: z.string().max(200),
        supplier_ico: z.string().max(40).nullable().optional(),
        supplier_name: z.string().max(500).nullable().optional(),
        amount_total: z.number().nullable().optional(),
        currency: z.string().max(10).nullable().optional(),
        issue_date: z.string().max(40).nullable().optional(),
        type: z.string().max(40).nullable().optional(),
        opravuje_cislo: z.string().max(200).nullable().optional(),
        vylucit_id: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { najdiUlozenuPrijatu } = await import("./duplicita-zauctovania.server");
    const { popisPrijatej, textMoznejDuplicity } = await import("./duplicita-zauctovania");
    const { vylucit_id, company_id, ...faktura } = data;
    const { blok, mozna } = await najdiUlozenuPrijatu(
      context.supabase as any,
      company_id,
      { ...faktura, type: faktura.type || "regular", status: "received" },
      vylucit_id ?? null,
    );
    return {
      blok: blok ? { id: String(blok.id), popis: popisPrijatej(blok) } : null,
      mozna: mozna ? { id: String(mozna.id), popis: popisPrijatej(mozna), text: textMoznejDuplicity(mozna) } : null,
    };
  });
