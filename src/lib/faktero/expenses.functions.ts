import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { daSaPorovnat, jeTenIstyDoklad, type OdtlacokDokladu } from "./doklad-duplikat";
import { daSaSpracovat } from "./doklad-stav";

export type ExpenseInput = {
  company_id: string;
  status?: "new" | "processed" | "exported";
  source?: "photo" | "qr" | "upload" | "web";
  supplier_name?: string | null;
  supplier_ico?: string | null;
  supplier_ic_dph?: string | null;
  document_number?: string | null;
  issue_date?: string | null;
  total_amount?: number | null;
  vat_amount?: number | null;
  net_amount?: number | null;
  vat_rate?: number | null;
  currency?: string;
  payment_method?: "hotovost" | "karta" | "prevod";
  category?: string | null;
  note?: string | null;
  file_path?: string | null;
  file_mime?: string | null;
  file_size?: number | null;
  qr_raw?: string | null;
  ai_raw?: unknown;
  /** Položky dokladu — z eKasy alebo z fotky. */
  items?: unknown;
  /** Rozpis základu a DPH po sadzbách; bloček ich má často viac naraz. */
  vat_breakdown?: unknown;
  /** Zaúčtovanie pre Pohodu; prázdne = predvolené z nastavení predkontácií. */
  pohoda_predkontacia?: string | null;
  pohoda_clenenie_dph?: string | null;
  kv_clenenie?: string | null;
  job_id?: string | null;
  stredisko?: string | null;
  cinnost?: string | null;
  pohoda_rad?: string | null;
  int_poznamka?: string | null;
  pohoda_pokladna?: string | null;
};

const inputSchema = z.object({
  company_id: z.string().uuid(),
  status: z.enum(["new", "processed", "exported"]).optional(),
  source: z.enum(["photo", "qr", "upload", "web"]).optional(),
  supplier_name: z.string().nullable().optional(),
  supplier_ico: z.string().nullable().optional(),
  supplier_ic_dph: z.string().nullable().optional(),
  document_number: z.string().nullable().optional(),
  issue_date: z.string().nullable().optional(),
  total_amount: z.number().nullable().optional(),
  vat_amount: z.number().nullable().optional(),
  net_amount: z.number().nullable().optional(),
  vat_rate: z.number().nullable().optional(),
  currency: z.string().optional(),
  // Rozhoduje, či doklad uberie z pokladne — karta ani prevod hotovosť neberú.
  payment_method: z.enum(["hotovost", "karta", "prevod"]).optional(),
  category: z.string().nullable().optional(),
  pohoda_predkontacia: z.string().max(30).nullable().optional(),
  pohoda_clenenie_dph: z.string().max(30).nullable().optional(),
  kv_clenenie: z.string().max(5).nullable().optional(),
  job_id: z.string().uuid().nullable().optional(),
  stredisko: z.string().max(30).nullable().optional(),
  cinnost: z.string().max(30).nullable().optional(),
  pohoda_rad: z.string().max(30).nullable().optional(),
  int_poznamka: z.string().max(240).nullable().optional(),
  pohoda_pokladna: z.string().max(20).nullable().optional(),
  note: z.string().nullable().optional(),
  file_path: z.string().nullable().optional(),
  file_mime: z.string().nullable().optional(),
  file_size: z.number().nullable().optional(),
  qr_raw: z.string().nullable().optional(),
  ai_raw: z.any().optional(),
  items: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number(),
        unit_price: z.number(),
        vat_rate: z.number(),
        total: z.number().optional(),
        // Predkontácia na položku (ako v Doklado) — napr. nafta s pomerom.
        predkontacia: z.string().max(30).nullable().optional(),
        clenenie: z.string().max(30).nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
  vat_breakdown: z
    .array(z.object({ sadzba: z.number(), zaklad: z.number(), dph: z.number() }))
    .nullable()
    .optional(),
});

const odtlacokSchema = z.object({
  company_id: z.string().uuid(),
  qr_raw: z.string().nullable().optional(),
  supplier_ico: z.string().nullable().optional(),
  supplier_name: z.string().nullable().optional(),
  document_number: z.string().nullable().optional(),
  issue_date: z.string().nullable().optional(),
  total_amount: z.number().nullable().optional(),
});

/**
 * Už taký doklad vo firme je?
 *
 * Hľadá sa cez databázu úzko — podľa QR kódu alebo podľa čísla s dátumom — a
 * rozhoduje až pravidlo v `doklad-duplikat`. Načítať všetky doklady firmy a
 * porovnávať ich tu by pri tisícoch riadkov trvalo dlhšie než samotný zápis.
 */
export const findExpenseDuplicateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: OdtlacokDokladu & { company_id: string }) => odtlacokSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!daSaPorovnat(data)) return null;
    const { supabase } = context;
    let dopyt = supabase
      .from("expense_documents")
      .select("id, document_number, issue_date, total_amount, currency, supplier_name, qr_raw, supplier_ico")
      .eq("company_id", data.company_id)
      .limit(20);
    dopyt = data.qr_raw?.trim()
      ? dopyt.eq("qr_raw", data.qr_raw.trim())
      : dopyt.eq("document_number", data.document_number!).eq("issue_date", data.issue_date!);
    const { data: najdene, error } = await dopyt;
    if (error) throw new Error(error.message);
    return (najdene ?? []).find((r) => jeTenIstyDoklad(data, r as OdtlacokDokladu)) ?? null;
  });

export const createExpenseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: ExpenseInput) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    /*
      Poistka proti dvojitému zápisu. Appka sa na duplicitu pýta ešte pred
      uložením, ale doklad sa odosiela z fronty na pozadí — pokus, ktorý spadne
      až po zápise, by sa zopakoval a bloček by bol v účtovníctve dvakrát.
      Rovnaký QR kód preto nezapisujeme druhý raz a vrátime, čo už je uložené.
    */
    const qr = data.qr_raw?.trim();
    if (qr) {
      const { data: uz } = await supabase
        .from("expense_documents")
        .select("*")
        .eq("company_id", data.company_id)
        .eq("qr_raw", qr)
        .limit(1)
        .maybeSingle();
      if (uz) return uz;
    }
    /*
      Ako v Doklado: bloček s QR kódom (údaje z Finančnej správy) ide rovno
      medzi Bločky ako spracovaný — keď má sumu aj dátum. Ostatné doklady
      (fotka bez QR, ručný zápis) sú nespracované a čakajú na kontrolu
      v Nespracovaných dokladoch. Firma si môže zapnúť, aby aj QR bločky
      prešli Nespracovanými. Stav od klienta sa nepreberá: staršie verzie
      appky posielajú „processed" vždy.
    */
    const zQr = Boolean(qr) && data.source === "qr";
    let qrDoNespracovanych = false;
    if (zQr) {
      const { data: firma } = await supabase
        .from("companies")
        .select("qr_blocky_do_nespracovanych")
        .eq("id", data.company_id)
        .maybeSingle();
      qrDoNespracovanych = Boolean((firma as any)?.qr_blocky_do_nespracovanych);
    }
    const rovnoSpracovany =
      zQr && !qrDoNespracovanych && data.total_amount != null && Boolean(data.issue_date);
    const { data: row, error } = await supabase
      .from("expense_documents")
      .insert({
        ...data,
        created_by: userId,
        ...(rovnoSpracovany
          ? { status: "processed", processed_at: new Date().toISOString(), processed_by: userId }
          : { status: "new" }),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    if (zQr && qrDoNespracovanych) {
      const { presunBlocekDoNespracovanych } = await import("./nespracovane.server");
      const n = await presunBlocekDoNespracovanych(supabase as any, row.id, userId).catch(() => ({ id: null }));
      if (n.id) return { ...row, nespracovany_id: n.id };
    }
    return row;
  });

export const updateExpenseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; patch: Partial<ExpenseInput> }) => data)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    /*
      Stav sa úpravou nemení — na to je `nastavStavDokladovFn`. Inak by oprava
      preklepu na už odovzdanom doklade vrátila doklad medzi neodovzdané a
      poslal by sa účtovníkovi druhý raz.
    */
    const { status: _stav, ...patch } = data.patch;
    const { data: row, error } = await supabase
      .from("expense_documents")
      .update(patch as any)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/**
 * Odklikne doklady ako spracované, alebo ich vráti medzi nespracované.
 *
 * Spracovať sa dá len doklad so sumou a dátumom — ostatné sa preskočia a
 * vrátia sa v `preskocene`, aby človek vedel, ktoré treba doplniť. Odovzdaný
 * doklad sa tu nemení: ten už je v účtovníctve.
 */
export const nastavStavDokladovFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        ids: z.array(z.string().uuid()).min(1).max(500),
        stav: z.enum(["new", "processed"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doklady, error } = await supabase
      .from("expense_documents")
      .select("id, status, total_amount, issue_date, supplier_name")
      .eq("company_id", data.company_id)
      .in("id", data.ids);
    if (error) throw new Error(error.message);

    const zdrojovy = data.stav === "processed" ? "new" : "processed";
    const kandidati = (doklady ?? []).filter((d) => d.status === zdrojovy);
    const naZmenu =
      data.stav === "processed" ? kandidati.filter((d) => daSaSpracovat(d)) : kandidati;
    const preskocene = kandidati.filter((d) => !naZmenu.includes(d)).map((d) => d.id);
    if (!naZmenu.length) return { zmenene: 0, preskocene };

    const { data: zmenene, error: chyba } = await supabase
      .from("expense_documents")
      .update(
        data.stav === "processed"
          ? { status: "processed", processed_at: new Date().toISOString(), processed_by: userId }
          : { status: "new", processed_at: null, processed_by: null },
      )
      .eq("company_id", data.company_id)
      .eq("status", zdrojovy)
      .in(
        "id",
        naZmenu.map((d) => d.id),
      )
      .select("id");
    if (chyba) throw new Error(chyba.message);
    return { zmenene: zmenene?.length ?? 0, preskocene };
  });

/** Koľko dokladov čaká na spracovanie — pre záložku a upozornenie. */
export const pocetNespracovanychDokladovFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { count, error } = await context.supabase
      .from("expense_documents")
      .select("id", { count: "exact", head: true })
      .eq("company_id", data.company_id)
      .eq("status", "new");
    if (error) throw new Error(error.message);
    return { pocet: count ?? 0 };
  });

export const deleteExpenseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    /*
      Mazanie musí povedať, či naozaj mazalo.

      `delete()` nad riadkom, ktorý politika nepustí (mazať smie len správca
      firmy) alebo ktorý už neexistuje, nevráti chybu — vráti nula riadkov.
      Bez `select()` sa to nedalo odlíšiť od úspechu a appka aj web na to
      odpovedali „Doklad zmazaný", hoci doklad ostal ležať v databáze a ďalej
      sa hlásil ako „čaká na kontrolu".
    */
    /*
      Kôš: doklad sa pred zmazaním odloží celý aj s párovaním na pohyb v
      banke, aby sa dal obnoviť. Sken v úložisku ostáva, kým sa kôš nevysype.
    */
    const supabase = context.supabase as any;
    const { data: doklad } = await supabase
      .from("expense_documents")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!doklad) throw new Error("Doklad sa nezmazal — buď už neexistuje, alebo naň nemáte právo.");
    const { data: pohyby } = await supabase
      .from("bank_transactions")
      .select("id")
      .eq("matched_expense_id", data.id);
    const { data: vKosi, error: chybaKosa } = await supabase
      .from("kos_dokladov")
      .insert({
        company_id: doklad.company_id,
        druh: "doklad",
        zaznam_id: doklad.id,
        zaznam: doklad,
        vazby: { banka: (pohyby ?? []).map((p: any) => p.id) },
        popis: [doklad.supplier_name, doklad.document_number].filter(Boolean).join(" · ") || "Doklad",
        zmazal: context.userId,
      })
      .select("id")
      .single();
    if (chybaKosa) throw new Error(chybaKosa.message);

    const { data: zmazane, error } = await supabase
      .from("expense_documents")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error || !zmazane?.length) {
      await supabase.from("kos_dokladov").delete().eq("id", vKosi.id);
      if (error) throw new Error(error.message);
      throw new Error("Doklad sa nezmazal — buď už neexistuje, alebo naň nemáte právo.");
    }
    return { ok: true };
  });

/** Kbelík so súborom zmazaného záznamu podľa druhu v koši. */
function kosSuboru(druh: unknown): string {
  return druh === "nespracovany" ? "nespracovane" : "expense-receipts";
}

/** Kôš dokladov — po 90 dňoch sa vysype sám (aj sken). */
export const kosDokladovFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { company_id: string }) => z.object({ company_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const hranica = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data: stare } = await supabase
      .from("kos_dokladov")
      .select("id, druh, zaznam")
      .eq("company_id", data.company_id)
      .lt("zmazane_at", hranica);
    for (const r of stare ?? []) {
      const cesta = r.zaznam?.file_path;
      if (cesta) await supabase.storage.from(kosSuboru(r.druh)).remove([cesta]);
      await supabase.from("kos_dokladov").delete().eq("id", r.id);
    }
    const { data: riadky, error } = await supabase
      .from("kos_dokladov")
      .select("id, popis, zmazane_at, zmazal, zaznam")
      .eq("company_id", data.company_id)
      .order("zmazane_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (riadky ?? []).map((r: any) => ({
      id: r.id as string,
      popis: r.popis as string,
      zmazaneAt: r.zmazane_at as string,
      datum: (r.zaznam?.issue_date ?? r.zaznam?.udaje?.datumVystavenia ?? null) as string | null,
      suma:
        r.zaznam?.total_amount != null
          ? Number(r.zaznam.total_amount)
          : r.zaznam?.udaje?.celkom != null
            ? Number(r.zaznam.udaje.celkom)
            : null,
      mena: (r.zaznam?.currency ?? "EUR") as string,
    }));
  });

/** Obnovenie z koša — doklad sa vráti s tým istým id aj párovaním na banku. */
export const obnovZKosaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: r } = await supabase.from("kos_dokladov").select("*").eq("id", data.id).maybeSingle();
    if (!r) throw new Error("Doklad v koši nie je.");
    // Nespracovaný doklad sa vracia medzi nespracované, ostatné medzi doklady.
    const { error } = await supabase
      .from(r.druh === "nespracovany" ? "nespracovane_doklady" : "expense_documents")
      .insert(r.zaznam);
    if (error) throw new Error(error.message);
    const banka: string[] = r.vazby?.banka ?? [];
    if (banka.length) {
      await supabase
        .from("bank_transactions")
        .update({ matched_expense_id: r.zaznam_id })
        .in("id", banka)
        .is("matched_expense_id", null);
    }
    await supabase.from("kos_dokladov").delete().eq("id", r.id);
    return { ok: true };
  });

/** Natrvalo z koša — so skenom. */
export const zmazZKosaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: r } = await supabase
      .from("kos_dokladov")
      .select("id, druh, zaznam")
      .eq("id", data.id)
      .maybeSingle();
    if (!r) throw new Error("Doklad v koši nie je.");
    if (r.zaznam?.file_path) await supabase.storage.from(kosSuboru(r.druh)).remove([r.zaznam.file_path]);
    const { error } = await supabase.from("kos_dokladov").delete().eq("id", r.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Doklady patriace do mesiaca.
 *
 * Účtuje sa podľa dátumu vystavenia — lenže bloček, ktorý sa nepodarilo
 * prečítať, žiadny nemá. A porovnanie `issue_date >= …` je pri prázdnej
 * hodnote vždy nepravda, takže taký doklad vypadol z filtra vo **všetkých**
 * mesiacoch: appka naň upozorňovala („čaká na kontrolu"), ale na webe sa
 * nedal nájsť, opraviť ani zmazať. Bez dátumu vystavenia preto rozhoduje
 * dátum vzniku — presne ako v appke, kde sa doklady zoskupujú podľa
 * `issue_date ?? created_at`.
 */
function vMesiaci<Q extends { or: (filter: string) => Q }>(q: Q, month: string): Q {
  const [y, m] = month.split("-").map(Number);
  const od = `${y}-${String(m).padStart(2, "0")}-01`;
  const dalsiMesiac = m === 12 ? 1 : m + 1;
  const dalsiRok = m === 12 ? y + 1 : y;
  const do_ = `${dalsiRok}-${String(dalsiMesiac).padStart(2, "0")}-01`;
  return q.or(
    `and(issue_date.gte.${od},issue_date.lt.${do_}),` +
      `and(issue_date.is.null,created_at.gte.${od},created_at.lt.${do_})`,
  );
}

export const listExpensesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { company_id: string; month?: string | null; status?: string | null }) => data)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("expense_documents")
      .select("*")
      .eq("company_id", data.company_id)
      .order("issue_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.month) q = vMesiaci(q, data.month);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Koľko dokladov leží mimo vybraného mesiaca a ktorý mesiac je najbližší.
 *
 * Zoznam Dokladov sa otvára na aktuálnom mesiaci a filtruje podľa dátumu
 * vystavenia. Faktúra vystavená 31. 8. a nahratá 3. 9. sa tak hneď po uložení
 * stratí z dohľadu — vyzerá to, že sa neuložila. Zoznam preto musí vedieť
 * povedať, že niečo je inde, a ponúknuť, kde.
 */
export const dokladyMimoMesiacaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { company_id: string; month: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [y, m] = data.month.split("-").map(Number);
    if (!y || !m) return { pocet: 0, mesiac: null as string | null };
    const od = `${y}-${String(m).padStart(2, "0")}-01`;
    const do_ = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
    // Doklad bez dátumu vystavenia sa v zozname riadi dňom vzniku — tu ide o
    // ten istý pohľad, len naopak, tak sa musí pýtať rovnako.
    const mimo = `or(issue_date.lt.${od},issue_date.gte.${do_})`;
    const bezDatumu = `and(issue_date.is.null,or(created_at.lt.${od},created_at.gte.${do_}))`;

    const { count, error } = await supabase
      .from("expense_documents")
      .select("id", { count: "exact", head: true })
      .eq("company_id", data.company_id)
      .or(`${mimo},${bezDatumu}`);
    if (error) throw new Error(error.message);
    if (!count) return { pocet: 0, mesiac: null as string | null };

    // Najbližší mesiac, kam sa dá skočiť: ten, v ktorom leží najnovší doklad
    // mimo výberu. Vo väčšine prípadov je to práve ten práve nahratý.
    const { data: najnovsi } = await supabase
      .from("expense_documents")
      .select("issue_date, created_at")
      .eq("company_id", data.company_id)
      .or(`${mimo},${bezDatumu}`)
      .order("issue_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const den = (najnovsi?.issue_date as string | null) ?? (najnovsi?.created_at as string | null);
    return { pocet: count, mesiac: den ? den.slice(0, 7) : null };
  });

export const getExpenseFileUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { file_path: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("expense-receipts")
      .createSignedUrl(data.file_path, 3600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

// Export vybraných dokladov ako ZIP (CSV súhrn + priložené súbory)
export const exportExpensesZipFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: {
      company_id: string;
      ids?: string[];
      month?: string | null;
      mark_exported?: boolean;
      /** Dátum zaúčtovania pre doklady z uzavretého obdobia. */
      datum_zauctovania?: string | null;
      /** `false` = už odovzdané vynechať. */
      aj_odovzdane?: boolean;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("expense_documents").select("*").eq("company_id", data.company_id);
    if (data.ids?.length) q = q.in("id", data.ids);
    if (data.month) q = vMesiaci(q, data.month);
    const { data: vsetky, error } = await q;
    if (error) throw new Error(error.message);
    if (!vsetky?.length) throw new Error("Žiadne doklady na export");
    if (data.aj_odovzdane === false) {
      const neodovzdane = vsetky.filter((r: any) => !r.exported_at);
      if (!neodovzdane.length) throw new Error("Všetky vybrané doklady už boli odovzdané.");
      vsetky.splice(0, vsetky.length, ...neodovzdane);
    }
    /*
      Odovzdanie účtovníkovi berie len schválené (keď je schvaľovanie
      zapnuté); obyčajný ZIP na stiahnutie ostáva archívom všetkého.
    */
    const { ok: rows, cakaju } = data.mark_exported
      ? await (await import("./schvalovanie.server")).lenSchvalene(supabase, data.company_id, "doklad", vsetky)
      : { ok: vsetky, cakaju: 0 };
    if (!rows.length) throw new Error(`Vybrané doklady čakajú na schválenie (${cakaju}).`);

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    // CSV súhrn
    const header = [
      "id",
      "datum",
      "dodavatel",
      "ico",
      "ic_dph",
      "cislo_dokladu",
      "suma_bez_dph",
      "dph",
      "suma_celkom",
      "dph_sadzba",
      "mena",
      "kategoria",
      "poznamka",
      "subor",
    ].join(";");
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[;"\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    };
    const lines = [header];
    for (const r of rows) {
      lines.push(
        [
          r.id,
          r.issue_date ?? "",
          r.supplier_name ?? "",
          r.supplier_ico ?? "",
          r.supplier_ic_dph ?? "",
          r.document_number ?? "",
          r.net_amount ?? "",
          r.vat_amount ?? "",
          r.total_amount ?? "",
          r.vat_rate ?? "",
          r.currency ?? "EUR",
          r.category ?? "",
          r.note ?? "",
          r.file_path ? r.file_path.split("/").pop() : "",
        ]
          .map(escape)
          .join(";"),
      );
    }
    zip.file("doklady.csv", "\uFEFF" + lines.join("\n"));

    // Pohoda XML — účtovníčka doklady nemusí prepisovať z tabuľky ručne.
    // Kódy predkontácie a členenia DPH sú z nastavení firmy; bez nich sa
    // doklad naimportuje tiež, len ho musí zaúčtovať sama.
    const { data: firma } = await supabase
      .from("companies")
      .select(
        "ico, default_currency, pohoda_predkontacia_prijata, pohoda_clenenie_dph_prijata, pohoda_predkontacia_doklady, pohoda_clenenie_dph_doklady, pohoda_predkontacia_rozuctovat, pohoda_blocky_agenda, pohoda_pokladna, pohoda_stredisko, pohoda_rad_prijate, pohoda_rad_doklady, pohoda_rad_pokladna, pohoda_rad_interne, pohoda_posielat_zakazky, pohoda_odkaz_na_doklady, pohoda_polozky_blockov, pohoda_dobropis_kladny, pohoda_parovaci_symbol, pohoda_predkontacia_zaokruhlenie, locked_until, id",
      )
      .eq("id", data.company_id)
      .single();
    const { buildPohodaExpensesXml, podlaRoka } = await import("./export.server");
    const datumZ = /^\d{4}-\d{2}-\d{2}$/.test(String(data.datum_zauctovania ?? "")) ? String(data.datum_zauctovania) : null;
    // Prelom rokov: každý rok do vlastného súboru (Pohoda importuje do jedného roka).
    const roky = datumZ ? [{ rok: "", doklady: rows }] : podlaRoka(rows, (r: any) => r.issue_date);
    for (const r of roky)
    zip.file(
      roky.length > 1 ? `pohoda-${r.rok}.xml` : "pohoda.xml",
      buildPohodaExpensesXml({
        company: firma ?? {},
        doklady: r.doklady,
        nastavenia: {
          datumZauctovaniaPevny: datumZ,
          predkontaciaPrijata: firma?.pohoda_predkontacia_prijata,
          clenenieDphPrijata: firma?.pohoda_clenenie_dph_prijata,
          predkontaciaDoklady: (firma as any)?.pohoda_predkontacia_doklady,
          clenenieDphDoklady: (firma as any)?.pohoda_clenenie_dph_doklady,
          predkontaciaRozuctovat: (firma as any)?.pohoda_predkontacia_rozuctovat,
          blockyPodlaPlatby: (firma as any)?.pohoda_blocky_agenda === "podla_platby",
          pokladna: (firma as any)?.pohoda_pokladna,
          ...(await (await import("./predkontacie.server")).nastaveniaDokladov(
            supabase,
            { ...(firma ?? {}), id: data.company_id },
            rows,
          )),
        },
      }),
    );

    // Priložené súbory
    const files = zip.folder("subory")!;
    for (const r of rows) {
      if (!r.file_path) continue;
      const { data: file } = await supabase.storage.from("expense-receipts").download(r.file_path);
      if (!file) continue;
      const ext = (r.file_path.split(".").pop() || "bin").toLowerCase();
      const namePart = [r.issue_date ?? "no-date", r.supplier_name ?? "doklad", r.id.slice(0, 8)]
        .join("_")
        .replace(/[^a-zA-Z0-9-_ěščřžýáíéúůĎŇŤŠČŘŽÝÁÍÉÚŮ.]+/g, "-");
      files.file(`${namePart}.${ext}`, await file.arrayBuffer());
    }

    const blob = await zip.generateAsync({ type: "base64" });

    if (data.mark_exported) {
      await supabase
        .from("expense_documents")
        .update({ status: "exported", exported_at: new Date().toISOString() })
        .in(
          "id",
          rows.map((r) => r.id),
        );
    }

    return {
      base64: blob,
      filename: `doklady-${data.month ?? new Date().toISOString().slice(0, 7)}.zip`,
      count: rows.length,
    };
  });

/** Preddefinované poznámky firmy (ako v Doklado) — načítať, pridať, odobrať. */
export const poznamkySablonyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        pridat: z.string().trim().min(1).max(300).optional(),
        odobrat: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: clen } = await supabase
      .from("company_users")
      .select("user_id")
      .eq("company_id", data.company_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!clen) throw new Error("Do firmy nemáte prístup.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: f } = await supabaseAdmin
      .from("companies")
      .select("poznamky_sablony")
      .eq("id", data.company_id)
      .single();
    let zoznam: string[] = ((f as any)?.poznamky_sablony ?? []) as string[];
    if (data.pridat && !zoznam.includes(data.pridat)) zoznam = [...zoznam, data.pridat].slice(-50);
    if (data.odobrat) zoznam = zoznam.filter((x) => x !== data.odobrat);
    if (data.pridat || data.odobrat)
      await supabaseAdmin.from("companies").update({ poznamky_sablony: zoznam }).eq("id", data.company_id);
    return { zoznam };
  });

/**
 * Čo si človek môže v appke prednastaviť pred skenovaním: otvorené zákazky
 * a aktívne predkontácie firmy.
 */
export const predvolbySkenuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { company_id: string }) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const [{ data: zakazky }, { data: predkontacie }] = await Promise.all([
      supabase
        .from("jobs")
        .select("id, job_number, name, status")
        .eq("company_id", data.company_id)
        .neq("status", "closed")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("predkontacie")
        .select("kod, popis")
        .eq("company_id", data.company_id)
        .eq("druh", "predkontacia")
        .eq("aktivne", true)
        .order("kod")
        .limit(300),
    ]);
    return {
      zakazky: (zakazky ?? []).map((z: any) => ({
        id: String(z.id),
        nazov: [z.job_number, z.name].filter(Boolean).join(" · ") || "Zákazka",
      })),
      predkontacie: (predkontacie ?? []).map((p: any) => ({ kod: String(p.kod), popis: String(p.popis ?? "") })),
    };
  });
