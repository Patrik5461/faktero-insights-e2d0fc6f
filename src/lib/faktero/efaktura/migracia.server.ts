/*
  Prevzatie firmy od iného poskytovateľa Peppolu migračným kódom.

  Firma je v SMP u niekoho iného (registrácia z tokenu FS padla na
  PARTICIPANT_ALREADY_REGISTERED). Súčasný poskytovateľ jej vydá migračný
  kód, ona ho pošle nám a superadmin ho zadá v Admin → eFaktúra.

  Kód je tajný: uloží sa len zašifrovaný (rovnako ako token FS), kým migrácia
  nedobehne — pri 202 ju dokončí cron `dokonciRozbehnuteRegistracie` — a po
  konečnom výsledku ho `spracujZiadost` zmaže. Do auditu, logu ani e-mailu nejde.
*/

import { spracujZiadost } from "./webhooky-obsluha.server";

/** Zo stavov, kde firma nie je naša, sa dá prevzatie spustiť. */
export const STAVY_PRE_MIGRACIU = ["cudzi_poskytovatel", "chyba", "zamietnuta"] as const;

/** Dlhšie admin nečaká — nginx po 30 s spojenie preruší; výsledok dobehne sám. */
const CAKANIE_MS = 20_000;

export async function prevezmiMigracnymKodom(
  db: any,
  v: { id: string; kod: string; adminUserId: string },
): Promise<{ stav: string; chyba: string | null; bezi: boolean }> {
  const kod = v.kod.trim();
  if (!kod) throw new Error("Zadaj migračný kód.");
  const { data: z, error: chybaCitania } = await db
    .from("efaktura_pds_ziadosti")
    .select("id, dic, nazov, stav, cudzi_poskytovatel")
    .eq("id", v.id)
    .maybeSingle();
  if (chybaCitania) throw new Error(chybaCitania.message);
  if (!z) throw new Error("Žiadosť sa nenašla.");
  if (!(STAVY_PRE_MIGRACIU as readonly string[]).includes(z.stav)) {
    throw new Error(
      z.stav === "registrovana"
        ? "Firma je už vo Fakteri zaregistrovaná."
        : "Prevzatie sa dá spustiť len pri žiadosti v stave „u iného poskytovateľa“, „chyba“ alebo „zamietnutá“.",
    );
  }

  const { encryptSecret } = await import("../payment-crypto.server");
  const { data: zapisane, error } = await db
    .from("efaktura_pds_ziadosti")
    .update({
      migracny_kod_sifrovany: encryptSecret(kod),
      stav: "prijata",
      pokusov: 0,
      chyba: null,
      epostak_operacia_id: null,
      migracia_at: new Date().toISOString(),
    })
    .eq("id", z.id)
    // Medzitým ju mohol niekto zmeniť (iný admin, cron) — vtedy nič.
    .eq("stav", z.stav)
    .select("id");
  if (error) throw new Error(error.message);
  if (!zapisane?.length)
    throw new Error("Žiadosť sa medzitým zmenila — obnov stránku a skús znova.");

  let bezi = false;
  let stav = "prijata";
  let casovac: ReturnType<typeof setTimeout> | undefined;
  const beh = spracujZiadost(z.id);
  // Keď výsledok príde až po čakaní, chyba sa nesmie stratiť ako neodchytená.
  beh.catch((e) => console.warn("[efaktura-migracia]", z.id, String(e?.message ?? e)));
  try {
    const vysledok = await Promise.race([
      beh,
      new Promise<null>((r) => {
        casovac = setTimeout(() => r(null), CAKANIE_MS);
      }),
    ]);
    if (vysledok === null) bezi = true;
    else stav = vysledok;
  } finally {
    clearTimeout(casovac);
  }

  const { data: po } = await db
    .from("efaktura_pds_ziadosti")
    .select("stav, chyba")
    .eq("id", z.id)
    .maybeSingle();
  if (po?.stav) stav = po.stav;
  await db.from("platform_audit_logs").insert({
    admin_user_id: v.adminUserId,
    action: "efaktura_migracia",
    entity_type: "efaktura_pds_ziadosti",
    entity_id: z.id,
    // Bez kódu — ani jeho hash.
    metadata: {
      dic: z.dic,
      nazov: z.nazov,
      predchadzajuci_stav: z.stav,
      cudzi_poskytovatel: z.cudzi_poskytovatel ?? null,
      vysledok: stav,
      bezi,
    },
  });
  return {
    stav,
    chyba: (po?.chyba as string | null) ?? null,
    bezi: bezi || stav === "prijata" || stav === "registruje_sa" || stav === "na_kontrolu",
  };
}
