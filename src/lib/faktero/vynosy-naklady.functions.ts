import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Vstup = z
  .object({
    companyId: z.string().uuid(),
    od: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    do: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((v) => v.od <= v.do, "Začiatok obdobia je po jeho konci.");

/**
 * Výnosy a náklady firmy po mesiacoch za obdobie od–do.
 *
 * Číta klientom prihláseného (RLS, `mfa_ok`, vlastný prístup po tabuľkách),
 * nie servisným kľúčom — kto nevidí prijaté faktúry, nemá ich ani v súčte.
 * Riadky po stránkach, lebo PostgREST vráti najviac 1 000 na dotaz a rok
 * väčšej firmy má faktúr viac. Agregácia je v `vynosy-naklady.ts`.
 */
export const nacitajVynosyNaklady = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Vstup.parse(d))
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    const { vsetkyRiadky } = await import("./strankovanie");
    const { domacaMena } = await import("./kurzy");
    const { spocitajVynosyNaklady } = await import("./vynosy-naklady");
    const sb = context.supabase as any;
    const cid = data.companyId;
    await overPristup(context, cid);

    // Najviac päť rokov naraz — dlhšie obdobie sa na prehľade nedá ani prečítať.
    const roky = Number(data.do.slice(0, 4)) - Number(data.od.slice(0, 4));
    if (roky > 5) throw new Error("Obdobie môže mať najviac päť rokov.");

    const [firma, faktury, prijate, blocky] = await Promise.all([
      sb.from("companies").select("country").eq("id", cid).maybeSingle(),
      vsetkyRiadky((z, k) =>
        sb
          .from("invoices")
          .select(
            "id, type, status, currency, total, subtotal, total_eur, subtotal_eur, issue_date, paid_at, deleted_at",
          )
          .eq("company_id", cid)
          .is("deleted_at", null)
          .gte("issue_date", data.od)
          .lte("issue_date", data.do)
          .order("id")
          .range(z, k),
      ),
      /* Prijatá patrí do mesiaca dodania, bez neho do mesiaca vystavenia. */
      vsetkyRiadky((z, k) =>
        sb
          .from("purchase_invoices")
          .select(
            "id, type, status, currency, amount_total, amount_without_vat, amount_without_vat_eur, vat_amount_eur, issue_date, delivery_date, deleted_at",
          )
          .eq("company_id", cid)
          .is("deleted_at", null)
          .or(
            `and(delivery_date.gte.${data.od},delivery_date.lte.${data.do}),and(delivery_date.is.null,issue_date.gte.${data.od},issue_date.lte.${data.do})`,
          )
          .order("id")
          .range(z, k),
      ),
      vsetkyRiadky((z, k) =>
        sb
          .from("expense_documents")
          .select("id, currency, net_amount, total_amount, vat_amount, issue_date")
          .eq("company_id", cid)
          .gte("issue_date", data.od)
          .lte("issue_date", data.do)
          .order("id")
          .range(z, k),
      ),
    ]);
    if (firma.error) throw new Error(firma.error.message);

    return spocitajVynosyNaklady({
      faktury,
      prijate,
      blocky,
      domaca: domacaMena(firma.data?.country),
      od: data.od,
      do: data.do,
    });
  });
