/*
  Výpis z Banky → Výpisy ako dávka pre POHODU (Súbor → Dátová komunikácia →
  XML import), nie ako camt.053.

  Prečo: camt.053, ktorý Faktero zostavuje pre účty mimo Tatra banky (VÚB,
  SLSP…), POHODA načíta, no každej platbe dá dátum konca obdobia výpisu —
  pri výpisoch z Tatra banky to nerobí a zverejnené nie je, z čoho dátum berie.
  V dávke má každý pohyb vlastný `bnk:datePayment`, ktorý POHODA číta naisto.
*/
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { overPristup } from "./over-pristup";

/** IBAN bez medzier a veľkými písmenami — na porovnanie účtov. */
const normIban = (v: unknown) => String(v ?? "").replace(/\s+/g, "").toUpperCase();

/**
 * Skratka účtu v POHODE z Firma → Bankové účty (`company_bank_accounts.pohoda_skratka`)
 * pre účet, z ktorého je výpis — tá istá, s ktorou idú faktúry.
 */
async function skratkaUctu(supabaseAdmin: any, companyId: string, iban: string | null) {
  if (!iban) return null;
  const { data } = await supabaseAdmin
    .from("company_bank_accounts")
    .select("id, iban, pohoda_skratka")
    .eq("company_id", companyId);
  const riadok = (data ?? []).find((r: any) => normIban(r.iban) === normIban(iban));
  return riadok ? { id: riadok.id as string, skratka: (riadok.pohoda_skratka as string | null) ?? null } : null;
}

/** Predvolená skratka účtu v POHODE pre okno pred stiahnutím. */
export const skratkaUctuPohodyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { company_id: string; bank_account_id: string }) => d)
  .handler(async ({ data, context }): Promise<{ skratka: string | null }> => {
    await overPristup(context as never, data.company_id, { oblast: "banka" });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ucet } = await supabaseAdmin
      .from("bank_accounts")
      .select("company_id, iban")
      .eq("id", data.bank_account_id)
      .maybeSingle();
    if (!ucet || ucet.company_id !== data.company_id) return { skratka: null };
    const r = await skratkaUctu(supabaseAdmin, data.company_id, ucet.iban);
    return { skratka: r?.skratka ?? null };
  });

export const vypisPreXmlImportPohodyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: { company_id: string; statement_id: string; banka?: string | null }) => {
      if (!d?.company_id || !d?.statement_id) throw new Error("Chýba výpis.");
      return d;
    },
  )
  .handler(
    async ({ data, context }): Promise<{ fileName: string; content: string; pocet: number; uzOdoslanych: number }> => {
    await overPristup(context as never, data.company_id, { oblast: "banka" });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: vypis, error: e1 } = await supabaseAdmin
      .from("bank_statements")
      .select("bank_account_id, period_start, period_end")
      .eq("id", data.statement_id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!vypis) throw new Error("Výpis sa nenašiel.");

    const { data: ucet, error: e2 } = await supabaseAdmin
      .from("bank_accounts")
      .select("id, company_id, iban, currency")
      .eq("id", vypis.bank_account_id)
      .maybeSingle();
    if (e2) throw new Error(e2.message);
    // Výpis cudzej firmy sa správa ako neexistujúci.
    if (!ucet || ucet.company_id !== data.company_id) throw new Error("Výpis sa nenašiel.");

    const { data: company, error: e3 } = await supabaseAdmin
      .from("companies")
      .select("*")
      .eq("id", data.company_id)
      .maybeSingle();
    if (e3) throw new Error(e3.message);

    /*
      Skratka účtu v POHODE: zadaná pri stiahnutí, inak z Firma → Bankové účty.
      Bez bnk:account vezme POHODA účet z nastavenia používateľa (bank.xsd) — tak
      skončili pohyby z VÚB pod Tatra bankou. Zadaná sa uloží k účtu firmy,
      aby ju nabudúce poznali aj faktúry a ďalšie výpisy.
    */
    const ulozena = await skratkaUctu(supabaseAdmin, data.company_id, ucet.iban);
    const banka = String(data.banka ?? "").trim() || ulozena?.skratka || "";
    if (!banka) {
      throw new Error(
        "Zadajte skratku bankového účtu v POHODE (Nastavenie → Bankové účty), inak POHODA dá pohyby na predvolený účet.",
      );
    }
    if (ulozena && ulozena.skratka !== banka) {
      const { error } = await supabaseAdmin
        .from("company_bank_accounts")
        .update({ pohoda_skratka: banka })
        .eq("id", ulozena.id)
        .eq("company_id", data.company_id);
      if (error) console.error("[vypis-pohoda-xml] skratka sa neuložila", error.message);
    }

    const { vsetkyRiadky } = await import("./strankovanie");
    const txs = await vsetkyRiadky<any>((zac, kon) =>
      supabaseAdmin
        .from("bank_transactions")
        .select("id, booking_date, amount, currency, variable_symbol, counterparty, counterparty_iban, description")
        .eq("bank_account_id", ucet.id)
        .gte("booking_date", vypis.period_start)
        .lte("booking_date", vypis.period_end)
        .order("booking_date", { ascending: true })
        .order("id", { ascending: true })
        .range(zac, kon),
    );
    if (!txs.length) throw new Error("Za toto obdobie nie je na účte ani jeden pohyb.");

    /*
      Mapovanie pohybov a XML sú spoločné s konektorom a mesačným balíkom
      (`banka-pohoda.server.ts`) — ten istý pohyb má všade to isté id aj obsah.
    */
    const { pravidlaBanky, xmlVypisuPrePohodu } = await import("./banka-pohoda.server");
    const content = await xmlVypisuPrePohodu({
      company,
      ucet,
      txs,
      pravidla: await pravidlaBanky(supabaseAdmin, data.company_id),
      banka,
      periodEnd: vypis.period_end,
    });

    /*
      Pohyby, ktoré už odišli konektorom alebo balíkom (`exported_at`). Súbor
      sa aj tak vydá — POHODA ten istý pohyb (rovnaké id) odmietne ako
      duplicitu —, len sa to povie. Bez migrácie stĺpca sa nepočíta nič.
    */
    let uzOdoslanych = 0;
    {
      const { count, error } = await supabaseAdmin
        .from("bank_transactions")
        .select("id", { count: "exact", head: true })
        .eq("bank_account_id", ucet.id)
        .gte("booking_date", vypis.period_start)
        .lte("booking_date", vypis.period_end)
        .not("exported_at", "is", null);
      if (!error) uzOdoslanych = count ?? 0;
    }

    const obdobie = String(vypis.period_start).slice(0, 7);
    const koniec = String(ucet.iban ?? "").replace(/\s+/g, "").slice(-4);
    return { fileName: `pohoda-vypis-${obdobie}-${koniec}.xml`, content, pocet: txs.length, uzOdoslanych };
  });
