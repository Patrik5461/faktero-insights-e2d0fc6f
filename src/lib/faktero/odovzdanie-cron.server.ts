import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  oznacOdovzdane,
  posliBalikMailom,
  STROP_PRILOH_MAILOM,
  zostavBalik,
  type Riadok,
} from "./odovzdanie.server";

/**
 * Mesačné odovzdanie podkladov účtovníčke.
 *
 * Beží 5. v mesiaci a posiela **minulý mesiac** — do piateho už bývajú doklady
 * doplnené a zároveň ostáva čas do daňových termínov. Posiela sa len firmám,
 * ktoré si to zapli (`odovzdanie_automaticky`) a majú vyplnenú adresu; e-mail
 * v niečím mene sa nesmie posielať bez toho, aby o tom vedel.
 *
 * Ako všade inde platí, že sa posiela len to, čo ešte neodišlo — firma si teda
 * môže balík poslať aj ručne skôr a cron potom nepošle nič alebo len doplnky.
 */
export type VysledokFirmy = {
  firma: string;
  companyId: string;
  stav: "odoslane" | "nic-nove" | "chyba";
  prijemca?: string;
  faktur?: number;
  dokladov?: number;
  pokladnicnych?: number;
  chyba?: string;
};

/** Predchádzajúci mesiac v tvare `2026-07`. */
export function minulyMesiac(dnes: Date): string {
  const r = dnes.getUTCFullYear();
  const m = dnes.getUTCMonth(); // 0–11, teda už „minulý" pri prepočte na 1–12
  const rok = m === 0 ? r - 1 : r;
  const mesiac = m === 0 ? 12 : m;
  return `${rok}-${String(mesiac).padStart(2, "0")}`;
}

export async function runMesacneOdovzdanie(opts: { mesiac?: string; teraz?: Date } = {}) {
  const mesiac = opts.mesiac ?? minulyMesiac(opts.teraz ?? new Date());

  const { data: firmy, error } = await supabaseAdmin
    .from("companies")
    .select("id, name, uctovnik_email")
    .eq("odovzdanie_automaticky", true)
    .not("uctovnik_email", "is", null)
    .is("suspended_at", null);
  if (error) throw new Error(error.message);

  const vysledky: VysledokFirmy[] = [];
  for (const firma of (firmy ?? []) as Riadok[]) {
    try {
      const { balik, company } = await zostavBalik(supabaseAdmin, {
        companyId: firma.id,
        mesiac,
        oznacit: true,
        lenNove: true,
        stropPriloh: STROP_PRILOH_MAILOM,
      });

      await posliBalikMailom({
        company,
        balik,
        prijemca: firma.uctovnik_email,
        poznamka: "Tento balík poslalo Faktero automaticky.",
      });

      const { data: faktury } = await supabaseAdmin
        .from("invoices")
        .select("id, invoice_number")
        .in(
          "id",
          balik.fakturyIds.length ? balik.fakturyIds : ["00000000-0000-0000-0000-000000000000"],
        );
      await oznacOdovzdane(
        supabaseAdmin,
        // Cron nemá používateľa; `created_by` v histórii ostane prázdne.
        { companyId: firma.id, mesiac, userId: null },
        balik,
        faktury ?? [],
      );

      vysledky.push({
        firma: firma.name,
        companyId: firma.id,
        stav: "odoslane",
        prijemca: firma.uctovnik_email,
        faktur: balik.pocetFaktur,
        dokladov: balik.pocetDokladov,
        pokladnicnych: balik.pocetPokladnicnych,
      });
    } catch (e) {
      const sprava = e instanceof Error ? e.message : String(e);
      // „Niet čo poslať" nie je chyba — firma za ten mesiac buď nič nemala,
      // alebo si to už poslala sama.
      const nicNove = /už bolo všetko odovzdané|nie sú žiadne doklady/.test(sprava);
      vysledky.push({
        firma: firma.name,
        companyId: firma.id,
        stav: nicNove ? "nic-nove" : "chyba",
        chyba: nicNove ? undefined : sprava,
      });
    }
  }

  return {
    mesiac,
    firiem: vysledky.length,
    odoslanych: vysledky.filter((v) => v.stav === "odoslane").length,
    chyb: vysledky.filter((v) => v.stav === "chyba").length,
    vysledky,
  };
}
