/*
  Bloček uložený z mobilnej aplikácie — kam patrí a čo musí mať.

  Patrikova požiadavka (2026-10-29): bloček naskenovaný v appke sa uloží rovno
  do Bločkov, nie do Nespracovaných, a bez fotky sa v appke uložiť nedá.
  Fotka je doklad pre účtovníka aj pre daňovú kontrolu — samotný QR kód
  papierový bloček nenahradí.

  Čisté funkcie bez siete: rovnaké pravidlo používa server (`createExpenseFn`)
  aj appka (tlačidlo Uložiť), a dá sa otestovať bez databázy.
*/

/** Značka, ktorou appka označí svoje volanie `vydavok-uloz`. */
export const ZDROJ_APKY = "apka" as const;

/** Chyba servera pre bloček z appky bez fotky. Appka ju v bežnom toku neuvidí — tlačidlo je dovtedy neaktívne. */
export const CHYBA_BEZ_FOTKY =
  "Bloček z aplikácie sa bez fotky uložiť nedá — odfoťte ho a skúste znova.";

export type CielVydavku =
  /** `expense_documents` so stavom `processed` — záložka Bločky. */
  | "blocky"
  /** `expense_documents` so stavom `new` — ukazuje sa v Nespracovaných. */
  | "nespracovane"
  /** Zapíše sa a hneď presunie do `nespracovane_doklady` (nastavenie firmy). */
  | "presun-do-nespracovanych";

export type VstupCiela = {
  /** Volanie prišlo z appky (`zdroj: "apka"`). */
  zAppky: boolean;
  /** Doklad má QR kód bločku a `source: "qr"`. */
  zQr: boolean;
  /** Typ priloženého súboru (`image/jpeg`, `application/pdf`…). */
  mime?: string | null;
  /** Čítanie bločku ho rozpoznalo ako zálohovú faktúru — tá medzi bločky nepatrí. */
  zalohova?: boolean;
  suma?: number | null;
  datum?: string | null;
  /** Firma si vedome zapla `qr_blocky_do_nespracovanych`. */
  doNespracovanych: boolean;
};

/**
 * Je to bloček, ktorý patrí medzi Bločky?
 *
 * Z webu (formulár) len bloček s QR kódom — ručný zápis čaká na kontrolu ako
 * doteraz. Z appky aj odfotený bloček: tok „Skontrolujte doklad" je v appke
 * bločkový (faktúry a iné doklady idú cez rozpoznanie do Nespracovaných).
 * Výnimkou je PDF — to sa do bločkového toku dostane len z výberu súboru bez
 * signálu a býva to faktúra — a zálohová faktúra.
 */
export function jeBlocekDoBlockov(
  v: Omit<VstupCiela, "suma" | "datum" | "doNespracovanych">,
): boolean {
  if (v.zalohova) return false;
  if (v.zQr) return true;
  if (!v.zAppky) return false;
  return String(v.mime ?? "").startsWith("image/");
}

/**
 * Kam sa nový výdavkový doklad uloží.
 *
 * Bločky vyžadujú sumu aj dátum (rovnako ako `daSaSpracovat`) — bloček, ktorý
 * sa nepodarilo prečítať, čaká v Nespracovaných, kým ho niekto doplní.
 * Nastavenie firmy „ukladať do Nespracovaných" sa rešpektuje pre každý bloček
 * z appky: kto chce kontrolovať aj úradné údaje z QR, chce tým skôr
 * kontrolovať to, čo prečítala AI z fotky.
 */
export function kamUlozitVydavok(v: VstupCiela): CielVydavku {
  if (!jeBlocekDoBlockov(v)) return "nespracovane";
  if (v.doNespracovanych) return "presun-do-nespracovanych";
  return v.suma != null && Boolean(v.datum) ? "blocky" : "nespracovane";
}

/** Poistka servera: bloček z appky musí mať priložený súbor. `null` = v poriadku. */
export function chybaFotkyZAppky(v: { zAppky: boolean; filePath?: string | null }): string | null {
  if (!v.zAppky) return null;
  return v.filePath?.trim() ? null : CHYBA_BEZ_FOTKY;
}

/**
 * Dá sa bloček v appke uložiť? Chýbajúca fotka má prednosť pred úhradou —
 * bez nej sa ďalej nepokračuje.
 */
export function coChybaBlocku(v: {
  foto?: string | null;
  uhrada?: string | null;
}): "foto" | "uhrada" | null {
  if (!v.foto) return "foto";
  if (!v.uhrada) return "uhrada";
  return null;
}
