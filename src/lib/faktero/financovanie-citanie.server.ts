/**
 * Vyčítanie zmluvy o leasingu alebo úvere z nahratého dokumentu.
 *
 * Zmluva a splátkový kalendár chodia ako PDF od banky. Čítať sa dá oboje:
 * hlavička (financovaná suma, úrok, počet splátok…) aj samotné riadky
 * kalendára. **Riadky sú dôležitejšie než hlavička** — keď ich dokument má,
 * berú sa tak, ako sú, a nič sa neprepočítava. Vlastný výpočet sa od predpisu
 * banky vždy o pár centov líši (iné zaokrúhľovanie, iný počet dní v mesiaci) a
 * v účtovníctve by ten rozdiel visel navždy.
 *
 * Upratovanie odpovede je v čistom module `financovanie-citanie.ts`. Tu ostáva
 * len zadanie pre model a volanie.
 */
import { odpovedNaJson } from "./json-odpoved";
import { jePouzitelna, normalizujOdpoved, type PrecitanaZmluva } from "./financovanie-citanie";

export type { PrecitanaSplatka, PrecitanaZmluva } from "./financovanie-citanie";

const PROMPT = `Si asistent pre slovenské a české zmluvy o leasingu a o úvere. Z dokumentu prečítaj údaje o financovaní.
Dokument môže byť samotná zmluva, samotný splátkový kalendár, alebo oboje spolu — pozbieraj, čo tam je.

Pravidlá:
- Dátumy vracaj vo formáte YYYY-MM-DD.
- Sumy vracaj ako číslo bez meny a bez medzier ("1 234,56" → 1234.56).
- "istina" = principal_part, "úrok" = interest_part, "zostatok istiny"/"nesplatená istina" = remaining_principal.
- amount je celková splátka za daný riadok tak, ako ju klient platí (stĺpec Spolu / Celkom / Splátka).
- Ak splátka obsahuje DPH, daj ju do vat_amount; inak 0.
- principal = financovaná suma (istina po odpočítaní akontácie), NIE obstarávacia cena.
- down_payment = akontácia / prvá zvýšená splátka, residual_value = zostatková cena splatná na konci.
- interest_from = deň čerpania / poskytnutia úveru, teda odkedy banka počíta úrok.
- first_due_date = splatnosť prvej splátky z kalendára.
- term_months = počet riadkov splátkového kalendára.
- kind = "leasing" pri leasingovej zmluve, "uver" pri úvere alebo pôžičke.
- Splátkový kalendár prepíš CELÝ, riadok po riadku, aj keď má 60 riadkov. Neskracuj ho a nedopĺňaj riadky, ktoré v dokumente nie sú.
- Keď údaj v dokumente nie je, daj null. Nič si nevymýšľaj a nič nedopočítavaj.

Vráť VÝHRADNE JSON bez sprievodného textu:
{"kind":"leasing"|"uver"|null,"provider_name":string|null,"contract_number":string|null,"variable_symbol":string|null,"currency":"EUR","principal":number|null,"interest_rate":number|null,"term_months":number|null,"first_due_date":"YYYY-MM-DD"|null,"interest_from":"YYYY-MM-DD"|null,"payment_amount":number|null,"vat_rate":number|null,"down_payment":number|null,"residual_value":number|null,"splatky":[{"number":number,"due_date":"YYYY-MM-DD","amount":number,"principal_part":number,"interest_part":number,"vat_amount":number,"remaining_principal":number}]}`;

export async function precitajZmluvu(base64: string, mimeType: string): Promise<PrecitanaZmluva> {
  const { geminiVision } = await import("./gemini.server");
  /*
   * Strop odpovede treba zdvihnúť ručne: kalendár na 72 splátok má vyše 5 000
   * tokenov a s predvoleným stropom sa odreže uprostred riadka. `json` navyše
   * zaručí, že odpoveď je naozaj JSON — bez neho ju model rád zabalí do bloku.
   */
  const odpoved = await geminiVision(base64, mimeType, PROMPT, {
    maxOutputTokens: 32768,
    json: true,
  });
  const parsed = odpovedNaJson<any>(odpoved);
  if (!parsed) throw new Error("Z dokumentu sa nepodarilo prečítať nič.");

  const zmluva = normalizujOdpoved(parsed);
  if (!jePouzitelna(zmluva)) {
    throw new Error("Z dokumentu sa nepodarilo prečítať nič použiteľné.");
  }
  return zmluva;
}
