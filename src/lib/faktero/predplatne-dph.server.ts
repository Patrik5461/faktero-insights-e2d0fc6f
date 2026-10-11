/**
 * Rozhodnutie o prenesení DPH pri platbe predplatného.
 *
 * Bez DPH sa smie fakturovať len platiteľovi z iného štátu EÚ s **platným**
 * IČ DPH — preto VIES. Keď je register nedostupný, platí to, ako sa firma
 * fakturovala naposledy; prvá platba bez overenia ide radšej s DPH (daň navyše
 * si odberateľ vie riešiť, chýbajúca daň je chyba Tobify).
 */
import { mozePrenesenieDph } from "./predplatne-cena";

export async function prenesenieDphPredplatneho(companyId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: firma } = await supabaseAdmin
    .from("companies")
    .select("ic_dph")
    .eq("id", companyId)
    .maybeSingle();
  if (!mozePrenesenieDph(firma)) return false;

  const { overVies } = await import("./vies.server");
  const v = await overVies(String(firma!.ic_dph));
  if (v.platne) return true;
  // Neplatné IČ DPH (register odpovedal) → s DPH. Výpadok registra → posledné rozhodnutie.
  if (!v.chyba || !/nedostupn|odpovedal|UNAVAILABLE|TIMEOUT|BUSY|CONCURRENT/i.test(v.chyba))
    return false;
  const { data: posledna } = await supabaseAdmin
    .from("billing_payments")
    .select("prenesenie_dph")
    .eq("company_id", companyId)
    .eq("status", "PAID")
    .order("paid_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Boolean((posledna as any)?.prenesenie_dph);
}
