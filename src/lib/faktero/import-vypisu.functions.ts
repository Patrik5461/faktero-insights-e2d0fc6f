import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rozberVypis, rovnakyUcet } from "./import-vypisu";
import { vlozPohyby } from "./bank-sync.server";

/**
 * Nahranie bankového výpisu zo súboru.
 *
 * Pre banky, ku ktorým Faktero priamy prístup nemá — Akcenta a spol. pustia
 * tretiu stranu k účtu len s licenciou AISP. Výpis si klient stiahne sám a
 * ďalej sa s pohybmi pracuje presne tak, ako keby prišli zo synchronizácie:
 * to isté čítanie (`vypis-xml`), ten istý zápis (`vlozPohyby`), tá istá
 * ochrana proti duplicitám.
 *
 * Rozdelené na dva kroky zámerne: prvý súbor len prečíta a povie, čo v ňom je,
 * druhý zapisuje. Nahrať výpis do cudzieho účtu je chyba, ktorú si človek
 * všimne až pri párovaní — nech ju teda vidí predtým, než klikne.
 */

const CitanieVstup = z.object({
  company_id: z.string().uuid(),
  obsah: z.string().min(1).max(20_000_000),
});

const ImportVstup = CitanieVstup.extend({
  /** Existujúci účet, alebo `null` a účet sa založí z výpisu. */
  bank_account_id: z.string().uuid().nullable(),
});

async function overClena(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase
    .from("company_users")
    .select("user_id, role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
  return data.role as string;
}

async function ucetFirmy(supabase: any, companyId: string, uctuId: string) {
  const { data: ucet } = await supabase
    .from("bank_accounts")
    .select("id, iban, currency, account_name, company_id")
    .eq("id", uctuId)
    .maybeSingle();
  /*
    Bez kontroly firmy by sa dal výpis nahrať do účtu cudzej firmy: členstvo
    sa overuje voči `company_id` z požiadavky, ktorý si posiela klient, a ten
    by inak stačilo spárovať s cudzím `bank_account_id`.
  */
  if (!ucet || ucet.company_id !== companyId) throw new Error("Účet sa nenašiel.");
  return ucet;
}

function precitaj(obsah: string, mena?: string | null) {
  try {
    return rozberVypis(obsah, mena);
  } catch {
    throw new Error(
      "Súbor sa nepodarilo prečítať. Čaká sa výpis v XML (camt.053) — v banke býva ako „SEPA XML“, „XML výpis“ alebo „ISO 20022“.",
    );
  }
}

export const rozberVypisFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof CitanieVstup>) => CitanieVstup.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await overClena(supabase, userId, data.company_id);
    const r = precitaj(data.obsah);
    if (r.pohyby.length === 0) throw new Error("Vo výpise nie je ani jeden pohyb.");

    // Účet, ktorý výpisu zodpovedá — nech si ho človek nemusí hľadať sám.
    const { data: ucty } = await supabase
      .from("bank_accounts")
      .select("id, iban, currency, account_name")
      .eq("company_id", data.company_id);
    const sediaci = (ucty ?? []).find((u: any) => rovnakyUcet(r.ucet, u.iban)) ?? null;

    return {
      format: r.format,
      ucetVoVypise: r.ucet,
      mena: r.mena,
      odDna: r.odDna,
      doDna: r.doDna,
      pocet: r.pohyby.length,
      prijem: r.pohyby.filter((p) => p.amount > 0).reduce((s, p) => s + p.amount, 0),
      vydaj: r.pohyby.filter((p) => p.amount < 0).reduce((s, p) => s + p.amount, 0),
      konecnyZostatok: r.konecnyZostatok,
      navrhnutyUcetId: sediaci?.id ?? null,
      navrhnutyUcetNazov: sediaci ? (sediaci.account_name ?? sediaci.iban) : null,
      varovanie: r.varovanie,
    };
  });

export const importujVypisFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof ImportVstup>) => ImportVstup.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const rola = await overClena(supabase, userId, data.company_id);
    // Pohyby sú účtovný záznam; kto smie viesť doklady, smie ich aj nahrať.
    if (rola === "viewer") throw new Error("Na nahranie výpisu nemáte oprávnenie.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let ucet: any;
    if (data.bank_account_id) {
      ucet = await ucetFirmy(supabase, data.company_id, data.bank_account_id);
    } else {
      /*
        Účet z výpisu. Banka, ku ktorej sa Faktero nepripojí, žiadny účet
        nezaloží — a `bank_accounts.bank_connection_id` je povinné, takže
        nahranému výpisu treba vlastné „pripojenie“. Je len obalom: nemá token
        ani súhlas a nočná synchronizácia ho obchádza (berie `tatrabanka`).
      */
      const r0 = precitaj(data.obsah);
      if (!r0.ucet) {
        throw new Error("Vo výpise nie je číslo účtu — vyberte účet, do ktorého sa má nahrať.");
      }
      const { data: spojenie, error: e1 } = await supabaseAdmin
        .from("bank_connections")
        .insert({
          company_id: data.company_id,
          provider: "import",
          status: "connected",
          metadata: { zdroj: "nahraty-vypis" },
        })
        .select("id")
        .single();
      if (e1) throw new Error(e1.message);

      const { data: novy, error: e2 } = await supabaseAdmin
        .from("bank_accounts")
        .insert({
          company_id: data.company_id,
          bank_connection_id: spojenie.id,
          iban: r0.ucet,
          account_name: r0.ucet,
          currency: (r0.mena ?? "EUR").toUpperCase(),
          balance: r0.konecnyZostatok ?? 0,
          booked_balance: r0.konecnyZostatok ?? null,
        })
        .select("id, iban, currency")
        .single();
      if (e2) throw new Error(e2.message);
      ucet = novy;
    }

    const r = precitaj(data.obsah, ucet.currency);
    if (r.pohyby.length === 0) throw new Error("Vo výpise nie je ani jeden pohyb.");

    const riadky = r.pohyby.map((p) => ({
      company_id: data.company_id,
      bank_account_id: ucet.id,
      ...p,
    }));
    // Ten istý zápis, aký používa nočná synchronizácia: preskočí duplicity a
    // nezhodí celý import kvôli jednému pohybu, ktorý tam už je.
    const vlozenych = await vlozPohyby(supabaseAdmin, riadky);

    return {
      vlozenych,
      preskocenych: riadky.length - vlozenych,
      ucetId: ucet.id,
      odDna: r.odDna,
      doDna: r.doDna,
    };
  });
