import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Predĺženie splatnosti vydanej alebo prijatej faktúry. Ide cez klienta
  prihláseného (RLS, role). Pôvodnú splatnosť zapamätá databáza sama.

  Odoslanú eFaktúru Peppol zmeniť nevie — odberateľovi sa preto môže poslať
  e-mail s potvrdením novej splatnosti.
*/

const Vstup = z.object({
  druh: z.enum(["vydana", "prijata"]),
  id: z.string().uuid(),
  nova: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  poznamka: z.string().trim().max(500).optional(),
  oznamit: z.boolean().optional(),
});

export const predlzSplatnostFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Vstup.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const tabulka = data.druh === "vydana" ? "invoices" : "purchase_invoices";
    const { data: f } = await supabase
      .from(tabulka)
      .select(
        data.druh === "vydana"
          ? "id, company_id, invoice_number, due_date, issue_date, status, total, currency, customer_name, customer_email, povodna_splatnost"
          : "id, company_id, invoice_number, due_date, issue_date, status, povodna_splatnost",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (!f) throw new Error("Faktúra sa nenašla.");
    if (f.status === "draft") throw new Error("Pri koncepte splatnosť jednoducho upravte.");
    if (f.status === "paid") throw new Error("Faktúra je zaplatená — splatnosť už nemá zmysel meniť.");
    if (data.nova < String(f.issue_date)) throw new Error("Splatnosť nemôže byť pred dátumom vystavenia.");
    if (data.nova === f.due_date) throw new Error("Nová splatnosť je rovnaká ako doterajšia.");

    const { error } = await supabase
      .from(tabulka)
      .update({ due_date: data.nova, predlzenie_poznamka: data.poznamka?.trim() || null })
      .eq("id", f.id);
    if (error) throw new Error(error.message);

    let oznamene = false;
    if (data.druh === "vydana" && data.oznamit) {
      if (!f.customer_email) throw new Error("Splatnosť je zmenená, ale odberateľ nemá e-mail — oznámte mu to inak.");
      const { posliOznamenieSplatnosti } = await import("./splatnost.server");
      await posliOznamenieSplatnosti({ f, nova: data.nova, poznamka: data.poznamka ?? null });
      oznamene = true;
    }
    const { data: ef } = data.druh === "vydana"
      ? await supabase.from("efaktura_documents").select("id").eq("invoice_id", f.id).limit(1)
      : { data: [] };
    return { oznamene, efaktura: Boolean(ef?.length), povodna: f.povodna_splatnost ?? f.due_date };
  });
