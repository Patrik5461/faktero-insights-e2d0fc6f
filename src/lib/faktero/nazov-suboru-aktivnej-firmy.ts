/*
  Firma na konci názvu súboru, ktorý sa skladá až v prehliadači (ZIP s PDF,
  Excel zo zoznamu). Názov firmy sa raz načíta a zapamätá; keď sa nepodarí,
  súbor sa stiahne pod pôvodným názvom — sťahovanie kvôli tomu nesmie zlyhať.
*/
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "./active-company";
import { nazovSuboruSFirmou } from "./nazov-suboru-firmy";

const nazvyFiriem = new Map<string, string | null>();

export async function sFirmouAktivnej(nazov: string, companyId?: string | null): Promise<string> {
  const id = companyId ?? getActiveCompanyId();
  if (!id) return nazov;
  try {
    if (!nazvyFiriem.has(id)) {
      const { data } = await supabase.from("companies").select("name").eq("id", id).maybeSingle();
      const meno = (data as { name?: string | null } | null)?.name ?? null;
      if (!meno) return nazov;
      nazvyFiriem.set(id, meno);
    }
    return nazovSuboruSFirmou(nazov, nazvyFiriem.get(id) ?? null);
  } catch {
    return nazov;
  }
}
