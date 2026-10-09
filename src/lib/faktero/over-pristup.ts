/*
  Kontrola prístupu pre serverové funkcie, ktoré po nej píšu cez `supabaseAdmin`.

  Admin klient obíde RLS aj reštriktívne politiky — `mfa_ok()` a oblasti
  vlastného prístupu (`firmy_s_pravom`). Samotné `is_company_member` preto
  nestačí: človek s vlastným prístupom bez Banky by inak cez serverovú funkciu
  pripojil banku alebo spároval platbu. Každá taká funkcia sa má pýtať tu.
*/
import type { Oblast } from "./opravnenia";

type Kontext = { supabase: any; userId: string };

export type Poziadavka = {
  /** Oblasť vlastného prístupu, ktorej sa akcia týka. */
  oblast?: Oblast;
  /** Akcia mení dáta — vlastný prístup musí mať „Upravovať". */
  zapis?: boolean;
  /** Len majiteľ alebo admin firmy (napojenia, kľúče, nastavenia). */
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
  if (p.spravca && rola !== "owner" && rola !== "admin")
    throw new Error("Túto akciu môže urobiť len majiteľ alebo admin firmy.");
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
