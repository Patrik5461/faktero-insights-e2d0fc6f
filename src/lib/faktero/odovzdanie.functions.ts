import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  oznacOdovzdane,
  posliBalikMailom,
  rozsahMesiaca,
  STROP_PRILOH_MAILOM,
  zostavBalik,
  type OdovzdanieVstup,
  type Riadok,
} from "./odovzdanie.server";

export type { OdovzdanieVstup };

export const odovzdajUctovnikoviFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: OdovzdanieVstup) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { balik } = await zostavBalik(supabase, data);

    let jobId: string | undefined;
    if (data.oznacit) {
      const { data: faktury } = await supabase
        .from("invoices")
        .select("id, invoice_number")
        .in(
          "id",
          balik.fakturyIds.length ? balik.fakturyIds : ["00000000-0000-0000-0000-000000000000"],
        );
      jobId = await oznacOdovzdane(
        supabase,
        { companyId: data.companyId, mesiac: data.mesiac, userId },
        balik,
        faktury ?? [],
      );
    }

    return {
      base64: balik.base64,
      fileName: balik.fileName,
      pocetFaktur: balik.pocetFaktur,
      pocetDokladov: balik.pocetDokladov,
      pocetPokladnicnych: balik.pocetPokladnicnych,
      preskocene: balik.preskocene,
      vynechanePrilohy: balik.vynechanePrilohy,
      jobId,
    };
  });

/**
 * Ten istý balík, ale rovno účtovníčke do schránky.
 *
 * Bez tohto sa balík stiahne a človek ho musí preposlať sám — čo je presne ten
 * medzikrok, kvôli ktorému sa na odovzdávanie zabúda.
 */
export const posliOdovzdanieMailomFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: OdovzdanieVstup & { email?: string; poznamka?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { balik, company } = await zostavBalik(supabase, {
      ...data,
      stropPriloh: STROP_PRILOH_MAILOM,
    });

    const prijemca = (data.email || company.uctovnik_email || "").trim();
    await posliBalikMailom({ company, balik, prijemca, poznamka: data.poznamka });

    // Adresa zadaná pri odosielaní sa zapamätá, aby ju človek nemusel písať
    // každý mesiac znovu — presne to sľubuje aj výzva v rozhraní.
    if (prijemca !== company.uctovnik_email) {
      await supabase
        .from("companies")
        .update({ uctovnik_email: prijemca })
        .eq("id", data.companyId);
    }

    let jobId: string | undefined;
    if (data.oznacit) {
      const { data: faktury } = await supabase
        .from("invoices")
        .select("id, invoice_number")
        .in(
          "id",
          balik.fakturyIds.length ? balik.fakturyIds : ["00000000-0000-0000-0000-000000000000"],
        );
      jobId = await oznacOdovzdane(
        supabase,
        { companyId: data.companyId, mesiac: data.mesiac, userId },
        balik,
        faktury ?? [],
      );
    }

    return {
      prijemca,
      pocetFaktur: balik.pocetFaktur,
      pocetDokladov: balik.pocetDokladov,
      pocetPokladnicnych: balik.pocetPokladnicnych,
      vynechanePrilohy: balik.vynechanePrilohy,
      preskocene: balik.preskocene,
      jobId,
    };
  });

/** Koľko dokladov v mesiaci ešte nebolo odovzdaných — podklad pre tlačidlá. */
export const prehladOdovzdaniaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; mesiac: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { od, do: doDatumu, nazov } = rozsahMesiaca(data.mesiac);

    const [
      { data: faktury },
      { data: logy },
      { data: pokladnica },
      { data: doklady },
      { data: firma },
    ] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, total")
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
      supabase
        .from("expense_documents")
        .select("id, exported_at")
        .eq("company_id", data.companyId)
        .gte("issue_date", od)
        .lt("issue_date", doDatumu),
      supabase.from("companies").select("uctovnik_email").eq("id", data.companyId).single(),
    ]);

    const odovzdane = new Set((logy ?? []).map((r: Riadok) => r.invoice_id));
    const spolu = faktury ?? [];
    const dok = doklady ?? [];
    return {
      obdobie: nazov,
      spolu: spolu.length,
      odovzdanych: spolu.filter((f: Riadok) => odovzdane.has(f.id)).length,
      suma: spolu.reduce((a: number, f: Riadok) => a + Number(f.total ?? 0), 0),
      pokladnicnych: pokladnica?.length ?? 0,
      dokladov: dok.length,
      dokladovNovych: dok.filter((d: Riadok) => !d.exported_at).length,
      uctovnikEmail: (firma?.uctovnik_email ?? null) as string | null,
    };
  });
