/**
 * Nemecké pomenovanie dobropisu podľa krajiny firmy.
 *
 * Nemecká firma (sídlo v DE) volá vystavený dobropis „Rechnungskorrektur“ —
 * slovo „Gutschrift“ má v Nemecku zákonom daný význam samofaktúry (§ 14
 * Abs. 2 S. 2 UStG) a pri samofakturácii a prijatých dokladoch ostáva.
 * Slovenská a česká firma s rozhraním alebo dokladom v nemčine sa nemeckým
 * UStG neriadi a dostane „Gutschrift“ všade, ako to bolo pred zavedením
 * nemeckého názvoslovia.
 *
 * Slovníky (web, doklady, e-maily) sú písané nemeckou terminológiou; pre firmu
 * mimo Nemecka sa výsledný text prevedie touto funkciou. „Korrektur der
 * Gutschrift“ (oprava samofaktúry) sa nemení — slovo Rechnungskorrektur v nej
 * nie je.
 *
 * `krajina` je daňová krajina firmy (`krajinaDane(company.country)`), `null`
 * znamená „žiadna firma“ — verejný web, manuály, prihlásenie. Vtedy ostáva
 * nemecká terminológia, lebo manuály ju vysvetľujú.
 */
import type { KrajinaDane } from "@/lib/faktero/vat-rates";

/** Platí pre firmu nemecké názvoslovie (Rechnungskorrektur)? Bez firmy áno. */
export function nemeckeNazvoslovie(krajina: KrajinaDane | null | undefined): boolean {
  return !krajina || krajina === "DE";
}

const NAHRADY: [RegExp, string][] = [
  [/RECHNUNGSKORREKTUREN/g, "GUTSCHRIFTEN"],
  [/RECHNUNGSKORREKTUR/g, "GUTSCHRIFT"],
  [/Rechnungskorrekturen/g, "Gutschriften"],
  [/Rechnungskorrektur/g, "Gutschrift"],
];

/**
 * Text s nemeckým názvom dobropisu pre firmu z danej krajiny. Pre nemeckú
 * firmu alebo bez firmy sa vráti bez zmeny; inak „Rechnungskorrektur“ →
 * „Gutschrift“ (aj množné číslo, veľké písmená a zložené slová ako
 * „Rechnungskorrektur-Nr.“).
 */
export function pomenovanieDobropisu(
  text: string,
  krajina: KrajinaDane | null | undefined,
): string {
  if (nemeckeNazvoslovie(krajina) || !/rechnungskorrektur/i.test(text)) return text;
  let s = text;
  for (const [vzor, nahrada] of NAHRADY) s = s.replace(vzor, nahrada);
  return s;
}

/** To isté pre všetky textové polia objektu (popisky PDF, e-mail). */
export function pomenovanieDobropisuVObjekte<T extends object>(
  objekt: T,
  krajina: KrajinaDane | null | undefined,
): T {
  if (nemeckeNazvoslovie(krajina)) return objekt;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(objekt))
    out[k] = typeof v === "string" ? pomenovanieDobropisu(v, krajina) : v;
  return out as T;
}
