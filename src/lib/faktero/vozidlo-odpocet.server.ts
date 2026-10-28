/*
  Načítanie vozidiel s kráteným odpočtom DPH pre export do účtovníctva a
  výkazy DPH. Číta sa klientom volajúceho (RLS pustí len vozidlá jeho firmy).
*/

import type { OdpocetVozidla } from "./rozuctovanie";
import { kodyBezOdpoctu, odpocetVozidiel } from "./vozidlo-odpocet";

type Klient = any;

/** Vozidlo → krátený odpočet (50 % / bez odpočtu) s kódmi pre neodpočítateľnú časť. */
export async function odpocetVozidielFirmy(
  supabase: Klient,
  companyId: string,
  pomery?: Record<string, unknown> | null,
): Promise<Record<string, OdpocetVozidla>> {
  const { data: vozidla } = await supabase
    .from("vehicles")
    .select("id, name, license_plate, odpocet_dph")
    .eq("company_id", companyId)
    .in("odpocet_dph", ["50", "0"]);
  if (!vozidla?.length) return {};
  let p = pomery;
  if (!p) {
    const { pomeryPredkontacii } = await import("./predkontacie.server");
    p = await pomeryPredkontacii(supabase, companyId);
  }
  const { data: ciselnik } = await supabase
    .from("predkontacie")
    .select("druh, kod, popis, agenda, aktivne")
    .eq("company_id", companyId)
    .eq("druh", "clenenie_dph")
    .eq("aktivne", true)
    .limit(1000);
  return odpocetVozidiel(vozidla, kodyBezOdpoctu(p, ciselnik ?? []));
}
