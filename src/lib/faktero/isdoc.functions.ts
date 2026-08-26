import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildIsdoc } from "./isdoc-export";

/**
 * Faktúra v ISDOC-u.
 *
 * Formát sa skladá na serveri, nie v prehliadači: údaje firmy aj odberateľa
 * sa čítajú cez klienta prihláseného človeka, takže o tom, čo smie vidieť,
 * rozhoduje RLS a nie to, čo si pýta stránka.
 */
const Vstup = z.object({
  company_id: z.string().uuid(),
  invoice_id: z.string().uuid(),
});

export const isdocFakturyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof Vstup>) => Vstup.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: clen } = await supabase
      .from("company_users")
      .select("user_id")
      .eq("company_id", data.company_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!clen) throw new Error("Forbidden");

    const { data: invoice } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", data.invoice_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!invoice) throw new Error("Faktúra sa nenašla.");

    const [{ data: items }, { data: company }] = await Promise.all([
      supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", data.invoice_id)
        .order("position", { ascending: true }),
      supabase.from("companies").select("*").eq("id", data.company_id).single(),
    ]);

    /*
      Karta odberateľa sa berie, keď ešte existuje — má úplnejšiu adresu než
      odpis na faktúre. Keď je zmazaná, doklad ostáva platný z vlastných polí.
    */
    let customer = null;
    if (invoice.customer_id) {
      const { data: c } = await supabase
        .from("customers")
        .select("*")
        .eq("id", invoice.customer_id)
        .maybeSingle();
      customer = c ?? null;
    }

    return {
      nazovSuboru: `${String(invoice.invoice_number ?? "faktura").replace(/[^\w.-]+/g, "_")}.isdoc`,
      xml: buildIsdoc({ invoice, items: items ?? [], company, customer }),
    };
  });
