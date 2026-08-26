/**
 * Nočná obsluha eFaktúry: stiahnuť doručené a doplniť stavy odoslaných.
 *
 * Bez nej sa prijaté eFaktúry objavia, len keď si niekto spomenie kliknúť na
 * „Stiahnuť nové", a pri odoslaných ostane navždy stav z okamihu odoslania —
 * teda „odoslané", aj keby doklad u odberateľa nikdy neskončil.
 *
 * Beží za všetky firmy, ktoré sú spárované s ePoštákom. Chyba jednej firmy
 * nesmie zastaviť ostatné: banka aj Peppol občas vrátia 500 a jeden zlý účet
 * by inak umlčal celú nočnú úlohu.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Stavy, pri ktorých sa už nemá čo zmeniť — tie sa nedoťahujú. */
const HOTOVE = new Set(["delivered", "accepted", "rejected", "failed"]);

export type VysledokFirmy = {
  companyId: string;
  novychPrijatych?: number;
  obnovenychStavov?: number;
  chyba?: string;
};

export async function spustiNocnuEfakturu(): Promise<{
  firiem: number;
  vysledky: VysledokFirmy[];
}> {
  const { data: profily, error } = await supabaseAdmin
    .from("efaktura_profiles")
    .select("company_id, epostak_firm_id")
    .not("epostak_firm_id", "is", null);
  if (error) throw new Error(error.message);

  const vysledky: VysledokFirmy[] = [];
  for (const p of (profily ?? []) as { company_id: string; epostak_firm_id: string }[]) {
    const v: VysledokFirmy = { companyId: p.company_id };
    try {
      const { stiahniPrijate, getEfakturaStatus } = await import("./epostak.server");

      const prijate = await stiahniPrijate(p.company_id, p.epostak_firm_id);
      v.novychPrijatych = prijate.novych;

      /*
        Stav sa doťahuje len k doručeniam, ktoré ešte niekam smerujú. Hotové
        by sa pýtali donekonečna a míňali by kvótu za nič.
      */
      const { data: cakajuce } = await supabaseAdmin
        .from("efaktura_deliveries")
        .select("provider_message_id, status")
        .eq("company_id", p.company_id)
        .not("provider_message_id", "is", null)
        .limit(200);

      let obnovenych = 0;
      for (const d of (cakajuce ?? []) as { provider_message_id: string; status: string }[]) {
        if (HOTOVE.has(d.status)) continue;
        try {
          await getEfakturaStatus(d.provider_message_id, p.epostak_firm_id);
          obnovenych += 1;
        } catch {
          // Jeden doklad, ktorý sa nepodarí zistiť, nesmie zhodiť zvyšok.
        }
      }
      v.obnovenychStavov = obnovenych;
    } catch (e: any) {
      v.chyba = e?.message ?? "neznáma chyba";
    }
    vysledky.push(v);
  }

  return { firiem: vysledky.length, vysledky };
}
