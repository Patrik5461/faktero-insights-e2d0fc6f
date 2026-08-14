import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Odovzdanie za obdobie — jeden balík pre účtovníčku.
 *
 * Doterajší export bol „vyber si faktúry a stiahni XML". To znamená, že si
 * človek musel sám pamätať, čo už poslal; pri mesačnom odovzdávaní z toho
 * vzniká buď chýbajúci, alebo dvakrát zaúčtovaný doklad. Tu sa vyberá
 * **mesiac** a Faktero vie, čo z neho už išlo.
 *
 * V balíku je XML pre Pohodu, súpiska na kontrolu a PDF faktúr, aby účtovníčka
 * mala aj doklad, nielen údaje.
 */
export type OdovzdanieVstup = {
  companyId: string;
  /** Mesiac v tvare `2026-08`. */
  mesiac: string;
  /** Zapísať do histórie, že tieto doklady sú odovzdané. */
  oznacit: boolean;
  /** Preskočiť už odovzdané doklady. */
  lenNove: boolean;
};

function rozsahMesiaca(mesiac: string): { od: string; do: string } {
  const [r, m] = mesiac.split("-").map(Number);
  const dalsiMesiac = m === 12 ? 1 : m + 1;
  const dalsiRok = m === 12 ? r + 1 : r;
  return {
    od: `${r}-${String(m).padStart(2, "0")}-01`,
    do: `${dalsiRok}-${String(dalsiMesiac).padStart(2, "0")}-01`,
  };
}

function csvHodnota(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

const TYP_DOKLADU: Record<string, string> = {
  regular: "Faktúra",
  proforma: "Zálohová faktúra",
  credit_note: "Dobropis",
};

export const odovzdajUctovnikoviFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: OdovzdanieVstup) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { od, do: doDatumu } = rozsahMesiaca(data.mesiac);

    const [{ data: company, error: cErr }, { data: vsetky, error: iErr }] = await Promise.all([
      supabase.from("companies").select("*").eq("id", data.companyId).single(),
      supabase
        .from("invoices")
        .select("*")
        .eq("company_id", data.companyId)
        .gte("issue_date", od)
        .lt("issue_date", doDatumu)
        .neq("status", "draft")
        .neq("status", "cancelled")
        .is("deleted_at", null)
        .order("issue_date"),
    ]);
    if (cErr) throw new Error(cErr.message);
    if (iErr) throw new Error(iErr.message);
    if (!company) throw new Error("Firma nenájdená");

    // Čo už raz odišlo, sa druhýkrát neposiela — inak doklad pribudne dvakrát.
    const { data: uzOdovzdane } = await supabase
      .from("export_logs")
      .select("invoice_id")
      .eq("company_id", data.companyId)
      .eq("status", "ok");
    const odovzdaneIds = new Set((uzOdovzdane ?? []).map((r) => r.invoice_id));

    const faktury = (vsetky ?? []).filter((f) => !data.lenNove || !odovzdaneIds.has(f.id));
    if (!faktury.length) {
      throw new Error(
        data.lenNove && vsetky?.length
          ? "Všetky faktúry z tohto mesiaca už boli odovzdané"
          : "V tomto mesiaci nie sú žiadne faktúry",
      );
    }

    const { data: polozky, error: pErr } = await supabase
      .from("invoice_items")
      .select("*")
      .in(
        "invoice_id",
        faktury.map((f) => f.id),
      )
      .order("position");
    if (pErr) throw new Error(pErr.message);

    const balik = faktury.map((invoice) => ({
      invoice,
      items: (polozky ?? []).filter((p) => p.invoice_id === invoice.id),
    }));

    const nastavenia = {
      predkontacia: company.pohoda_predkontacia,
      predkontaciaZaloha: company.pohoda_predkontacia_zaloha,
      predkontaciaDobropis: company.pohoda_predkontacia_dobropis,
      clenenieDph: company.pohoda_clenenie_dph,
      clenenieDphPdp: company.pohoda_clenenie_dph_pdp,
      pokladna: company.pohoda_pokladna,
      predkontaciaPokladna: company.pohoda_predkontacia_pokladna,
    };

    const { EXPORT_STRATEGIES, buildPohodaCashXml } = await import("./export.server");
    const vystup = EXPORT_STRATEGIES.pohoda_xml.build({
      company,
      invoices: balik,
      nastavenia,
    });
    const preskocene = new Map(
      (vystup.preskocene ?? []).map((d) => [String(d).split(" — ")[0], String(d)]),
    );
    const vyvezene = faktury.filter((f) => !preskocene.has(f.invoice_number));

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("pohoda-faktury.xml", vystup.content);

    // Súpiska — na nej sa dá skontrolovať, že v XML je naozaj všetko.
    const hlavicka = [
      "cislo",
      "typ",
      "vystavena",
      "dodanie",
      "splatnost",
      "odberatel",
      "ico",
      "ic_dph",
      "zaklad",
      "dph",
      "celkom",
      "mena",
      "v_xml",
    ].join(";");
    const riadky = faktury.map((f) =>
      [
        f.invoice_number,
        TYP_DOKLADU[f.type] ?? f.type,
        f.issue_date,
        f.delivery_date ?? "",
        f.due_date,
        f.customer_name ?? "",
        f.customer_ico ?? "",
        f.customer_ic_dph ?? "",
        f.subtotal,
        f.vat_total,
        f.total,
        f.currency,
        preskocene.has(f.invoice_number) ? `nie — ${preskocene.get(f.invoice_number)}` : "áno",
      ]
        .map(csvHodnota)
        .join(";"),
    );
    zip.file("faktury.csv", "﻿" + [hlavicka, ...riadky].join("\r\n"));

    // Pokladňa za ten istý mesiac. Do balíka ide, len keď v ňom nejaký pohyb je.
    const { data: pokladnica } = await supabase
      .from("cash_entries")
      .select("*")
      .eq("company_id", data.companyId)
      .gte("entry_date", od)
      .lt("entry_date", doDatumu)
      .order("entry_date");
    if (pokladnica?.length) {
      zip.file(
        "pohoda-pokladna.xml",
        buildPohodaCashXml({ company, pohyby: pokladnica, nastavenia }),
      );
    }

    // PDF dokladov. Účtovníčka potrebuje aj samotnú faktúru, nielen údaje;
    // chýbajúce sa dogenerujú, aby balík nebol deravý.
    const { ensureInvoicePdf } = await import("./invoice-pdf.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pdfPriecinok = zip.folder("faktury-pdf")!;
    let chybajucePdf = 0;
    for (const f of vyvezene) {
      try {
        const { path, fileName } = await ensureInvoicePdf(f.id);
        const { data: subor } = await supabaseAdmin.storage.from("invoice-pdfs").download(path);
        if (!subor) {
          chybajucePdf++;
          continue;
        }
        pdfPriecinok.file(fileName, await subor.arrayBuffer());
      } catch {
        // Jedna nevydarená faktúra nesmie zhodiť celé odovzdanie.
        chybajucePdf++;
      }
    }

    const base64 = await zip.generateAsync({ type: "base64" });

    let jobId: string | undefined;
    if (data.oznacit) {
      const { data: job, error: jErr } = await supabase
        .from("export_jobs")
        .insert({
          company_id: data.companyId,
          created_by: userId,
          format: "pohoda_xml",
          target_system: "pohoda",
          status: "completed",
          invoice_count: vyvezene.length,
          date_from: od,
          date_to: faktury[faktury.length - 1]?.issue_date ?? od,
          file_name: `pohoda-faktury-${data.mesiac}.xml`,
          // V histórii sa drží XML, nie celý balík — ZIP s PDF by tabuľku
          // nafúkol a dôležitý je práve importovateľný súbor.
          file_content: vystup.content,
        })
        .select()
        .single();
      if (jErr) throw new Error(jErr.message);
      jobId = job?.id;

      if (job) {
        await supabase.from("export_logs").insert(
          faktury.map((f) => ({
            export_job_id: job.id,
            company_id: data.companyId,
            invoice_id: f.id,
            invoice_number: f.invoice_number,
            status: preskocene.has(f.invoice_number) ? "skipped" : "ok",
            error: preskocene.get(f.invoice_number) ?? null,
          })),
        );
      }
    }

    return {
      base64,
      fileName: `odovzdanie-${data.mesiac}.zip`,
      pocetFaktur: vyvezene.length,
      pocetPokladnicnych: pokladnica?.length ?? 0,
      preskocene: vystup.preskocene ?? [],
      chybajucePdf,
      jobId,
    };
  });

/** Koľko faktúr v mesiaci ešte nebolo odovzdaných — podklad pre tlačidlo. */
export const prehladOdovzdaniaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; mesiac: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { od, do: doDatumu } = rozsahMesiaca(data.mesiac);

    const [{ data: faktury }, { data: logy }, { data: pokladnica }] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, invoice_number, total")
        .eq("company_id", data.companyId)
        .gte("issue_date", od)
        .lt("issue_date", doDatumu)
        .neq("status", "draft")
        .neq("status", "cancelled")
        .is("deleted_at", null),
      supabase
        .from("export_logs")
        .select("invoice_id")
        .eq("company_id", data.companyId)
        .eq("status", "ok"),
      supabase
        .from("cash_entries")
        .select("id")
        .eq("company_id", data.companyId)
        .gte("entry_date", od)
        .lt("entry_date", doDatumu),
    ]);

    const odovzdane = new Set((logy ?? []).map((r) => r.invoice_id));
    const spolu = faktury ?? [];
    return {
      spolu: spolu.length,
      odovzdanych: spolu.filter((f) => odovzdane.has(f.id)).length,
      suma: spolu.reduce((a, f) => a + Number(f.total ?? 0), 0),
      pokladnicnych: pokladnica?.length ?? 0,
    };
  });
