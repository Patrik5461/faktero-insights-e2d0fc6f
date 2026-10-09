import { odpoved, xmlStav, type OdpovedZasielkovne } from "./zasielkovna";

const URL_REST = "https://www.zasilkovna.cz/api/rest";

export async function volajZasielkovnu(xml: string): Promise<OdpovedZasielkovne> {
  const r = await fetch(URL_REST, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: `<?xml version="1.0" encoding="utf-8"?>${xml}`,
    signal: AbortSignal.timeout(25_000),
  });
  return odpoved(await r.text());
}

/**
 * Overí API heslo bez vedľajších účinkov: stav neexistujúcej zásielky.
 * Nesprávne heslo vráti IncorrectApiPasswordFault, správne „zásielka neexistuje".
 */
export async function overHeslo(heslo: string): Promise<void> {
  const o = await volajZasielkovnu(xmlStav(heslo, "1"));
  if (!o.ok && o.kod === "IncorrectApiPasswordFault")
    throw new Error("Nesprávne API heslo Zásielkovne.");
}

export async function hesloZasielkovne(
  companyId: string,
): Promise<{ heslo: string; odosielatel: string | null } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("zasielkovna_napojenia")
    .select("heslo_sifrovane, odosielatel")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) return null;
  const { decryptSecret } = await import("./payment-crypto.server");
  return { heslo: decryptSecret(data.heslo_sifrovane), odosielatel: data.odosielatel };
}
