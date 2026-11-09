import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Splátkový kalendár → Pohoda (Ostatné záväzky): nastavenie zaúčtovania
 * kalendára a splátok a export vybraných splátok.
 *
 * XML zostavuje čistý modul `financovanie-pohoda.ts`; tu sa len načítajú
 * podklady (zmluva, splátky, firma, preklad predkontácií na skratky Pohody)
 * a zapíše, čo sa exportovalo.
 */

async function overClena(ctx: any, companyId: string) {
  const { data } = await ctx.supabase.rpc("is_company_member", {
    _company_id: companyId,
    _user_id: ctx.userId,
  });
  if (!data) throw new Error("Nemáte prístup k firme.");
}

const kod = z.string().trim().max(40).optional().nullable();
const prazdneNaNull = (v: string | null | undefined) => {
  const t = String(v ?? "").trim();
  return t ? t : null;
};

const kodyZlozky = z.object({ predkontacia: kod, clenenie: kod, kv: kod }).optional().nullable();
/** Rozúčtovanie po zložkách splátky; prázdne zložky sa nezapíšu. */
const rozuctovanieSchema = z
  .object({ istina: kodyZlozky, urok: kodyZlozky, poistenie: kodyZlozky, poplatky: kodyZlozky })
  .optional()
  .nullable();
function cisteRozuctovanie(r: z.infer<typeof rozuctovanieSchema>) {
  const out: Record<string, { predkontacia?: string; clenenie?: string; kv?: string }> = {};
  for (const [zlozka, k] of Object.entries(r ?? {})) {
    const predkontacia = prazdneNaNull(k?.predkontacia);
    const clenenie = prazdneNaNull(k?.clenenie);
    const kv = prazdneNaNull(k?.kv);
    if (predkontacia || clenenie || kv)
      out[zlozka] = {
        ...(predkontacia ? { predkontacia } : {}),
        ...(clenenie ? { clenenie } : {}),
        ...(kv ? { kv } : {}),
      };
  }
  return out;
}

/** Chýbajúci stĺpec = migrácia 20261106123915 ešte nie je v databáze. */
function chybaStlpca(chyba: { message?: string; code?: string } | null): boolean {
  return Boolean(chyba && (chyba.code === "42703" || chyba.code === "PGRST204" || /column/i.test(chyba.message ?? "")));
}
const BEZ_MIGRACIE =
  "Zaúčtovanie splátok ešte nie je v databáze zapnuté (chýba migrácia 20261106123915).";

/** Predkontácia, členenie DPH, KV a rad pre celý kalendár. */
export const ulozZauctovanieKalendaraFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        contract_id: z.string().uuid(),
        predkontacia: kod,
        clenenie: kod,
        kv: kod,
        rad: z.string().trim().max(10).optional().nullable(),
        /** Istina, úrok, poistenie a poplatky s vlastnou predkontáciou a členením. */
        rozuctovanie: rozuctovanieSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id);
    const { error } = await (context.supabase as any)
      .from("financing_contracts")
      .update({
        pohoda_predkontacia: prazdneNaNull(data.predkontacia),
        pohoda_clenenie_dph: prazdneNaNull(data.clenenie),
        kv_clenenie: prazdneNaNull(data.kv),
        pohoda_rad: prazdneNaNull(data.rad),
        ...(data.rozuctovanie !== undefined ? { pohoda_rozuctovanie: cisteRozuctovanie(data.rozuctovanie) } : {}),
      })
      .eq("id", data.contract_id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(chybaStlpca(error) ? BEZ_MIGRACIE : error.message);
    return { ok: true };
  });

/**
 * Vlastné kódy vybraných splátok. Prázdna hodnota = „ako kalendár“ (null),
 * takže zmena na kalendári sa na ne znova prenesie.
 */
export const ulozZauctovanieSplatokFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        contract_id: z.string().uuid(),
        installment_ids: z.array(z.string().uuid()).min(1).max(600),
        predkontacia: kod,
        clenenie: kod,
        kv: kod,
        /** Rozúčtovanie zložiek len pre vybrané splátky; prázdne = ako kalendár. */
        rozuctovanie: rozuctovanieSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id);
    const { error, count } = await (context.supabase as any)
      .from("financing_installments")
      .update(
        {
          pohoda_predkontacia: prazdneNaNull(data.predkontacia),
          pohoda_clenenie_dph: prazdneNaNull(data.clenenie),
          kv_clenenie: prazdneNaNull(data.kv),
          ...(data.rozuctovanie !== undefined ? { pohoda_rozuctovanie: cisteRozuctovanie(data.rozuctovanie) } : {}),
        },
        { count: "exact" },
      )
      .eq("company_id", data.company_id)
      .eq("contract_id", data.contract_id)
      .in("id", data.installment_ids);
    if (error) throw new Error(chybaStlpca(error) ? BEZ_MIGRACIE : error.message);
    return { ok: true, zmenene: count ?? data.installment_ids.length };
  });

/**
 * XML Ostatných záväzkov za celý kalendár alebo vybrané splátky.
 *
 * `oznacit` zapíše `exported_at` — ako „Stiahnuť a označiť ako exportované“
 * pri dokladoch. Bez neho je to len náhľad / opakované stiahnutie.
 */
export const exportSplatokDoPohodyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        contract_id: z.string().uuid(),
        /** Prázdne / chýba = celý kalendár. */
        installment_ids: z.array(z.string().uuid()).max(600).optional(),
        oznacit: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id);
    const supabase = context.supabase as any;
    const [{ data: zmluva }, { data: firma }] = await Promise.all([
      supabase
        .from("financing_contracts")
        .select("*")
        .eq("id", data.contract_id)
        .eq("company_id", data.company_id)
        .maybeSingle(),
      supabase
        .from("companies")
        .select("id, ico, country, uctovanie_nastavenia")
        .eq("id", data.company_id)
        .maybeSingle(),
    ]);
    if (!zmluva) throw new Error("Zmluva sa nenašla.");
    if (zmluva.kind === "kontokorent") {
      throw new Error("Kontokorent nemá splátkový kalendár — úroky sa párujú z banky.");
    }
    /*
      Vlastný číselný rad kalendára: splátky, ktoré ešte číslo nemajú (pribudli
      predĺžením kalendára), ho dostanú teraz — pred zostavením XML. Pridelené
      čísla sa nemenia, takže opakovaný export pošle to isté číslo.
    */
    const vyhradyRadu: string[] = [];
    if (zmluva.number_series_id) {
      const { error: eRad } = await supabase.rpc("faktero_cisla_splatok", {
        _company_id: data.company_id,
        _contract_id: data.contract_id,
        _installment_ids: data.installment_ids?.length ? data.installment_ids : null,
      });
      if (eRad) vyhradyRadu.push(`Čísla splátok z vlastného radu sa nepridelili (${eRad.message}) — číslo pridelí Pohoda.`);
    }
    let q = supabase
      .from("financing_installments")
      .select("*")
      .eq("contract_id", data.contract_id)
      .eq("company_id", data.company_id)
      .order("number");
    if (data.installment_ids?.length) q = q.in("id", data.installment_ids);
    const { data: splatky, error } = await q;
    if (error) throw new Error(error.message);
    if (!splatky?.length) throw new Error("Nie je čo exportovať — vyberte aspoň jednu splátku.");

    const [{ xmlSplatokDoPohody, nazovSuboruSplatok }, { doplnkyExportu }, { predkontacieNaSkratky }] =
      await Promise.all([
        import("./financovanie-pohoda"),
        import("./export-nastavenia.server"),
        import("./pohoda-predkontacia"),
      ]);
    const doplnky = firma ? await doplnkyExportu(supabase, firma) : null;
    const vysledok = xmlSplatokDoPohody({
      ico: firma?.ico,
      krajinaFirmy: firma?.country,
      zmluva,
      splatky,
      prelozPredkontacie: (xml) => predkontacieNaSkratky(xml, doplnky?.mapaPredkontacii),
    });
    if (!vysledok.xml) {
      throw new Error(vysledok.vyhrady[0] ?? "Nie je čo exportovať.");
    }
    vysledok.vyhrady.unshift(...vyhradyRadu);

    let oznacene = false;
    if (data.oznacit && vysledok.idSplatok.length) {
      const { error: e } = await supabase
        .from("financing_installments")
        .update({ exported_at: new Date().toISOString() })
        .eq("company_id", data.company_id)
        .in("id", vysledok.idSplatok);
      if (!e) oznacene = true;
      else if (!chybaStlpca(e)) throw new Error(e.message);
      else vysledok.vyhrady.push(`${BEZ_MIGRACIE} XML je v poriadku, len sa neoznačilo ako exportované.`);
    }

    const cisla = (splatky as { id: string; number: number }[])
      .filter((s) => vysledok.idSplatok.includes(s.id))
      .map((s) => s.number);
    return {
      xml: vysledok.xml,
      nazov: nazovSuboruSplatok(zmluva, cisla),
      pocet: vysledok.pocet,
      vyhrady: vysledok.vyhrady,
      oznacene,
    };
  });

/**
 * Vlastný číselný rad kalendára (`number_series` druhu „financing“).
 *
 * Po výbere radu dostanú čísla hneď všetky splátky, ktoré ešte číslo nemajú —
 * nech sú vidieť v tabuľke ešte pred exportom. Raz pridelené číslo sa nemení
 * (ani zmenou radu, ani prepočtom kalendára). `series_id: null` = bez
 * vlastného čísla, ďalšie splátky číslo nedostanú a pridelí im ho Pohoda.
 *
 * Kontokorent rad uloží tiež, ale do Pohody sa zatiaľ neexportuje.
 */
export const nastavRadSplatokFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        contract_id: z.string().uuid(),
        series_id: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id);
    const supabase = context.supabase as any;
    if (data.series_id) {
      const { data: rad } = await supabase
        .from("number_series")
        .select("id, kind")
        .eq("id", data.series_id)
        .eq("company_id", data.company_id)
        .maybeSingle();
      if (!rad || rad.kind !== "financing") throw new Error("Číselný rad sa nenašiel.");
    }
    const { data: zmluva, error } = await supabase
      .from("financing_contracts")
      .update({ number_series_id: data.series_id })
      .eq("id", data.contract_id)
      .eq("company_id", data.company_id)
      .select("id, kind")
      .maybeSingle();
    if (error) {
      throw new Error(
        chybaStlpca(error)
          ? "Vlastný číselný rad splátok ešte nie je v databáze zapnutý (chýba migrácia 20261109180000)."
          : error.message,
      );
    }
    if (!zmluva) throw new Error("Zmluva sa nenašla.");
    let pridelene = 0;
    if (data.series_id && zmluva.kind !== "kontokorent") {
      const { data: n, error: e } = await supabase.rpc("faktero_cisla_splatok", {
        _company_id: data.company_id,
        _contract_id: data.contract_id,
      });
      if (e) throw new Error(e.message);
      pridelene = Number(n ?? 0);
    }
    return { ok: true, pridelene };
  });
