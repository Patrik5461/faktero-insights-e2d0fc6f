import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Verejné volania pre odberateľa — bez prihlásenia.
 *
 * Jedinou ochranou je náhodný token v odkaze, preto sa ním hľadá presne jeden
 * doklad a von ide len to, čo odberateľ aj tak dostal v PDF. Interné polia
 * (id firmy, interné poznámky, marže) sa neposielajú.
 */

const Token = z.object({ token: z.string().min(20).max(200) });

export const ponukaPodlaTokenuFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => Token.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { prekazkaOdpovede } = await import("./ponuka-odpoved");

    const { data: q } = await supabaseAdmin
      .from("quotes")
      .select(
        "id, company_id, quote_number, status, issue_date, valid_until, currency, subtotal, vat_total, total, notes, customer_name, responded_at, response_note, pdf_url",
      )
      .eq("approval_token", data.token)
      .maybeSingle();
    if (!q) throw new Error("Neplatný odkaz — ponuka sa nenašla.");

    const [{ data: polozky }, { data: firma }] = await Promise.all([
      supabaseAdmin
        .from("quote_items")
        .select("name, description, quantity, unit, unit_price, vat_rate, total")
        .eq("quote_id", q.id)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("companies")
        .select("name, street, city, zip, country, ico, dic, ic_dph, email, phone")
        .eq("id", q.company_id)
        .maybeSingle(),
    ]);

    // Odkaz na PDF platí hodinu — dosť na pozretie, málo na rozposielanie ďalej.
    let pdf: string | null = null;
    if (q.pdf_url) {
      const { data: odkaz } = await supabaseAdmin.storage
        .from("invoice-pdfs")
        .createSignedUrl(q.pdf_url, 3600);
      pdf = odkaz?.signedUrl ?? null;
    }

    const { company_id: _skryte, pdf_url: _cesta, id: _id, ...ponuka } = q as any;
    return {
      ponuka,
      polozky: polozky ?? [],
      firma,
      pdf,
      prekazka: prekazkaOdpovede({
        stav: q.status as any,
        platiDo: q.valid_until,
        respondedAt: q.responded_at,
      }),
    };
  });

export const odpovedzNaPonukuFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    Token.extend({
      akcia: z.enum(["prijat", "zamietnut"]),
      dovod: z.string().max(2000).optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { prekazkaOdpovede, stavPoOdpovedi, upravDovod } = await import("./ponuka-odpoved");
    const { oznamOdpoved } = await import("./ponuka-odpoved.server");

    const { data: q } = await supabaseAdmin
      .from("quotes")
      .select("id, company_id, quote_number, status, valid_until, total, currency, customer_name")
      .eq("approval_token", data.token)
      .maybeSingle();
    if (!q) throw new Error("Neplatný odkaz — ponuka sa nenašla.");

    const prekazka = prekazkaOdpovede({ stav: q.status as any, platiDo: q.valid_until });
    if (prekazka) throw new Error(prekazka.text);

    const prijate = data.akcia === "prijat";
    const dovod = prijate ? null : upravDovod(data.dovod);
    const { error } = await supabaseAdmin
      .from("quotes")
      .update({
        status: stavPoOdpovedi(data.akcia) as any,
        responded_at: new Date().toISOString(),
        response_note: dovod,
      })
      .eq("id", q.id);
    if (error) throw new Error(error.message);

    const { data: firma } = await supabaseAdmin
      .from("companies")
      .select("name, email")
      .eq("id", q.company_id)
      .maybeSingle();
    await oznamOdpoved({ ponuka: q as any, firma, prijate, dovod });

    return { prijate, stav: stavPoOdpovedi(data.akcia) };
  });
