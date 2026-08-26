import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ReadinessReport } from "./types";
import type { Database, Json, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Sb = SupabaseClient<Database>;

type EfakturaProfileRow = Database["public"]["Tables"]["efaktura_profiles"]["Row"];
type EfakturaProfileInsert = TablesInsert<"efaktura_profiles">;
type EfakturaProfileUpdate = TablesUpdate<"efaktura_profiles">;
type EfakturaDocumentRow = Database["public"]["Tables"]["efaktura_documents"]["Row"];
type EfakturaDeliveryRow = Database["public"]["Tables"]["efaktura_deliveries"]["Row"];

async function assertCompanyMember(supabase: Sb, companyId: string, userId: string) {
  const { data, error } = await supabase.rpc("is_company_member", {
    _company_id: companyId,
    _user_id: userId,
  });
  if (error) throw error;
  if (!data) throw new Error("Nemáte prístup k tejto firme.");
}

export const getEfakturaReadinessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string }) => d)
  .handler(
    async ({
      data,
      context,
    }): Promise<ReadinessReport & { profile: EfakturaProfileRow | null }> => {
      const { supabase, userId } = context;
      await assertCompanyMember(supabase, data.companyId, userId);
      const { computeReadiness } = await import("./readiness.server");

      const [
        { data: company },
        { data: profile },
        { count: invoiceCount },
        { count: validatedCount },
        { count: invalidCount },
      ] = await Promise.all([
        supabase.from("companies").select("*").eq("id", data.companyId).maybeSingle(),
        supabase
          .from("efaktura_profiles")
          .select("*")
          .eq("company_id", data.companyId)
          .maybeSingle(),
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("company_id", data.companyId),
        supabase
          .from("efaktura_documents")
          .select("id", { count: "exact", head: true })
          .eq("company_id", data.companyId)
          .in("status", ["validated", "generated"]),
        supabase
          .from("efaktura_documents")
          .select("id", { count: "exact", head: true })
          .eq("company_id", data.companyId)
          .eq("status", "invalid"),
      ]);
      if (!company) throw new Error("Firma neexistuje alebo k nej nemáte prístup.");

      const report = computeReadiness({
        company,
        profile,
        stats: {
          invoiceCount: invoiceCount ?? 0,
          validatedDocumentCount: validatedCount ?? 0,
          invalidDocumentCount: invalidCount ?? 0,
        },
      });

      if (profile) {
        const update: EfakturaProfileUpdate = {
          readiness_score: report.score,
          readiness_checked_at: report.checkedAt,
          readiness_details: report as unknown as Json,
        };
        await supabase.from("efaktura_profiles").update(update).eq("id", profile.id);
      }

      return { ...report, profile: profile ?? null };
    },
  );

export const upsertEfakturaProfileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      companyId: string;
      enabled?: boolean;
      preferredChannel?: "peppol" | "digitalny_postar" | "email" | "manual";
      peppolParticipantId?: string | null;
      peppolScheme?: string | null;
      peppolProvider?: string | null;
      defaultDocumentFormat?: "ubl_2_1" | "peppol_bis_3" | "cii_d16b";
      testMode?: boolean;
    }) => d,
  )
  .handler(async ({ data, context }): Promise<EfakturaProfileRow> => {
    const { supabase, userId } = context;
    await assertCompanyMember(supabase, data.companyId, userId);

    const payload: EfakturaProfileInsert = { company_id: data.companyId };
    if (data.enabled !== undefined) payload.enabled = data.enabled;
    if (data.preferredChannel) payload.preferred_channel = data.preferredChannel;
    if (data.peppolParticipantId !== undefined)
      payload.peppol_participant_id = data.peppolParticipantId;
    if (data.peppolScheme !== undefined) payload.peppol_scheme = data.peppolScheme;
    if (data.peppolProvider !== undefined) payload.peppol_provider = data.peppolProvider;
    if (data.defaultDocumentFormat) payload.default_document_format = data.defaultDocumentFormat;
    if (data.testMode !== undefined) payload.test_mode = data.testMode;

    const { data: row, error } = await supabase
      .from("efaktura_profiles")
      .upsert(payload, { onConflict: "company_id" })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const generateEfakturaXmlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string; invoiceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCompanyMember(supabase, data.companyId, userId);
    const { mapToEN16931 } = await import("./en16931.server");
    const { generatePeppolBisXml } = await import("./xml.server");

    const [{ data: company }, { data: profile }, { data: invoice }, { data: items }] =
      await Promise.all([
        supabase.from("companies").select("*").eq("id", data.companyId).maybeSingle(),
        supabase
          .from("efaktura_profiles")
          .select("*")
          .eq("company_id", data.companyId)
          .maybeSingle(),
        supabase
          .from("invoices")
          .select("*")
          .eq("id", data.invoiceId)
          .eq("company_id", data.companyId)
          .maybeSingle(),
        supabase
          .from("invoice_items")
          .select("*")
          .eq("invoice_id", data.invoiceId)
          .order("position"),
      ]);
    if (!company) throw new Error("Firma neexistuje.");
    if (!invoice) throw new Error("Faktúra neexistuje.");

    const dto = mapToEN16931({ company, profile, invoice, items: items ?? [] });
    const result = generatePeppolBisXml(dto);

    // Extra Faktero-side validation (basic completeness).
    const extra: { code: string; message: string }[] = [];
    if (!company.ico) extra.push({ code: "FK-S-ICO", message: "Dodávateľ nemá vyplnené IČO." });
    if (!company.street || !company.city)
      extra.push({ code: "FK-S-ADDR", message: "Dodávateľ nemá kompletnú adresu." });
    if (!invoice.customer_name)
      extra.push({ code: "FK-B-NAME", message: "Odberateľ nemá vyplnený názov." });
    if (!invoice.customer_ico)
      extra.push({ code: "FK-B-ICO", message: "Odberateľ nemá vyplnené IČO." });
    if (!invoice.due_date) extra.push({ code: "FK-DUE", message: "Faktúra nemá splatnosť." });
    if (!invoice.currency) extra.push({ code: "FK-CUR", message: "Faktúra nemá menu." });
    if (!items || items.length === 0)
      extra.push({ code: "FK-LINES", message: "Faktúra nemá žiadne položky." });
    if (dto.taxSubtotals.length === 0) extra.push({ code: "FK-VAT", message: "Chýba rozpis DPH." });
    if (Number(invoice.total) <= 0)
      extra.push({ code: "FK-TOTAL", message: "Celková suma musí byť väčšia ako 0." });

    const allErrors = [...result.validationErrors, ...extra];
    const valid = allErrors.length === 0;

    // Upload XML to private storage.
    const storagePath = `${data.companyId}/${data.invoiceId}.xml`;
    const upload = await supabase.storage
      .from("efaktura-xml")
      .upload(storagePath, new Blob([result.xml], { type: "application/xml" }), {
        upsert: true,
        contentType: "application/xml",
      });
    if (upload.error) throw upload.error;

    // Upsert document row (one per invoice).
    const { data: existing } = await supabase
      .from("efaktura_documents")
      .select("id")
      .eq("company_id", data.companyId)
      .eq("invoice_id", data.invoiceId)
      .maybeSingle();

    const baseRow = {
      company_id: data.companyId,
      invoice_id: data.invoiceId,
      format: result.format,
      schema_version: result.schemaVersion,
      customization_id: result.customizationId,
      profile_id: result.profileId,
      document_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      currency: invoice.currency,
      total: invoice.total,
      xml_payload: result.xml,
      payload_hash: result.payloadHash,
      status: (valid
        ? "validated"
        : "invalid") as Database["public"]["Enums"]["efaktura_doc_status"],
      validation_errors: allErrors as unknown as Json,
      generated_at: new Date().toISOString(),
    };

    let docId: string;
    if (existing) {
      const { error } = await supabase
        .from("efaktura_documents")
        .update(baseRow)
        .eq("id", existing.id);
      if (error) throw error;
      docId = existing.id;
    } else {
      const { data: inserted, error } = await supabase
        .from("efaktura_documents")
        .insert(baseRow)
        .select("id")
        .single();
      if (error) throw error;
      docId = inserted.id;
    }

    return { documentId: docId, valid, validationErrors: allErrors, storagePath };
  });

export const getEfakturaXmlUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string; invoiceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCompanyMember(supabase, data.companyId, userId);
    const path = `${data.companyId}/${data.invoiceId}.xml`;
    const { data: signed, error } = await supabase.storage
      .from("efaktura-xml")
      .createSignedUrl(path, 300, { download: `faktura-${data.invoiceId}.xml` });
    if (error) throw error;
    return { signedUrl: signed.signedUrl };
  });

export const getInvoiceEfakturaDocFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string; invoiceId: string }) => d)
  .handler(async ({ data, context }): Promise<EfakturaDocumentRow | null> => {
    const { supabase, userId } = context;
    await assertCompanyMember(supabase, data.companyId, userId);
    const { data: row } = await supabase
      .from("efaktura_documents")
      .select("*")
      .eq("company_id", data.companyId)
      .eq("invoice_id", data.invoiceId)
      .maybeSingle();
    return row ?? null;
  });

export const listEfakturaDocumentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCompanyMember(supabase, data.companyId, userId);
    const { data: rows, error } = await supabase
      .from("efaktura_documents")
      .select("*, invoices(invoice_number, customer_name, type)")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return rows ?? [];
  });

export const listEfakturaDeliveriesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string }) => d)
  .handler(async ({ data, context }): Promise<EfakturaDeliveryRow[]> => {
    const { supabase, userId } = context;
    await assertCompanyMember(supabase, data.companyId, userId);
    const { data: rows, error } = await supabase
      .from("efaktura_deliveries")
      .select("*")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return rows ?? [];
  });

/* ─── Odosielanie cez ePoštáka ──────────────────────────────────────────── */

/**
 * Spáruje firmu s jej záznamom u ePoštáka a uloží `epostak_firm_id`.
 *
 * Ich API chce `X-Firm-Id` pri každom volaní viazanom na firmu. Doteraz to id
 * nemal kto zistiť — kód ho čakal v metadátach, ale nič ho nezískalo, takže sa
 * odoslať nedalo nič. Páruje sa podľa IČO; keď firma u nich nie je, povie sa to
 * rovno, nie až pri prvom neúspešnom odoslaní.
 */
export const sparujEpostakFirmuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const v = d as { company_id?: string };
    if (!v?.company_id) throw new Error("Chýba company_id.");
    return { company_id: v.company_id };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: Sb; userId: string };
    await assertCompanyMember(supabase, data.company_id, userId);

    const { data: firma, error: chybaFirmy } = await supabase
      .from("companies")
      .select("ico, name")
      .eq("id", data.company_id)
      .maybeSingle();
    if (chybaFirmy) throw chybaFirmy;
    if (!firma?.ico) throw new Error("Firma nemá vyplnené IČO — bez neho sa spárovať nedá.");

    const { nacitajEPostakFirmy, najdiFirmuPodlaIco } = await import("./epostak.server");
    const firmy = await nacitajEPostakFirmy();
    const najdena = najdiFirmuPodlaIco(firmy, firma.ico);

    if (!najdena) {
      return {
        sparovane: false as const,
        ico: firma.ico,
        // Nech je vidieť, čo tam je — inak sa hádа, prečo sa nič nenašlo.
        dostupne: firmy.map((f) => ({ name: f.name, ico: f.ico })),
      };
    }

    const { error: chybaZapisu } = await supabase.from("efaktura_profiles").upsert(
      {
        company_id: data.company_id,
        epostak_firm_id: najdena.id,
        peppol_provider: "epostak",
        peppol_participant_id: najdena.peppolId,
        peppol_scheme: najdena.peppolId?.split(":")[0] ?? null,
      } as EfakturaProfileInsert,
      { onConflict: "company_id" },
    );
    if (chybaZapisu) throw chybaZapisu;

    return {
      sparovane: true as const,
      firmId: najdena.id,
      name: najdena.name,
      peppolId: najdena.peppolId,
      peppolStatus: najdena.peppolStatus,
    };
  });

/**
 * Overí, či sa odberateľovi dá eFaktúra vôbec doručiť.
 *
 * Robí sa to pred odoslaním zámerne: keď príjemca v Peppole nie je, faktúra by
 * odišla do prázdna a zistilo by sa to až tým, že nikdy nedorazí.
 */
export const overPrijemcuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const v = d as { company_id?: string; dic?: string | null; ic_dph?: string | null };
    if (!v?.company_id) throw new Error("Chýba company_id.");
    return { company_id: v.company_id, dic: v.dic ?? null, ic_dph: v.ic_dph ?? null };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: Sb; userId: string };
    await assertCompanyMember(supabase, data.company_id, userId);

    const { peppolId } = await import("./peppol-id");
    const id = peppolId({ dic: data.dic, icDph: data.ic_dph });
    if (!id) return { id: null, dostupny: false as const, dovod: "Odberateľ nemá DIČ ani IČ DPH." };

    const { data: profil } = await supabase
      .from("efaktura_profiles")
      .select("epostak_firm_id")
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!profil?.epostak_firm_id) {
      return { id, dostupny: false as const, dovod: "Firma nie je spárovaná s ePoštákom." };
    }

    const { overPrijemcuUEPostaka } = await import("./epostak.server");
    return await overPrijemcuUEPostaka(id, profil.epostak_firm_id);
  });

/**
 * Odošle faktúru ako eFaktúru.
 *
 * Samotné odoslanie aj zápis doručenia rieši `sendEfaktura`; tu sa overuje,
 * že človek k firme patrí a že je s čím odosielať.
 */
export const posliEfakturuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const v = d as { company_id?: string; invoice_id?: string };
    if (!v?.company_id || !v?.invoice_id) throw new Error("Chýba company_id alebo invoice_id.");
    return { company_id: v.company_id, invoice_id: v.invoice_id };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: Sb; userId: string };
    await assertCompanyMember(supabase, data.company_id, userId);

    // Cudzia faktúra sa nesmie odoslať ani omylom.
    const { data: faktura } = await supabase
      .from("invoices")
      .select("id")
      .eq("id", data.invoice_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!faktura) throw new Error("Faktúra nepatrí tejto firme.");

    const { data: profil } = await supabase
      .from("efaktura_profiles")
      .select("epostak_firm_id, enabled")
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!profil?.epostak_firm_id) {
      throw new Error("Firma nie je spárovaná s ePoštákom — spárujte ju v nastavení eFaktúry.");
    }

    const { sendEfaktura } = await import("./epostak.server");
    const vysledok = await sendEfaktura(data.invoice_id, profil.epostak_firm_id);
    // Surová odpoveď poskytovateľa sa neposiela do stránky — je uložená
    // v `efaktura_deliveries.raw_response` a v prehliadači nemá čo robiť.
    return { documentId: vysledok.documentId, status: vysledok.status };
  });

/**
 * Stiahne eFaktúry doručené firme.
 *
 * Prijímanie dovtedy neexistovalo vôbec — tabuľka aj parsovanie boli hotové,
 * ale nič ich neplnilo, takže stránka „Prijaté eFaktúry" vždy hlásila prázdno.
 */
export const stiahniPrijateEfakturyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const v = d as { company_id?: string };
    if (!v?.company_id) throw new Error("Chýba company_id.");
    return { company_id: v.company_id };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: Sb; userId: string };
    await assertCompanyMember(supabase, data.company_id, userId);

    const { data: profil } = await supabase
      .from("efaktura_profiles")
      .select("epostak_firm_id")
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!profil?.epostak_firm_id) {
      throw new Error("Firma nie je spárovaná s ePoštákom — spárujte ju na prehľade eFaktúry.");
    }

    const { stiahniPrijate } = await import("./epostak.server");
    return await stiahniPrijate(data.company_id, profil.epostak_firm_id);
  });

/** Zoznam prijatých eFaktúr. */
export const listPrijateEfakturyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const v = d as { company_id?: string };
    if (!v?.company_id) throw new Error("Chýba company_id.");
    return { company_id: v.company_id };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: Sb; userId: string };
    await assertCompanyMember(supabase, data.company_id, userId);
    const { data: riadky, error } = await supabase
      .from("efaktura_received_documents")
      .select(
        "id, sender_name, sender_participant_id, document_number, issue_date, due_date, currency, total, vat_total, status, received_at, matched_supplier_invoice_id",
      )
      .eq("company_id", data.company_id)
      .order("received_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return riadky ?? [];
  });
