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
