/**
 * Výpis z bankových pohybov na požiadanie — PDF aj camt.053 XML za zvolený
 * mesiac, pre akýkoľvek účet firmy (VÚB, SLSP, … aj Tatra banka).
 *
 * Nočný beh (`generateOwnStatements`) zostavuje výpisy len tam, kde banka
 * odmietla, a len za celé obdobie. Účet pripojený uprostred mesiaca by tak
 * za ten mesiac výpis nedostal nikdy; tu vznikne aspoň čiastočný, od
 * najstaršieho pohybu, a povie to o sebe v PDF aj v XML.
 *
 * Pozor: z tohto súboru sa exportujú len `createServerFn` — obyčajný export
 * by do prehliadača pritiahol serverový kód a zhodil build.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Vstup = z.object({
  company_id: z.string().uuid(),
  bank_account_id: z.string().uuid(),
  mesiac: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

async function overClena(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase
    .from("company_users")
    .select("user_id, role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

/** "2026-10" → prvý a posledný deň; aktuálny mesiac končí dneškom. */
function obdobieMesiaca(mesiac: string, dnes: string): { start: string; end: string } {
  const [y, m] = mesiac.split("-").map(Number);
  const start = `${mesiac}-01`;
  const posledny = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  if (posledny < dnes) return { start, end: posledny };
  /*
    Bežiaci mesiac končí dneškom — v jeho posledný deň včerajškom. Výpis
    s koncom v posledný deň mesiaca by mal rovnaký kľúč ako mesačný výpis
    od banky a nočný beh by si ho od Tatra banky už nevypýtal.
  */
  if (dnes === posledny) {
    const vcera = new Date(Date.UTC(y, m - 1, Number(dnes.slice(8, 10)) - 1)).toISOString().slice(0, 10);
    return { start, end: vcera < start ? start : vcera };
  }
  return { start, end: dnes };
}

export const zostavVypisZTransakciiFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Vstup.parse(d))
  .handler(async ({ data, context }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const own = await import("./bank-statements-own.server");

    const { data: ucet } = await supabaseAdmin
      .from("bank_accounts")
      .select("id, company_id")
      .eq("id", data.bank_account_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!ucet) throw new Error("Účet nepatrí tejto firme.");

    const dnes = new Date().toISOString().slice(0, 10);
    if (`${data.mesiac}-01` > dnes) throw new Error("Výpis za budúci mesiac sa zostaviť nedá.");
    const { start, end } = obdobieMesiaca(data.mesiac, dnes);

    /*
      Výpis od banky má prednosť — ten nikdy neprepíšeme. Rozrobený od banky
      tiež nie, nočný beh by ho o chvíľu dokončil a dva výpisy za mesiac by
      sa v zozname bili.
    */
    const { data: existujuce } = await supabaseAdmin
      .from("bank_statements")
      .select("id, period_end, export_type, status, source")
      .eq("bank_account_id", data.bank_account_id)
      .eq("period_start", start);
    const riadky = (existujuce ?? []) as Array<{
      id: string;
      period_end: string;
      export_type: string;
      status: string;
      source: string | null;
    }>;
    const odBanky = riadky.filter((r) => (r.source ?? "bank") === "bank");
    if (odBanky.some((r) => r.status === "ready")) throw new Error("Za tento mesiac je výpis od banky.");
    if (odBanky.some((r) => r.status === "pending"))
      throw new Error("Banka výpis za tento mesiac ešte pripravuje.");

    const zost = await own.zostavVypisUctu(supabaseAdmin, data.bank_account_id, start, end, {
      ciastocny: true,
    });
    if (!zost.ok) throw new Error("Za tento mesiac nemá Faktero z účtu žiadne pohyby.");

    const subory: Array<{ typ: "PDF" | "XML"; path: string; size: number }> = [];
    for (const typ of ["PDF", "XML"] as const) {
      const bytes = await own.suborVypisu(zost.input, typ);
      const path = own.cestaVlastnehoVypisu(data.company_id, data.bank_account_id, start, typ);
      const { error } = await supabaseAdmin.storage.from(own.BUCKET_VYPISOV).upload(path, bytes, {
        contentType: typ === "PDF" ? "application/pdf" : "application/xml",
        upsert: true,
      });
      if (error) throw new Error(`Nahratie výpisu zlyhalo: ${error.message}`);
      subory.push({ typ, path, size: bytes.length });
    }

    /*
      Výpis za bežiaci mesiac končí dneškom, takže zajtra by vznikol ďalší
      riadok s iným koncom (unikátny kľúč obsahuje `period_end`). Starší
      vlastný riadok za ten istý mesiac, aj odmietnutý alebo zlyhaný pokus,
      preto ustúpi — súbor je ten istý, práve prepísaný.
    */
    const stare = riadky
      .filter(
        (r) =>
          r.period_end !== end &&
          (r.source === "faktero" || r.status === "unsupported" || r.status === "failed"),
      )
      .map((r) => r.id);
    if (stare.length) await supabaseAdmin.from("bank_statements").delete().in("id", stare);

    const teraz = new Date().toISOString();
    const { data: ulozene, error: upErr } = await supabaseAdmin
      .from("bank_statements")
      .upsert(
        subory.map((s) => ({
          company_id: data.company_id,
          bank_account_id: data.bank_account_id,
          period_start: start,
          period_end: end,
          export_type: s.typ,
          status: "ready",
          source: "faktero",
          storage_path: s.path,
          file_size: s.size,
          error: null,
          updated_at: teraz,
        })) as any,
        { onConflict: "bank_account_id,period_start,period_end,export_type" },
      )
      .select("id");
    if (upErr) throw new Error(`Uloženie výpisu zlyhalo: ${upErr.message}`);

    return {
      ids: (ulozene ?? []).map((r: any) => r.id as string),
      obdobie: { start: zost.input.periodStart, end },
      ciastocny_od: zost.ciastocnyOd,
      pocet_pohybov: zost.input.transactions.length,
    };
  });
