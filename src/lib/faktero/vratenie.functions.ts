import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Vrátenie zle zatriedeného alebo zle zaúčtovaného dokladu.

  - „Vrátiť z Pohody" zruší príznak odovzdania, aby sa doklad dal opraviť a
    poslať znova. V Pohode ostáva — tam ho treba zmazať ručne, inak by bol
    dvakrát; preto to rozhranie pred kliknutím povie.
  - Prijatá faktúra, ktorá je v skutočnosti bloček, sa presunie späť medzi
    doklady (opak „Presunúť do prijatých faktúr").
  - Zaúčtované prijaté faktúry sa dajú stiahnuť ako XML pre Pohodu priamo.

  Všetko cez klienta prihláseného (RLS, role).
*/

export const vratZPohodyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        druh: z.enum(["prijata", "doklad"]),
        ids: z.array(z.string().uuid()).min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    if (data.druh === "prijata") {
      // Späť na „prijatú": zaúčtovanie sa zruší, aby ho človek opravil a
      // zaúčtoval znova — inak by nesprávne kódy odišli rovno ďalšou dávkou.
      const { data: r, error } = await supabase
        .from("purchase_invoices")
        .update({ exported_at: null, pohoda_cislo: null, zauctovane_at: null, zauctoval: null })
        .eq("company_id", data.company_id)
        .in("id", data.ids)
        .select("id, status");
      if (error) throw new Error(error.message);
      const zauct = (r ?? []).filter((x: any) => x.status === "booked").map((x: any) => x.id);
      if (zauct.length)
        await supabase.from("purchase_invoices").update({ status: "received" }).in("id", zauct);
      return { vratenych: (r ?? []).length };
    }
    // Doklad sa vráti medzi nespracované — po oprave ho človek spracuje znova.
    const { data: r, error } = await supabase
      .from("expense_documents")
      .update({ exported_at: null, export_job_id: null, pohoda_cislo: null, status: "new" })
      .eq("company_id", data.company_id)
      .in("id", data.ids)
      .select("id");
    if (error) throw new Error(error.message);
    return { vratenych: (r ?? []).length };
  });

/**
 * Prijatá faktúra späť medzi doklady (bloček zaradený omylom medzi faktúry).
 *
 * Presun, nie kópia — na dvoch miestach by sa ten istý náklad počítal
 * dvakrát. Párovanie s pohybom na účte sa prenesie na doklad.
 */
export const presunPrijatuDoDokladovFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const userId = context.userId as string;
    const { data: p, error } = await supabase
      .from("purchase_invoices")
      .select("*")
      .eq("company_id", data.company_id)
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) throw new Error("Faktúra sa nenašla.");
    if (p.exported_at)
      throw new Error("Faktúra je už v Pohode — najprv ju vráťte z Pohody (a zmažte ju tam).");
    if (p.samofakturacia) throw new Error("Samofaktúra sa medzi doklady presunúť nedá.");
    if (p.type !== "regular") throw new Error("Presunúť sa dá len bežná prijatá faktúra.");

    const [{ data: efa }, { data: pohyby }] = await Promise.all([
      supabase.from("efaktura_documents").select("id").eq("purchase_invoice_id", p.id).limit(1),
      supabase
        .from("stock_movements")
        .select("id")
        .eq("source_document_id", p.id)
        .limit(1),
    ]);
    if (efa?.length) throw new Error("Faktúra prišla eFaktúrou — tá ostáva prijatou faktúrou.");
    if (pohyby?.length) throw new Error("Z faktúry je príjem na sklad — najprv ho zrušte.");

    /* --- príloha --- */
    let file_path: string | null = null;
    if (p.file_path) {
      const { data: subor, error: e1 } = await supabase.storage
        .from("purchase-invoices")
        .download(p.file_path);
      if (e1 || !subor) throw new Error(`Prílohu sa nepodarilo prečítať: ${e1?.message ?? "?"}`);
      const koncovka = String(p.file_path).split(".").pop() ?? "pdf";
      const cielova = `${data.company_id}/${crypto.randomUUID()}.${koncovka}`;
      const { error: e2 } = await supabase.storage
        .from("expense-receipts")
        .upload(cielova, subor, { contentType: p.file_mime ?? "application/pdf", upsert: false });
      if (e2) throw new Error(`Prílohu sa nepodarilo presunúť: ${e2.message}`);
      file_path = cielova;
    }

    const zaklad = Number(p.amount_without_vat ?? 0);
    const dph = Number(p.vat_amount ?? 0);
    const sadzba = zaklad ? Math.round((dph / zaklad) * 100) : 0;
    const { data: doklad, error: e3 } = await supabase
      .from("expense_documents")
      .insert({
        company_id: data.company_id,
        created_by: userId,
        status: "new",
        source: "web",
        supplier_name: p.supplier_name,
        supplier_ico: p.supplier_ico,
        supplier_ic_dph: p.supplier_ic_dph,
        document_number: p.invoice_number,
        issue_date: p.issue_date,
        total_amount: p.amount_total,
        net_amount: zaklad,
        vat_amount: dph,
        vat_rate: sadzba,
        vat_breakdown: zaklad || dph ? [{ sadzba, zaklad, dph }] : null,
        currency: p.currency ?? "EUR",
        payment_method: ["hotovost", "karta", "prevod"].includes(p.payment_method)
          ? p.payment_method
          : "prevod",
        category: p.category,
        note: p.note,
        items: p.items ?? null,
        pohoda_predkontacia: p.pohoda_predkontacia,
        pohoda_clenenie_dph: p.pohoda_clenenie_dph,
        kv_clenenie: p.kv_clenenie,
        odpocet: p.odpocet !== false,
        file_path,
        file_mime: p.file_mime ?? null,
        file_size: p.file_size ?? null,
      })
      .select("id")
      .single();
    if (e3 || !doklad) {
      if (file_path) await supabase.storage.from("expense-receipts").remove([file_path]);
      throw new Error(e3?.message ?? "Doklad sa nepodarilo vytvoriť.");
    }

    // Úhrada z účtu ide s dokladom.
    await supabase
      .from("bank_transactions")
      .update({ matched_expense_id: doklad.id, matched_purchase_invoice_id: null })
      .eq("matched_purchase_invoice_id", p.id);

    if (p.file_path) await supabase.storage.from("purchase-invoices").remove([p.file_path]);
    const { error: e4 } = await supabase.from("purchase_invoices").delete().eq("id", p.id);
    if (e4) throw new Error(e4.message);
    return { id: doklad.id as string };
  });

/**
 * XML pre Pohodu so zaúčtovanými prijatými faktúrami — na stiahnutie hneď
 * po zaúčtovaní, bez čakania na mesačné odovzdanie.
 *
 * `oznacit` ich zapíše ako odovzdané, aby ich konektor neposlal druhýkrát.
 */
export const exportPrijatychPohodaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        ids: z.array(z.string().uuid()).min(1).max(500),
        oznacit: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const [{ data: firma }, { data: riadky, error }] = await Promise.all([
      supabase.from("companies").select("*").eq("id", data.company_id).single(),
      supabase
        .from("purchase_invoices")
        .select("*")
        .eq("company_id", data.company_id)
        .in("id", data.ids)
        .is("deleted_at", null),
    ]);
    if (error) throw new Error(error.message);
    const { zapocitatelna } = await import("./samofakturacia");
    const { prijataAkoDoklad } = await import("./prijate-do-pohody");
    const preskocene: string[] = [];
    const kandidati = (riadky ?? []).filter((p: any) => {
      if (!p.zauctovane_at) return preskocene.push(`${p.invoice_number}: nie je zaúčtovaná`), false;
      if (!zapocitatelna(p)) return preskocene.push(`${p.invoice_number}: neodsúhlasená samofaktúra`), false;
      return true;
    });
    const { ok, cakaju } = await (await import("./schvalovanie.server")).lenSchvalene(
      supabase,
      data.company_id,
      "prijata",
      kandidati,
    );
    if (cakaju) preskocene.push(`${cakaju} čaká na schválenie`);
    if (!ok.length) throw new Error(preskocene.join(" · ") || "Nie je čo vyviezť.");

    const { buildPohodaExpensesXml } = await import("./export.server");
    const { nastaveniaDokladov } = await import("./predkontacie.server");
    const xml = buildPohodaExpensesXml({
      company: firma,
      doklady: ok.map(prijataAkoDoklad),
      nastavenia: {
        predkontaciaPrijata: firma?.pohoda_predkontacia_prijata,
        clenenieDphPrijata: firma?.pohoda_clenenie_dph_prijata,
        predkontaciaRozuctovat: firma?.pohoda_predkontacia_rozuctovat,
        ...(await nastaveniaDokladov(supabase, firma, ok.map(prijataAkoDoklad))),
      },
    });
    if (data.oznacit) {
      await supabase
        .from("purchase_invoices")
        .update({ exported_at: new Date().toISOString() })
        .in(
          "id",
          ok.map((p: any) => p.id),
        );
    }
    const den = new Date().toISOString().slice(0, 10);
    return {
      xml,
      fileName: ok.length === 1 ? `pohoda-${String(ok[0].invoice_number).replace(/[^\w.-]+/g, "_")}.xml` : `pohoda-prijate-${den}.xml`,
      pocet: ok.length,
      preskocene,
    };
  });
