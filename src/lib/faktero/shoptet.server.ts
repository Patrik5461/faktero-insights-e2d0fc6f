/*
  Volania Shoptet API so súkromným tokenom (tarif Premium; v administrácii
  Prepojenia → API → súkromný API token). Hlavička `Shoptet-Private-API-Token`.
*/
const ZAKLAD = "https://api.myshoptet.com";

export async function shoptetApi<T = any>(token: string, cesta: string): Promise<T> {
  const r = await fetch(ZAKLAD + cesta, {
    headers: { "Shoptet-Private-API-Token": token, "Content-Type": "application/vnd.shoptet.v1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || (j?.errors && j.errors.length)) {
    const e = j?.errors?.[0];
    if (r.status === 401 || e?.errorCode === "invalid-token" || e?.errorCode === "expired-token")
      throw new Error(
        "Shoptet token je neplatný alebo zrušený — vygenerujte nový v administrácii Shoptetu.",
      );
    if (r.status === 403)
      throw new Error(
        "Token nemá právo na objednávky — v Shoptete mu povoľte skupinu Objednávky (čítanie).",
      );
    throw new Error(`Shoptet: ${e?.message ?? `HTTP ${r.status}`}`);
  }
  return j?.data as T;
}

export async function tokenShoptetu(
  companyId: string,
): Promise<{ token: string; nazov: string | null } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("shoptet_napojenia")
    .select("token_sifrovany, eshop_nazov")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) return null;
  const { decryptSecret } = await import("./payment-crypto.server");
  return { token: decryptSecret(data.token_sifrovany), nazov: data.eshop_nazov };
}
