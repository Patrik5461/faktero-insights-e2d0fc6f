import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TABULKA = {
  nespracovany: "nespracovane_doklady",
  prijata: "purchase_invoices",
  doklad: "expense_documents",
  ostatny: "other_documents",
} as const;

export type ZdrojovyMail = {
  od: string | null;
  komu: string | null;
  predmet: string | null;
  prijate: string | null;
  text: string | null;
};

/**
 * Mail, s ktorým doklad prišiel. Číta sa klientom volajúceho, takže doklad aj
 * mail musí smieť vidieť (RLS) — cudzí mail sa takto nedá vypýtať.
 */
export const zdrojovyMailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        druh: z.enum(["nespracovany", "prijata", "doklad", "ostatny"]),
        id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<ZdrojovyMail | null> => {
    const supabase = context.supabase as any;
    const { data: r } = await supabase
      .from(TABULKA[data.druh])
      .select("inbox_message_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!r?.inbox_message_id) return null;
    const { data: m } = await supabase
      .from("inbox_messages")
      .select("from_email, to_email, subject, received_at, text_mailu")
      .eq("id", r.inbox_message_id)
      .maybeSingle();
    if (!m) return null;
    return {
      od: m.from_email ?? null,
      komu: m.to_email ?? null,
      predmet: m.subject ?? null,
      prijate: m.received_at ?? null,
      text: m.text_mailu ?? null,
    };
  });
