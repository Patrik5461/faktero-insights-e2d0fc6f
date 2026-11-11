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
import type { VypisPohyb } from "./export.server";

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
  .handler(async ({ data, context }): Promise<{ fileName: string; content: string; pocet: number }> => {
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
      .select("id, company_id, iban")
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
        .select("booking_date, amount, variable_symbol, counterparty, counterparty_iban, description")
        .eq("bank_account_id", ucet.id)
        .gte("booking_date", vypis.period_start)
        .lte("booking_date", vypis.period_end)
        .order("booking_date", { ascending: true })
        .order("id", { ascending: true })
        .range(zac, kon),
    );
    if (!txs.length) throw new Error("Za toto obdobie nie je na účte ani jeden pohyb.");

    const { pravidloPohybu } = await import("./pravidla-uctovania");
    const { data: pravidla } = await supabaseAdmin
      .from("pravidla_uctovania")
      .select("*")
      .eq("company_id", data.company_id)
      .eq("druh", "banka")
      .eq("aktivne", true);

    const pohyby: VypisPohyb[] = txs.map((t) => {
      const popis = String(t.description ?? "");
      // Pohyby z bankových notifikácií majú IBAN protistrany len v texte („… · IBAN SK…“).
      const ibanZTextu = /IBAN\s+([A-Z]{2}\d{2}[0-9A-Z ]{10,36})\s*$/i.exec(popis)?.[1] ?? null;
      const p: VypisPohyb = {
        datum: t.booking_date,
        suma: Math.abs(Number(t.amount)),
        smer: Number(t.amount) < 0 ? "vydaj" : "prijem",
        popis: popis.replace(/\s*·\s*IBAN\s+[A-Z]{2}[0-9A-Z ]{10,40}\s*$/i, "").trim() || null,
        protistrana: t.counterparty ?? null,
        protiucet: (t.counterparty_iban ?? ibanZTextu)?.replace(/\s+/g, "") ?? null,
        vs: t.variable_symbol ?? null,
      };
      const r = pravidloPohybu((pravidla ?? []) as any[], p, ucet.iban);
      return { ...p, predkontacia: r ? (r as { predkontacia: string }).predkontacia : null };
    });

    const { buildPohodaBankXml } = await import("./export.server");
    const content = buildPohodaBankXml({
      company: company as never,
      pohyby,
      datumVypisu: vypis.period_end,
      nastavenia: {
        // Skratka bankového účtu v POHODE; bez nej by POHODA dala pohyby na predvolený účet.
        banka,
        /*
          Bez bnk:accounting vezme POHODA predkontáciu z nastavenia používateľa,
          pod ktorým beží import (bank.xsd) — nie z bankového účtu. Preto ide
          predkontácia banky z nastavení firmy pre POHODU; pravidlo pohybu má prednosť.
        */
        predkontaciaBanka: String((company as any)?.pohoda_predkontacia_banka ?? "").trim() || null,
        predkontacieOznaceni: ((company as any)?.pohoda_predkontacie_oznaceni ?? {}) as Record<string, string>,
      },
    });

    const obdobie = String(vypis.period_start).slice(0, 7);
    const koniec = String(ucet.iban ?? "").replace(/\s+/g, "").slice(-4);
    return { fileName: `pohoda-vypis-${obdobie}-${koniec}.xml`, content, pocet: pohyby.length };
  });
