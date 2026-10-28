import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { vyberSablonu, type EmailSablona } from "./email-sablony";

/**
 * Najlepšia e-mailová šablóna firmy pre typ a jazyk dokladu, alebo `null`.
 * Volá sa až po overení prístupu k firme (číta servisným kľúčom).
 */
export async function sablonaPreDoklad(
  companyId: string,
  typ: string | null | undefined,
  jazyk: string | null | undefined,
): Promise<EmailSablona | null> {
  const { data, error } = await supabaseAdmin
    .from("email_sablony")
    .select("id, nazov, typ_dokladu, jazyk, predmet, text")
    .eq("company_id", companyId)
    .limit(500);
  if (error) {
    console.warn("[email-sablony] šablóny sa nenačítali:", error.message);
    return null;
  }
  return vyberSablonu((data ?? []) as EmailSablona[], typ, jazyk);
}
