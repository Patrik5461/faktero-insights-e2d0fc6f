import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Je už táto prijatá faktúra v evidencii alebo v Nespracovaných? */
export const najdiDuplicituPrijatejFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        invoice_number: z.string().nullable().optional(),
        supplier_ico: z.string().nullable().optional(),
        supplier_name: z.string().nullable().optional(),
        supplier_iban: z.string().nullable().optional(),
        amount_total: z.number().nullable().optional(),
        /** Pri úprave — samu seba nehľadať. */
        vylucit_id: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { najdiDuplicituPrijatej } = await import("./prijate-duplicity.server");
    return najdiDuplicituPrijatej(context.supabase as any, data.company_id, data, {
      prijataId: data.vylucit_id ?? null,
    });
  });
