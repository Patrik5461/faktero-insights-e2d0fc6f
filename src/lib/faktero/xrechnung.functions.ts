import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * XRechnung (XML) k faktúre nemeckej firmy na stiahnutie.
 *
 * Skladá sa na serveri cez klienta prihláseného človeka — čo smie vidieť,
 * rozhoduje RLS. Keď faktúre chýba niečo, bez čoho XRechnung neprejde
 * kontrolou príjemcu (telefón firmy, e-mail odberateľa…), XML sa nevydá a
 * vrátia sa chyby — odoslať neplatnú e-faktúru je horšie ako žiadnu.
 */
const Vstup = z.object({
  company_id: z.string().uuid(),
  invoice_id: z.string().uuid(),
});

export const xrechnungFakturyFn = createServerFn({ method: "POST" })
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

    const { nacitajPodkladyFaktury } = await import("./efaktura-de-podklady.server");
    const { generateXRechnung } = await import("./xrechnung.server");
    const podklady = await nacitajPodkladyFaktury(supabase, data.company_id, data.invoice_id);
    const r = generateXRechnung(podklady);
    const cislo = String(podklady.invoice.invoice_number ?? "rechnung").replace(/[^\w.-]+/g, "_");
    return {
      nazovSuboru: `${cislo}_xrechnung.xml`,
      xml: r.valid ? r.xml : null,
      chyby: r.validationErrors.map((c) => ({ kod: c.code, sprava: c.message })),
    };
  });
