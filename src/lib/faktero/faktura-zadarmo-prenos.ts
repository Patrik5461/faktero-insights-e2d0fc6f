/*
  Prenos faktúry z verejnej stránky „Faktúra zadarmo“ do účtu — v prehliadači
  prihláseného človeka, existujúcimi cestami zápisu:
  - odberateľ ide do adresára rovnakým zápisom ako „Nový odberateľ“
    (`NewCustomerModal`); s rovnakým IČO sa použije existujúci,
  - koncept faktúry založí `vystavFakturuFn` so stavom „draft“ (ako rýchla
    faktúra) a dátum dodania, jazyk a prenesenie DPH dopíše úprava konceptu.
  Všetko ide pod prihláseným používateľom, takže cudziu firmu odfiltruje RLS.
*/
import { supabase } from "@/integrations/supabase/client";
import {
  doplnenieKonceptu,
  konceptZPrenosu,
  odberatelZPrenosu,
  type FakturaZadarmo,
} from "./faktura-zadarmo";

type Vystav = (a: { data: ReturnType<typeof konceptZPrenosu> }) => Promise<{ id: string }>;

export async function vytvorKonceptZPrenosu(
  f: FakturaZadarmo,
  companyId: string,
  vystav: Vystav,
): Promise<{ invoiceId: string; customerId: string }> {
  let customerId: string | null = null;
  const ico = f.odberatel.ico;
  if (ico) {
    const { data } = await supabase
      .from("customers")
      .select("id")
      .eq("company_id", companyId)
      .eq("ico", ico)
      .is("deleted_at", null)
      .limit(1);
    customerId = data?.[0]?.id ?? null;
  }
  if (!customerId) {
    const { data, error } = await supabase
      .from("customers")
      .insert(odberatelZPrenosu(f, companyId))
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Odberateľa sa nepodarilo uložiť.");
    customerId = data.id;
  }
  const koncept = await vystav({ data: konceptZPrenosu(f, companyId, customerId) });
  // Doplnenie je kozmetika konceptu — keď zlyhá, koncept aj tak existuje.
  const { error } = await supabase
    .from("invoices")
    .update(doplnenieKonceptu(f) as any)
    .eq("id", koncept.id)
    .eq("status", "draft");
  if (error) console.warn("[faktura-zadarmo] koncept sa nedoplnil", error.message);
  return { invoiceId: koncept.id, customerId };
}
