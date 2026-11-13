import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  oznacOdovzdane,
  posliBalikMailom,
  rozsahMesiaca,
  STROP_PRILOH_MAILOM,
  zostavBalikRucne,
  type OdovzdanieVstup,
  type Riadok,
} from "./odovzdanie.server";
import { vsetkoAkoData } from "./strankovanie";

export type { OdovzdanieVstup };

export const odovzdajUctovnikoviFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: OdovzdanieVstup) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    /*
      Závažné chyby (doklad by Pohoda mohla zaúčtovať zle) odovzdanie
      nezastavia — prvé volanie vráti ich zoznam, po potvrdení
      (`potvrdeneVarovania`) idú doklady do XML aj tak.
    */
    const zostavene = await zostavBalikRucne(supabase, data);
    if (!zostavene.balik) return { zavazne: zostavene.zavazne, varovania: [] as string[] };
    const { balik } = zostavene;

    let jobId: string | undefined;
    if (data.oznacit) {
      // Po dávkach — nad tisíc faktúr za mesiac by `.in()` časť nevrátil.
      const { riadkyPreIds } = await import("./strankovanie");
      const faktury = await riadkyPreIds<{ id: string; invoice_number: string }>(
        balik.fakturyIds,
        (kus, od, po) =>
          supabase
            .from("invoices")
            .select("id, invoice_number")
            .in("id", kus)
            .order("id")
            .range(od, po),
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
      pocetPrijatych: balik.pocetPrijatych ?? 0,
      pocetPokladnicnych: balik.pocetPokladnicnych,
      pocetOstatnych: balik.pocetOstatnych,
      preskocene: balik.preskocene,
      vynechanePrilohy: balik.vynechanePrilohy,
      zavazne: [] as string[],
      varovania: [] as string[],
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
    // Závažné chyby najprv na potvrdenie — mail odíde až po ňom.
    const zostavene = await zostavBalikRucne(supabase, {
      ...data,
      stropPriloh: STROP_PRILOH_MAILOM,
    });
    if (!zostavene.balik) return { zavazne: zostavene.zavazne, varovania: [] as string[] };
    const { balik, company } = zostavene;

    const prijemca = (data.email || company.uctovnik_email || "").trim();
    await posliBalikMailom({
      company,
      balik,
      prijemca,
      poznamka: data.poznamka,
      userId: context.userId,
    });

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
      pocetPrijatych: balik.pocetPrijatych ?? 0,
      pocetPokladnicnych: balik.pocetPokladnicnych,
      pocetOstatnych: balik.pocetOstatnych,
      vynechanePrilohy: balik.vynechanePrilohy,
      preskocene: balik.preskocene,
      zavazne: [] as string[],
      varovania: [] as string[],
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
      { data: prijate },
    ] = await Promise.all([
      vsetkoAkoData((zac, kon) =>
        supabase
          .from("invoices")
          .select("id, total, type, currency")
          .eq("company_id", data.companyId)
          .gte("issue_date", od)
          .lt("issue_date", doDatumu)
          .neq("status", "draft")
          .neq("status", "cancelled")
          .is("deleted_at", null)
          .order("id")
          .range(zac, kon),
      ),
      vsetkoAkoData((zac, kon) =>
        supabase
          .from("export_logs")
          .select("invoice_id")
          .eq("company_id", data.companyId)
          .eq("status", "ok")
          .order("id")
          .range(zac, kon),
      ),
      vsetkoAkoData((zac, kon) =>
        supabase
          .from("cash_entries")
          .select("id")
          .eq("company_id", data.companyId)
          .gte("entry_date", od)
          .lt("entry_date", doDatumu)
          .order("id")
          .range(zac, kon),
      ),
      vsetkoAkoData((zac, kon) =>
        supabase
          .from("expense_documents")
          .select("id, exported_at")
          .eq("company_id", data.companyId)
          // Nespracované bločky balík nenesie, tak ich nepočítať ani tu.
          .neq("status", "new")
          .gte("issue_date", od)
          .lt("issue_date", doDatumu)
          .order("id")
          .range(zac, kon),
      ),
      supabase
        .from("companies")
        .select("uctovnik_email, country")
        .eq("id", data.companyId)
        .single(),
      vsetkoAkoData((zac, kon) =>
        supabase
          .from("purchase_invoices")
          .select("id, exported_at, samofakturacia, samofakturacia_stav")
          .eq("company_id", data.companyId)
          .gte("issue_date", od)
          .lt("issue_date", doDatumu)
          .is("deleted_at", null)
          .in("type", ["regular", "proforma"])
          .not("status", "in", "(draft,cancelled)")
          .order("id")
          .range(zac, kon),
      ),
    ]);
    const { zapocitatelna } = await import("./samofakturacia");
    const { sumyOdovzdania } = await import("./odovzdanie-exportu");
    const { domacaMena } = await import("./kurzy");
    const prij = (prijate ?? []).filter((p: Riadok) => zapocitatelna(p));

    const odovzdane = new Set((logy ?? []).map((r: Riadok) => r.invoice_id));
    const spolu = faktury ?? [];
    const dok = doklady ?? [];
    return {
      obdobie: nazov,
      spolu: spolu.length,
      odovzdanych: spolu.filter((f: Riadok) => odovzdane.has(f.id)).length,
      // Po menách, bez zálohových faktúr a dokladov k platbe (E-01, E-02).
      sumy: sumyOdovzdania(spolu, domacaMena(firma?.country)),
      pokladnicnych: pokladnica?.length ?? 0,
      dokladov: dok.length,
      dokladovNovych: dok.filter((d: Riadok) => !d.exported_at).length,
      prijatych: prij.length,
      prijatychNovych: prij.filter((p: Riadok) => !p.exported_at).length,
      uctovnikEmail: (firma?.uctovnik_email ?? null) as string | null,
    };
  });
