/*
  Kontrola prístupu pre serverové funkcie, ktoré po nej píšu cez `supabaseAdmin`.

  Admin klient obíde RLS aj reštriktívne politiky — `mfa_ok()` a oblasti
  vlastného prístupu (`firmy_s_pravom`). Samotné `is_company_member` preto
  nestačí: človek s vlastným prístupom bez Banky by inak cez serverovú funkciu
  pripojil banku alebo spároval platbu. Každá taká funkcia sa má pýtať tu.
*/
import { jeAdminRola, type Oblast } from "./opravnenia";

type Kontext = { supabase: any; userId: string };

export type Poziadavka = {
  /** Oblasť vlastného prístupu, ktorej sa akcia týka. */
  oblast?: Oblast;
  /** Akcia mení dáta — vlastný prístup musí mať „Upravovať". */
  zapis?: boolean;
  /** Len správa firmy — majiteľ, admin alebo účtovník (napojenia, kľúče, nastavenia). */
  spravca?: boolean;
};

/** Overí prístup prihláseného k firme; vráti jeho rolu, inak vyhodí chybu. */
export async function overPristup(
  ctx: Kontext,
  companyId: string,
  p: Poziadavka = {},
): Promise<string> {
  if (!companyId) throw new Error("Chýba firma.");
  const { data } = await ctx.supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!data) throw new Error("K tejto firme nemáte prístup.");
  const rola = data.role as string;
  if (p.spravca && !jeAdminRola(rola))
    throw new Error("Túto akciu môže urobiť len majiteľ, admin alebo účtovník firmy.");
  if (p.oblast) {
    const { data: firmy } = await ctx.supabase.rpc("firmy_s_pravom", {
      _oblast: p.oblast,
      _zapis: !!p.zapis,
    });
    if (!((firmy ?? []) as string[]).includes(companyId))
      throw new Error("Na túto časť nemáte v tejto firme oprávnenie.");
  }
  return rola;
}

/** Text, keď vracia z Pohody niekto, kto doklady smie len čítať. */
export const VRATIT_LEN_S_UPRAVOU =
  "Vrátiť z Pohody môže len ten, kto smie doklady upravovať — vy ich môžete len čítať.";

/**
 * Vrátenie z Pohody mení doklad (odomkne ho a pošle znova) — vyžaduje právo
 * upravovať oblasť (`firmy_s_pravom(oblast, true)`), nie len čítať.
 */
export async function overPravoVratenia(
  ctx: Kontext,
  companyId: string,
  oblast: Extract<Oblast, "faktury" | "doklady" | "pokladna">,
): Promise<void> {
  try {
    await overPristup(ctx, companyId, { oblast, zapis: true });
  } catch (e) {
    if (String((e as Error)?.message ?? "").startsWith("Na túto časť")) throw new Error(VRATIT_LEN_S_UPRAVOU);
    throw e;
  }
}
