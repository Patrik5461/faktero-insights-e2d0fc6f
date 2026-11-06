import { vsetkoAkoData } from "./strankovanie";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { knihaPokladni, type Pokladna } from "./pokladne";
import { cisloZRadu } from "./cislo-z-radu.server";
import { krajinaDane } from "./vat-rates";

/**
 * Pokladňa. Všetko ide cez klienta prihláseného používateľa, takže cudziu
 * firmu odfiltruje RLS — `supabaseAdmin` sa tu nepoužíva.
 */

const CompanyScoped = z.object({ company_id: z.string().uuid() });

/** Číslo z pokladničného radu — predvolene PD{rok}{poradie} ako doteraz. */
async function dalsieCislo(
  supabase: any,
  companyId: string,
  seriesId?: string | null,
): Promise<{ cislo: string; seriesId: string | null }> {
  return cisloZRadu(supabase, companyId, "cash", { seriesId });
}

export const getCashBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    CompanyScoped.extend({
      // `YYYY-MM`; bez neho sa vráti celý priebeh.
      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .nullable()
        .optional(),
      /** Vybraná pokladňa; bez nej (alebo `null`) všetky pokladne. */
      pokladna_id: z.string().uuid().nullish(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [{ data: doklady }, { data: vydavky }, { data: firma }, { data: pokladne }] = await Promise.all([
      vsetkoAkoData((zac, kon) =>
        context.supabase
          .from("cash_entries")
          .select("*")
          .eq("company_id", data.company_id)
          .order("entry_date", { ascending: true })
          .order("id")
          .range(zac, kon),
      ),
      vsetkoAkoData((zac, kon) =>
        context.supabase
          .from("expense_documents")
          .select("id, issue_date, total_amount, payment_method, supplier_name, document_number, pokladna_id")
          .eq("company_id", data.company_id)
          .eq("payment_method", "hotovost")
          // Starý doklad z importu, ktorý sa do pokladne vedome nezapočítal.
          .eq("mimo_pokladne", false)
          /*
            Bloček z vyúčtovania výdavkov zaplatil zamestnanec (zo zálohy alebo
            z vlastného) — firemná pokladňa sa ním nemení. Do Pohody ide ako
            interný doklad, nie pokladničný (export.server), a tu to musí sedieť.
          */
          .is("vyuctovanie_id", null)
          .order("id")
          .range(zac, kon),
      ),
      context.supabase
        .from("companies")
        .select("locked_until, country")
        .eq("id", data.company_id)
        .maybeSingle(),
      context.supabase
        .from("pokladne")
        .select("id, nazov, mena, kod_pohoda, predvolena, aktivna, poradie")
        .eq("company_id", data.company_id),
    ]);

    const domaca = krajinaDane((firma as any)?.country) === "CZ" ? "CZK" : "EUR";
    const kniha = knihaPokladni({
      pokladne: (pokladne ?? []) as Pokladna[],
      doklady: doklady ?? [],
      vydavky: vydavky ?? [],
      vybrana: data.pokladna_id ?? null,
      mesiac: data.month ?? null,
      domaca,
    });
    const jedna = kniha.vybrana ?? (kniha.pokladne.length === 1 ? kniha.pokladne[0]!.id : null);

    /*
      Jedna pokladňa (vybraná alebo jediná): stav a počiatočný stav ako
      doteraz. Pri „Všetky“ s viacerými menami sú `stav` a počiatočný stav
      za predvolenú menu len pre spätnú zhodu — obrazovka číta `sucty`.
    */
    const vybranaP = kniha.pokladne.find((p) => p.id === jedna) ?? null;
    const prva = kniha.sucty[0];
    return {
      stav: vybranaP
        ? vybranaP.stav
        : {
            prijmy: prva?.prijmy ?? 0,
            vydavky: prva?.vydavky ?? 0,
            zostatok: prva?.zostatok ?? 0,
            pocet: kniha.riadky.length,
            zaporny: Boolean(prva?.zaporny),
            mena: prva?.mena ?? domaca,
          },
      riadky: kniha.riadky,
      pociatocny_stav_obdobia: prva?.pociatocny ?? 0,
      pokladne: kniha.pokladne,
      vybrana: kniha.vybrana,
      sucty: kniha.sucty,
      domaca,
      locked_until: (firma?.locked_until as string | null) ?? null,
    };
  });

export const createCashEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    CompanyScoped.extend({
      type: z.enum(["prijem", "vydaj"]),
      amount: z.coerce.number().positive(),
      description: z.string().trim().min(1).max(255),
      entry_date: z.string().date(),
      category: z.string().trim().max(80).nullable().optional(),
      note: z.string().trim().max(2000).nullable().optional(),
      /** Z ktorého číselného radu má doklad dostať číslo. */
      number_series_id: z.string().uuid().nullish(),
      /** Pokladňa; bez nej predvolená (doplní spúšťač v DB). */
      pokladna_id: z.string().uuid().nullish(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cislo = await dalsieCislo(supabase, data.company_id, data.number_series_id);
    const { data: row, error } = await supabase
      .from("cash_entries")
      .insert({
        company_id: data.company_id,
        entry_number: cislo.cislo,
        number_series_id: cislo.seriesId,
        entry_date: data.entry_date,
        type: data.type,
        amount: data.amount,
        description: data.description,
        category: data.category ?? null,
        note: data.note ?? null,
        ...(data.pokladna_id ? { pokladna_id: data.pokladna_id } : {}),
        created_by: userId,
      })
      .select("*")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Doklad sa nepodarilo uložiť.");
    return { id: row.id, entry_number: row.entry_number };
  });

export const deleteCashEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Odovzdaný do Pohody sa nezmaže — v Pohode by ostal a u nás by chýbal.
    const { data: pohyb } = await context.supabase
      .from("cash_entries")
      .select("exported_at")
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if ((pohyb as any)?.exported_at)
      throw new Error("Doklad je už v Pohode — najprv ho vráťte z Pohody (a zmažte ho tam).");
    // Doklad z uzavretého obdobia odmietne trigger `cash_entries_locked_period`.
    const { error } = await context.supabase
      .from("cash_entries")
      .delete()
      .eq("id", data.id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Správa pokladní                                                     */
/* ------------------------------------------------------------------ */

const STLPCE_POKLADNE = "id, nazov, mena, kod_pohoda, predvolena, aktivna, poradie";

/** Hláška z databázy po slovensky — názov, mazanie s pohybmi, pravidlá spúšťača. */
function chybaPokladne(error: any): Error {
  const kod = String(error?.code ?? "");
  if (kod === "23505") return new Error("Pokladňa s týmto názvom už existuje.");
  if (kod === "23503")
    return new Error("Pokladňu s pohybmi nemožno zmazať — archivujte ju.");
  return new Error(error?.message ?? "Pokladňu sa nepodarilo uložiť.");
}

export const listPokladne = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("pokladne")
      .select(STLPCE_POKLADNE)
      .eq("company_id", data.company_id);
    if (error) throw chybaPokladne(error);
    return { pokladne: (rows ?? []) as Pokladna[] };
  });

const PokladnaVstup = CompanyScoped.extend({
  id: z.string().uuid().nullish(),
  nazov: z.string().trim().min(1).max(80),
  mena: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .transform((m) => m.toUpperCase())
    .nullish(),
  kod_pohoda: z.string().trim().max(19).nullish(),
  predvolena: z.boolean().optional(),
  aktivna: z.boolean().optional(),
  poradie: z.number().int().min(0).max(1000).optional(),
});

/**
 * Založí alebo upraví pokladňu. Firma, ktorá ešte žiadnu nemá (hotovosť
 * nepoužila), dostane pred prvou vlastnou aj doterajšiu „Pokladňa“ so
 * skratkou z nastavení Pohody — inak by sa prvá pridaná stala predvolenou.
 */
export const ulozPokladnu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => PokladnaVstup.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const zmena: any = {
      nazov: data.nazov,
      ...(data.mena ? { mena: data.mena } : {}),
      ...(data.kod_pohoda !== undefined ? { kod_pohoda: data.kod_pohoda?.trim() || null } : {}),
      ...(data.predvolena !== undefined ? { predvolena: data.predvolena } : {}),
      ...(data.aktivna !== undefined ? { aktivna: data.aktivna } : {}),
      ...(data.poradie !== undefined ? { poradie: data.poradie } : {}),
    };
    if (data.id) {
      // Mena sa po prvom pohybe nemení — sumy pohybov sú v nej.
      if (data.mena) {
        const { data: stara } = await sb
          .from("pokladne")
          .select("mena")
          .eq("id", data.id)
          .eq("company_id", data.company_id)
          .maybeSingle();
        if (stara && String((stara as any).mena) !== data.mena) {
          const [{ count: pohyby }, { count: doklady }] = await Promise.all([
            sb.from("cash_entries").select("id", { count: "exact", head: true }).eq("pokladna_id", data.id),
            sb.from("expense_documents").select("id", { count: "exact", head: true }).eq("pokladna_id", data.id),
          ]);
          if ((pohyby ?? 0) + (doklady ?? 0) > 0)
            throw new Error("Pokladňa s pohybmi si menu nemení — založte novú pokladňu.");
        }
      }
      const { data: row, error } = await sb
        .from("pokladne")
        .update(zmena)
        .eq("id", data.id)
        .eq("company_id", data.company_id)
        .select(STLPCE_POKLADNE)
        .maybeSingle();
      if (error) throw chybaPokladne(error);
      if (!row) throw new Error("Pokladňa sa nenašla.");
      return { pokladna: row as Pokladna };
    }

    const { count } = await sb
      .from("pokladne")
      .select("id", { count: "exact", head: true })
      .eq("company_id", data.company_id);
    if (!count) {
      const { data: firma } = await sb
        .from("companies")
        .select("pohoda_pokladna")
        .eq("id", data.company_id)
        .maybeSingle();
      const zaklad = "Pokladňa";
      if (zaklad.toLowerCase() !== data.nazov.trim().toLowerCase()) {
        const { error } = await sb.from("pokladne").insert({
          company_id: data.company_id,
          nazov: zaklad,
          kod_pohoda: String((firma as any)?.pohoda_pokladna ?? "").trim() || null,
          predvolena: true,
        });
        if (error) throw chybaPokladne(error);
      }
    }
    const { data: row, error } = await sb
      .from("pokladne")
      .insert({ company_id: data.company_id, ...zmena, poradie: data.poradie ?? (count ?? 0) + 1 } as any)
      .select(STLPCE_POKLADNE)
      .single();
    if (error) throw chybaPokladne(error);
    return { pokladna: row as Pokladna };
  });

/** Zmaže len prázdnu pokladňu — s pohybmi ju odmietne cudzí kľúč v DB. */
export const zmazPokladnu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("pokladne")
      .delete()
      .eq("id", data.id)
      .eq("company_id", data.company_id);
    if (error) throw chybaPokladne(error);
    return { ok: true };
  });
