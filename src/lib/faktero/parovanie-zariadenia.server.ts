import { createHash, randomBytes } from "node:crypto";
import { PLATNOST_PAROVANIA_MS, kodParovania, tokenZKodu } from "./parovanie-zariadenia";

/*
  Serverová časť prihlásenia appky QR kódom. Token sa nikde neukladá —
  v databáze je len jeho hash. Výmena je jeden UPDATE s podmienkou
  „nepoužitý a neprepadnutý", takže ten istý kód nevymenia dve appky naraz.
*/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Klient = any;

export function hashTokenu(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Nový kód pre prihláseného človeka; staršie nepoužité kódy prepadnú. */
export async function vytvorParovanie(
  admin: Klient,
  userId: string,
): Promise<{ id: string; kod: string; platneDo: string }> {
  const teraz = new Date();
  await admin
    .from("parovanie_zariadenia")
    .update({ expires_at: teraz.toISOString() })
    .eq("user_id", userId)
    .is("pouzite_at", null)
    .gt("expires_at", teraz.toISOString());
  const token = randomBytes(32).toString("base64url");
  const platneDo = new Date(teraz.getTime() + PLATNOST_PAROVANIA_MS).toISOString();
  const { data, error } = await admin
    .from("parovanie_zariadenia")
    .insert({ user_id: userId, token_hash: hashTokenu(token), expires_at: platneDo })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string, kod: kodParovania(token), platneDo };
}

export class ChybaParovania extends Error {}

/**
 * Naskenovaný kód → jednorazový overovací token Supabase pre toho istého
 * človeka. Appka ho spotrebuje cez `verifyOtp` a má vlastnú reláciu;
 * heslo ani prístup k e-mailu nepotrebuje. Dvojfaktorové overenie tým
 * nepadá — relácia je na prvej úrovni a appka si kód vypýta.
 */
export async function vymenParovanie(
  admin: Klient,
  kod: string,
  kontext: { ip?: string | null; zariadenie?: string | null } = {},
): Promise<{ tokenHash: string; email: string }> {
  const token = tokenZKodu(kod);
  if (!token) throw new ChybaParovania("Toto nie je kód na prihlásenie appky z webu Faktero.");
  const teraz = new Date().toISOString();
  const { data: zaznam } = await admin
    .from("parovanie_zariadenia")
    .update({
      pouzite_at: teraz,
      ip: kontext.ip?.slice(0, 64) ?? null,
      zariadenie: kontext.zariadenie?.slice(0, 300) ?? null,
    })
    .eq("token_hash", hashTokenu(token))
    .is("pouzite_at", null)
    .gt("expires_at", teraz)
    .select("user_id")
    .maybeSingle();
  if (!zaznam?.user_id)
    throw new ChybaParovania(
      "Kód už vypršal alebo bol použitý. Na webe si zobrazte nový a naskenujte ho znova.",
    );

  const { data: u, error: chybaU } = await admin.auth.admin.getUserById(zaznam.user_id);
  const pouzivatel = u?.user;
  if (chybaU || !pouzivatel?.email) throw new ChybaParovania("Účet sa nenašiel.");
  if (pouzivatel.banned_until && new Date(pouzivatel.banned_until).getTime() > Date.now())
    throw new ChybaParovania("Prihlásenie do tohto účtu je zakázané.");

  // Odkaz sa nikam neposiela — vráti sa len jeho jednorazový hash.
  const { data: odkaz, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: pouzivatel.email,
  });
  const tokenHash = odkaz?.properties?.hashed_token as string | undefined;
  if (error || !tokenHash)
    throw new Error(error?.message ?? "Prihlásenie sa nepodarilo pripraviť.");
  return { tokenHash, email: pouzivatel.email };
}
