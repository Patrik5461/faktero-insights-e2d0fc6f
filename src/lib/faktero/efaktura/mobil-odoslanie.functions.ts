import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Odoslanie eFaktúry z mobilnej appky — príprava pred oknom potvrdenia.

  Web si to isté skladá z troch volaní (režim, doklad + doručenie, kontrola
  pred odoslaním). Appka je na mobilnom spojení, tak to dostane naraz, ale
  z tých istých kúskov: `jeEfakturaAktivovana` (oznam o e-fakturácii),
  `nacitajAKontrolujFakturu` (okno odoslania na webe) a `jeTestovaciRezim`.
  Samotné odoslanie ide cez `posliEfakturuFn` — tú istú funkciu ako web.
*/

const Vstup = z.object({
  company_id: z.string().uuid(),
  invoice_id: z.string().uuid(),
});

export const pripravOdoslanieEfakturyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Vstup.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    const { overPristup } = await import("../over-pristup");
    await overPristup(ctx, data.company_id);
    const sb = ctx.supabase;

    const [{ data: profil }, { data: doklad }] = await Promise.all([
      sb
        .from("efaktura_profiles")
        .select("enabled, epostak_firm_id")
        .eq("company_id", data.company_id)
        .maybeSingle(),
      sb
        .from("efaktura_documents")
        .select("id")
        .eq("company_id", data.company_id)
        .eq("invoice_id", data.invoice_id)
        .maybeSingle(),
    ]);

    const { jeEfakturaAktivovana } = await import("../efaktura-oznam");
    const { jeTestovaciRezim } = await import("./epostak.server");
    const aktivovana = jeEfakturaAktivovana(profil);
    const testovaci = jeTestovaciRezim();

    // Posledné doručenie — rovnako ako detail faktúry na webe.
    let dorucenie: { status: string; sent_at: string | null; delivered_at: string | null } | null =
      null;
    if (doklad?.id) {
      const { data: d } = await sb
        .from("efaktura_deliveries")
        .select("status, sent_at, delivered_at")
        .eq("document_id", doklad.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      dorucenie = d ?? null;
    }

    // Bez aktivácie sa kontrola nerobí — appka aj tak pošle človeka na web.
    if (!aktivovana) return { aktivovana, testovaci, dorucenie, kontrola: null };

    const { nacitajAKontrolujFakturu } = await import("./kontrola-odoslania.server");
    const v = await nacitajAKontrolujFakturu(sb, data.company_id, data.invoice_id);
    if (!v) throw new Error("Faktúra nepatrí tejto firme.");
    if (!v.kontrola) return { aktivovana, testovaci, dorucenie, kontrola: { nedaSa: v.nedaSa } };
    /*
      Nálezy idú do appky už ako text — pravidlá kontroly (a ich popisy) sú
      veľké a do balíčka appky nepatria. Popis je ten istý ako v okne na webe.
    */
    const { textNalezu } = await import("./kontrola-odoslania");
    const naText = (n: Parameters<typeof textNalezu>[0] & { kod: string }) => ({
      kod: n.kod,
      text: textNalezu(n),
    });
    return {
      aktivovana,
      testovaci,
      dorucenie,
      kontrola: {
        mozno: v.kontrola.mozno,
        chyby: v.kontrola.chyby.map(naText),
        varovania: v.kontrola.varovania.map(naText),
      },
    };
  });
