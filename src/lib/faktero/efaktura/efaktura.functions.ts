import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { OdosielanieFirmy, ReadinessReport } from "./types";
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

/** Či eFaktúra beží v testovacom prostredí ePoštáka — doklady potom nikam neodídu. */
export const efakturaRezimFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { jeTestovaciRezim } = await import("./epostak.server");
    return { testovaci: jeTestovaciRezim() };
  });

export const getEfakturaReadinessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string }) => d)
  .handler(
    async ({
      data,
      context,
    }): Promise<
      ReadinessReport & { profile: EfakturaProfileRow | null; odosielanie: OdosielanieFirmy | null }
    > => {
      const { supabase, userId } = context;
      await assertCompanyMember(supabase, data.companyId, userId);
      const { computeReadiness } = await import("./readiness.server");

      const [
        { data: company },
        { data: profile },
        { count: invoiceCount },
        { count: validatedCount },
        { data: neuspesne },
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
          .eq("company_id", data.companyId)
          .is("deleted_at", null),
        supabase
          .from("efaktura_documents")
          .select("id", { count: "exact", head: true })
          .eq("company_id", data.companyId)
          .in("status", ["validated", "generated"]),
        // Neúspešná kontrola sa ráta len pri existujúcej faktúre — zmazaná faktúra
        // ostala v zozname navždy a upozornenie sa nedalo odstrániť.
        supabase
          .from("efaktura_documents")
          .select("invoice_id, created_at, invoices!inner(deleted_at)")
          .eq("company_id", data.companyId)
          .eq("status", "invalid")
          .is("invoices.deleted_at", null)
          .limit(200),
      ]);
      if (!company) throw new Error("Firma neexistuje alebo k nej nemáte prístup.");

      // Faktúra opravená a znova vygenerovaná má novší úspešný dokument — stará chyba už neplatí.
      const sChybou = (neuspesne ?? []) as { invoice_id: string | null; created_at: string }[];
      let invalidCount = sChybou.length;
      if (sChybou.length) {
        const { data: neskorsie } = await supabase
          .from("efaktura_documents")
          .select("invoice_id, created_at")
          .eq("company_id", data.companyId)
          .neq("status", "invalid")
          .in(
            "invoice_id",
            sChybou.map((d) => d.invoice_id).filter((x): x is string => !!x),
          );
        invalidCount = sChybou.filter(
          (d) =>
            !(neskorsie ?? []).some(
              (n: any) => n.invoice_id === d.invoice_id && n.created_at > d.created_at,
            ),
        ).length;
      }

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

      /*
        Onboarding „len odosielanie“ je v tabuľke len pre server — členstvo vo
        firme je overené vyššie, von ide len stav a text pre firmu.
      */
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: o } = await (supabaseAdmin as any)
        .from("efaktura_odosielanie_ziadosti")
        .select("stav, next_action, client_message_sk, prijem_poskytovatel, aktivovane_at")
        .eq("company_id", data.companyId)
        .maybeSingle();
      const odosielanie: OdosielanieFirmy | null = o
        ? {
            stav: o.stav,
            nextAction: o.next_action ?? null,
            sprava: o.client_message_sk ?? null,
            prijemPoskytovatel: o.prijem_poskytovatel ?? null,
            aktivovaneAt: o.aktivovane_at ?? null,
          }
        : null;

      return { ...report, profile: profile ?? null, odosielanie };
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
    /*
      eFaktúra je len medzi firmami. Faktúra pre súkromnú osobu (bez IČO, DIČ
      aj IČ DPH) by sa zapísala ako neúspešná a znižovala by pripravenosť,
      hoci s ňou nie je nič zlé — ide ďalej ako PDF.
    */
    if (!invoice.customer_ico && !invoice.customer_dic && !invoice.customer_ic_dph) {
      throw new Error(
        "Odberateľ je súkromná osoba (nemá IČO ani DIČ) — eFaktúra sa posiela len firmám. Túto faktúru pošlite ako PDF.",
      );
    }

    // Dobropis nesie číslo a dátum pôvodnej faktúry (BT-25, BT-26).
    let povodnaFaktura: { cislo: string; vystavena: string | null } | null = null;
    if ((invoice as any).opravuje_fakturu_id) {
      const { data: p } = await supabase
        .from("invoices")
        .select("invoice_number, issue_date")
        .eq("id", (invoice as any).opravuje_fakturu_id)
        .maybeSingle();
      if (p) povodnaFaktura = { cislo: p.invoice_number, vystavena: p.issue_date };
    }
    const { nacitajOdpocty } = await import("../zalohy-odpocty.server");
    const zalohy =
      (await nacitajOdpocty(supabase, data.companyId, [data.invoiceId]))[data.invoiceId] ?? null;
    const dto = mapToEN16931({
      company,
      profile,
      invoice,
      items: items ?? [],
      povodnaFaktura,
      zalohy,
    });
    const result = generatePeppolBisXml(dto);
    /*
      PDF faktúry ako príloha (BG-24) — to isté PDF, ktoré pri odoslaní
      priloží ePošták. Do súboru na stiahnutie ide s PDF; v `xml_payload`
      ostáva XML bez base64, inak by zoznam odoslaných ťahal všetky PDF naraz.
    */
    let xmlNaUlozenie = result.xml;
    try {
      const { pdfFakturyNaPrilohu } = await import("./prilohy-efaktury.server");
      const pdf = await pdfFakturyNaPrilohu(invoice as any, company as any);
      xmlNaUlozenie = generatePeppolBisXml({
        ...dto,
        prilohy: [
          {
            // Ako ePošták: ID prílohy je názov súboru.
            id: pdf.nazov,
            popis: pdf.popis,
            mime: "application/pdf",
            nazov: pdf.nazov,
            obsah: pdf.bajty.toString("base64"),
          },
        ],
      }).xml;
    } catch (e) {
      console.warn("[efaktura] PDF sa do XML nepriložilo:", String((e as Error)?.message ?? e));
    }

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
    // Dobropis je v DB záporný — rozhoduje, že suma nie je nulová.
    if (Number(invoice.total ?? 0) === 0)
      extra.push({ code: "FK-TOTAL", message: "Celková suma nesmie byť nulová." });

    const allErrors = [...result.validationErrors, ...extra];
    const valid = allErrors.length === 0;

    // Upload XML to private storage.
    /*
      Bucket `efaktura-xml` zapisuje len service_role — klient používateľa
      dostal „new row violates row-level security policy“ a tlačidlo
      „Vygenerovať eFaktúru XML“ nefungovalo nikomu. Členstvo vo firme je
      overené vyššie a faktúra načítaná cez RLS, cesta je z ich id.
    */
    const storagePath = `${data.companyId}/${data.invoiceId}.xml`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const upload = await supabaseAdmin.storage
      .from("efaktura-xml")
      .upload(storagePath, new Blob([xmlNaUlozenie], { type: "application/xml" }), {
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
    // Čítať z `efaktura-xml` smie len service_role; cesta je vo firme, ktorej je používateľ členom.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
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
        // Firma zapísaná v Peppole je spárovaním hotová — inak by ostala „vypnutá“
        // a nikde v rozhraní sa zapnúť nedá.
        ...(najdena.peppolId
          ? { enabled: true, test_mode: false, activated_at: new Date().toISOString() }
          : {}),
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
    const v = d as {
      company_id?: string;
      invoice_id?: string;
      s_pdf?: boolean;
      prilohy?: unknown;
      potvrdeny_stary_datum?: boolean;
    };
    if (!v?.company_id || !v?.invoice_id) throw new Error("Chýba company_id alebo invoice_id.");
    const prilohy = Array.isArray(v.prilohy) ? v.prilohy : [];
    if (prilohy.length > 20 || prilohy.some((x) => typeof x !== "string" || !/^[0-9a-f-]{36}$/i.test(x))) {
      throw new Error("Neplatný zoznam príloh.");
    }
    return {
      company_id: v.company_id,
      invoice_id: v.invoice_id,
      // Bez voľby ide PDF faktúry vždy (staré volania, iné obrazovky).
      s_pdf: v.s_pdf !== false,
      prilohy: prilohy as string[],
      potvrdeny_stary_datum: v.potvrdeny_stary_datum === true,
    };
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
    const vysledok = await sendEfaktura(data.invoice_id, profil.epostak_firm_id, {
      sPdf: data.s_pdf,
      prilohyIds: data.prilohy,
    }, { potvrdenyStaryDatum: data.potvrdeny_stary_datum });
    // Surová odpoveď poskytovateľa sa neposiela do stránky — je uložená
    // v `efaktura_deliveries.raw_response` a v prehliadači nemá čo robiť.
    return {
      documentId: vysledok.documentId,
      status: vysledok.status,
      varovania: vysledok.varovania ?? [],
    };
  });

/**
 * Kontrola eFaktúry pred odoslaním — to isté, čo spraví `sendEfaktura`, len
 * bez odoslania. Okno odoslania ju volá pri otvorení, hromadné odosielanie
 * pred začatím. Vracia výsledok pre každú faktúru (`null` = nepatrí firme).
 */
export const skontrolujPredOdoslanimFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const v = d as { company_id?: string; invoice_ids?: unknown };
    const ids = Array.isArray(v?.invoice_ids) ? v.invoice_ids : [];
    if (!v?.company_id || !ids.length) throw new Error("Chýba company_id alebo invoice_ids.");
    if (ids.length > 200 || ids.some((x) => typeof x !== "string" || !/^[0-9a-f-]{36}$/i.test(x))) {
      throw new Error("Neplatný zoznam faktúr.");
    }
    return { company_id: v.company_id, invoice_ids: ids as string[] };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: Sb; userId: string };
    await assertCompanyMember(supabase, data.company_id, userId);
    const { nacitajAKontrolujFakturu } = await import("./kontrola-odoslania.server");
    const out: Record<
      string,
      Awaited<ReturnType<typeof nacitajAKontrolujFakturu>>
    > = {};
    // Po piatich — každá faktúra sú štyri dotazy.
    for (let i = 0; i < data.invoice_ids.length; i += 5) {
      const davka = data.invoice_ids.slice(i, i + 5);
      const vysledky = await Promise.all(
        davka.map((id) => nacitajAKontrolujFakturu(supabase, data.company_id, id)),
      );
      davka.forEach((id, j) => (out[id] = vysledky[j]));
    }
    return out;
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
    const r = await stiahniPrijate(data.company_id, profil.epostak_firm_id);
    if (r.lenOdosielanie) {
      throw new Error("Prijaté eFaktúry vám chodia k vášmu poskytovateľovi príjmu — z Faktera eFaktúry len odosielate.");
    }
    return r;
  });

/**
 * Prijaté eFaktúry v pôvodnom UBL (Peppol BIS) ako ZIP — POHODA ich od verzie
 * Jeseň 2026 načíta povelom „Import z BIS“, takže sa nemusia prepisovať.
 */
export const stiahniPrijateBisFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const v = d as { company_id?: string; ids?: unknown };
    if (!v?.company_id) throw new Error("Chýba company_id.");
    const ids = Array.isArray(v.ids) ? v.ids.filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)) : [];
    return { company_id: v.company_id, ids: ids.slice(0, 500) as string[] };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: Sb; userId: string };
    await assertCompanyMember(supabase, data.company_id, userId);
    let q = supabase
      .from("efaktura_received_documents")
      .select("id, document_number, sender_name, xml_payload")
      .eq("company_id", data.company_id)
      .not("xml_payload", "is", null)
      .order("received_at", { ascending: false })
      .limit(500);
    if (data.ids.length) q = q.in("id", data.ids);
    const { data: riadky, error } = await q;
    if (error) throw error;
    if (!riadky?.length) throw new Error("Žiadna prijatá eFaktúra s pôvodným XML na stiahnutie.");
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const mena = new Set<string>();
    for (const r of riadky) {
      let meno = `${String(r.document_number || r.id).replace(/[^\w.-]+/g, "-")}`;
      if (mena.has(meno)) meno = `${meno}-${String(r.id).slice(0, 8)}`;
      mena.add(meno);
      zip.file(`${meno}.xml`, String(r.xml_payload));
    }
    const content = await zip.generateAsync({ type: "base64", compression: "DEFLATE" });
    return {
      fileName: `prijate-efaktury-bis-${new Date().toISOString().slice(0, 10)}.zip`,
      content,
      pocet: riadky.length,
    };
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
        "id, sender_name, sender_participant_id, document_number, issue_date, due_date, currency, total, vat_total, status, received_at, matched_supplier_invoice_id, nespracovany_id",
      )
      .eq("company_id", data.company_id)
      .order("received_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return riadky ?? [];
  });

/**
 * Zaeviduje prijatú eFaktúru — podľa nastavenia firmy medzi Prijaté faktúry
 * alebo do Nespracovaných dokladov (zálohová vždy medzi prijaté zálohové).
 *
 * Bez tohto je zoznam doručených eFaktúr len na pozeranie — doklad by sa
 * musel prepísať ručne, hoci všetky údaje sú v ňom rozobraté. Druhé kliknutie
 * nevyrobí druhý doklad (`zaevidovanie-efaktury.server.ts`).
 */
export const zaevidujPrijatuEfakturuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const v = d as { company_id?: string; received_id?: string };
    if (!v?.company_id || !v?.received_id) throw new Error("Chýba company_id alebo received_id.");
    return { company_id: v.company_id, received_id: v.received_id };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: Sb; userId: string };
    await assertCompanyMember(supabase, data.company_id, userId);
    const { zaevidujPrijatuEfakturu, nastaveniePrijmuFirmy } = await import("./zaevidovanie-efaktury.server");
    const nastavenie = await nastaveniePrijmuFirmy(supabase, data.company_id);
    const v = await zaevidujPrijatuEfakturu(supabase, {
      companyId: data.company_id,
      receivedId: data.received_id,
      userId,
      nastavenie,
    });
    return {
      ...v,
      // Staršie volania čakajú `invoiceId` / `uzExistovala`.
      invoiceId: v.kam === "prijate" ? v.id : null,
      uzExistovala: v.uzExistoval,
      otvorit: nastavenie.otvorit,
    };
  });

/** Nastavenie príjmu eFaktúr firmy (kam zaradiť, automaticky, otvoriť) a stavy dokladov na výber. */
export const nastaveniePrijmuEfakturFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const v = d as { company_id?: string };
    if (!v?.company_id) throw new Error("Chýba company_id.");
    return { company_id: v.company_id };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: Sb; userId: string };
    await assertCompanyMember(supabase, data.company_id, userId);
    const { nastaveniePrijmuFirmy } = await import("./zaevidovanie-efaktury.server");
    const [nastavenie, { data: stavy }, { data: spravca }, { data: profil }] = await Promise.all([
      nastaveniePrijmuFirmy(supabase, data.company_id),
      supabase
        .from("stavy_dokladov")
        .select("id, nazov, farba")
        .eq("company_id", data.company_id)
        .eq("aktivne", true)
        .order("poradie"),
      supabase.rpc("is_company_admin", { _company_id: data.company_id, _user_id: userId }),
      supabase.from("efaktura_profiles").select("id").eq("company_id", data.company_id).maybeSingle(),
    ]);
    return {
      nastavenie,
      stavy: (stavy ?? []) as { id: string; nazov: string; farba: string | null }[],
      smieMenit: Boolean(spravca),
      maProfil: Boolean(profil),
    };
  });

/** Uloží nastavenie príjmu eFaktúr. Meniť ho smie len majiteľ alebo správca firmy. */
export const ulozNastaveniePrijmuEfakturFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const v = d as {
      company_id?: string;
      ciel?: unknown;
      stav_id?: unknown;
      automaticky?: unknown;
      otvorit?: unknown;
    };
    if (!v?.company_id) throw new Error("Chýba company_id.");
    if (v.ciel !== "prijate" && v.ciel !== "nespracovane") throw new Error("Neznáme zaradenie.");
    const stav = typeof v.stav_id === "string" && /^[0-9a-f-]{36}$/i.test(v.stav_id) ? v.stav_id : null;
    return {
      company_id: v.company_id,
      ciel: v.ciel as "prijate" | "nespracovane",
      stav_id: v.ciel === "prijate" ? stav : null,
      automaticky: v.automaticky === true,
      otvorit: v.otvorit !== false,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: Sb; userId: string };
    const { data: spravca, error: chybaRoly } = await supabase.rpc("is_company_admin", {
      _company_id: data.company_id,
      _user_id: userId,
    });
    if (chybaRoly) throw chybaRoly;
    if (!spravca) throw new Error("Nastavenie príjmu eFaktúr môže meniť len majiteľ alebo správca firmy.");
    if (data.stav_id) {
      const { data: stav } = await supabase
        .from("stavy_dokladov")
        .select("id")
        .eq("id", data.stav_id)
        .eq("company_id", data.company_id)
        .maybeSingle();
      if (!stav) throw new Error("Zvolený stav dokladu vo firme neexistuje.");
    }
    const { data: profil, error } = await supabase
      .from("efaktura_profiles")
      .update({
        prijem_ciel: data.ciel,
        prijem_stav_id: data.stav_id,
        prijem_automaticky: data.automaticky,
        prijem_otvorit: data.otvorit,
      } as EfakturaProfileUpdate)
      .eq("company_id", data.company_id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profil) throw new Error("Firma ešte nemá profil eFaktúry — najprv ju spárujte s ePoštákom.");
    return { ok: true as const };
  });

/**
 * Náhľad prijatej eFaktúry ako PDF (base64). Priložené PDF odosielateľa, inak
 * faktúra vykreslená z XML. Zaevidovaná faktúra bez prílohy ho pri tom dostane.
 */
export const nahladPrijatejEfakturyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const v = d as { company_id?: string; received_id?: string };
    if (!v?.company_id || !v?.received_id) throw new Error("Chýba company_id alebo received_id.");
    return { company_id: v.company_id, received_id: v.received_id };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: Sb; userId: string };
    await assertCompanyMember(supabase, data.company_id, userId);
    const { data: doklad } = await supabase
      .from("efaktura_received_documents")
      .select("xml_payload, matched_supplier_invoice_id, document_number")
      .eq("id", data.received_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!doklad?.xml_payload) throw new Error("eFaktúra nemá uložené XML — náhľad sa nedá vytvoriť.");
    const { pdfPrijatejEfaktury, prilozPdfKPrijatej } = await import("./nahlad.server");
    const { bajty, prilozene } = await pdfPrijatejEfaktury(String(doklad.xml_payload));
    if (doklad.matched_supplier_invoice_id) {
      await prilozPdfKPrijatej(supabase, data.company_id, doklad.matched_supplier_invoice_id, String(doklad.xml_payload));
    }
    return {
      pdf: Buffer.from(bajty).toString("base64"),
      prilozene,
      nazov: `efaktura-${String(doklad.document_number ?? data.received_id).replace(/[^\w.-]+/g, "_")}.pdf`,
    };
  });

/**
 * Prílohy prijatej eFaktúry (BG-24) — zoznam bez obsahu. Dáta sú v uloženom
 * XML; okrem PDF faktúry tam býva výkaz prác, dodací list či tabuľka.
 */
export const prilohyPrijatejEfakturyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const v = d as { company_id?: string; received_id?: string };
    if (!v?.company_id || !v?.received_id) throw new Error("Chýba company_id alebo received_id.");
    return { company_id: v.company_id, received_id: v.received_id };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: Sb; userId: string };
    await assertCompanyMember(supabase, data.company_id, userId);
    const { data: doklad } = await supabase
      .from("efaktura_received_documents")
      .select("xml_payload")
      .eq("id", data.received_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!doklad?.xml_payload) return { prilohy: [] };
    const { prilohyZXml } = await import("./nahlad.server");
    return { prilohy: prilohyZXml(String(doklad.xml_payload)) };
  });

/** Jedna príloha prijatej eFaktúry na stiahnutie (base64). */
export const prilohaPrijatejEfakturyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const v = d as { company_id?: string; received_id?: string; index?: unknown };
    const index = Number(v?.index);
    if (!v?.company_id || !v?.received_id || !Number.isInteger(index) || index < 0) {
      throw new Error("Chýba company_id, received_id alebo poradie prílohy.");
    }
    return { company_id: v.company_id, received_id: v.received_id, index };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: Sb; userId: string };
    await assertCompanyMember(supabase, data.company_id, userId);
    const { data: doklad } = await supabase
      .from("efaktura_received_documents")
      .select("xml_payload")
      .eq("id", data.received_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!doklad?.xml_payload) throw new Error("eFaktúra nemá uložené XML.");
    const { obsahPrilohy } = await import("./nahlad.server");
    const p = obsahPrilohy(String(doklad.xml_payload), data.index);
    if (!p) throw new Error("Táto príloha nie je vložená v eFaktúre — je len odkazom na externú adresu.");
    return {
      nazov: p.meta.nazov.replace(/[\\/:*?"<>|]+/g, "_"),
      mime: p.meta.mime ?? "application/octet-stream",
      obsah: Buffer.from(p.bajty).toString("base64"),
    };
  });
