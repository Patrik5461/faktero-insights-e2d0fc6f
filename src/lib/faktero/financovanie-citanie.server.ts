/**
 * Vyčítanie zmluvy o leasingu, úvere alebo kontokorente z nahratého dokumentu.
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

const PROMPT = `Si asistent pre slovenské a české zmluvy o leasingu, o úvere a o kontokorentnom úvere. Z dokumentu prečítaj údaje o financovaní.
Dokument môže byť samotná zmluva, samotný splátkový kalendár, alebo oboje spolu — pozbieraj, čo tam je.

Najprv urči druh (kind):
- "leasing" — leasingová zmluva (finančný alebo operatívny leasing).
- "uver" — úver alebo pôžička so splátkovým kalendárom: požičaná suma sa spláca pravidelnými splátkami.
- "kontokorent" — kontokorentný úver, povolené prečerpanie (debet) bežného účtu, úverový rámec k bežnému účtu, revolvingový úver k účtu, české „kontokorentní úvěr". Nemá splátkový kalendár ani pevné splátky: firma čerpá do výšky limitu na účte a banka strhne úrok z vyčerpanej sumy.
Kontokorent spoznáš podľa toho, že zmluva hovorí o limite/rámci na konkrétnom bežnom účte a nie o splátkach.
product_name = názov produktu tak, ako je v zmluve (napr. "Kontokorentný úver", "Podnikateľský úver", "Finančný leasing").

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
- Splátkový kalendár prepíš CELÝ, riadok po riadku, aj keď má 60 riadkov. Neskracuj ho a nedopĺňaj riadky, ktoré v dokumente nie sú.
- Keď údaj v dokumente nie je, daj null. Nič si nevymýšľaj a nič nedopočítavaj.

Úroková sadzba (pri každom druhu):
- interest_rate = výsledná ročná úroková sadzba v %, ak je v zmluve uvedená ako číslo. Pri pohyblivej sadzbe ju nedopočítavaj.
- Pohyblivá sadzba („referenčná sadzba + marža/prirážka“, „EURIBOR 1-mesačný + 4,3 % p. a.“):
  reference_rate_name = názov referenčnej sadzby presne so splatnosťou (napr. "1M EURIBOR", "3M EURIBOR", "6M PRIBOR", "€STR"),
  reference_rate_value = jej hodnota, iba ak je v dokumente uvedená číslom, interest_margin = marža v % p. a. (už po prípadnej bonifikácii, ak ju zmluva odpočítava).
  index_floor = dolná hranica referenčnej sadzby v %, ak ju zmluva uvádza (napr. „ak je EURIBOR záporný, považuje sa za nulu“ → 0), inak null.
  fixing_rule = ku ktorému dňu sa referenčná sadzba určuje, voľným textom (napr. "2 pracovné dni pred začiatkom obdobia fixácie", "priemer za predchádzajúci mesiac"),
  fixing_offset_days = počet pracovných dní pred začiatkom obdobia, ak je uvedený (napr. 2), inak null.
  rate_reset_period = ako často sa sadzba mení (dĺžka obdobia fixácie): "mesacne"|"stvrtrocne"|"polrocne"|"rocne".
- day_count = spôsob výpočtu úroku: "ACT/360" (rok s 360 dňami a skutočný počet dní), "ACT/365" (rok s 365 dňami), "30E/360" (mesiac 30 dní, rok 360), inak null.

Iba pri kontokorente (inak null):
- credit_limit = úverový rámec / limit kontokorentu. principal nechaj null, splatky [].
- account_iban = IBAN bežného účtu, ku ktorému je rámec zriadený.
- limit_fee = poplatok za úverový rámec / za nevyčerpaný limit / záväzková provízia ako suma, limit_fee_period = "mesacne"|"stvrtrocne"|"rocne".
  Ak je poplatok uvedený ako percento z limitu, daj ho do limit_fee_percent (ročne) a limit_fee nechaj null.
- valid_until = do kedy rámec platí (dátum splatnosti / ukončenia rámca). Pri dobe neurčitej null.
- interest_period = "mesacne" alebo "stvrtrocne" — ako často banka úrok strhne.

Vráť VÝHRADNE JSON bez sprievodného textu:
{"kind":"leasing"|"uver"|"kontokorent"|null,"product_name":string|null,"provider_name":string|null,"contract_number":string|null,"variable_symbol":string|null,"currency":"EUR","principal":number|null,"interest_rate":number|null,"term_months":number|null,"first_due_date":"YYYY-MM-DD"|null,"interest_from":"YYYY-MM-DD"|null,"payment_amount":number|null,"vat_rate":number|null,"down_payment":number|null,"residual_value":number|null,"credit_limit":number|null,"account_iban":string|null,"reference_rate_name":string|null,"reference_rate_value":number|null,"interest_margin":number|null,"index_floor":number|null,"fixing_rule":string|null,"fixing_offset_days":number|null,"rate_reset_period":"mesacne"|"stvrtrocne"|"polrocne"|"rocne"|null,"day_count":"ACT/360"|"ACT/365"|"30E/360"|null,"limit_fee":number|null,"limit_fee_period":"mesacne"|"stvrtrocne"|"rocne"|null,"limit_fee_percent":number|null,"valid_until":"YYYY-MM-DD"|null,"interest_period":"mesacne"|"stvrtrocne"|null,"splatky":[{"number":number,"due_date":"YYYY-MM-DD","amount":number,"principal_part":number,"interest_part":number,"vat_amount":number,"remaining_principal":number}]}`;

export async function precitajZmluvu(base64: string, mimeType: string): Promise<PrecitanaZmluva> {
  const { aiVision } = await import("./ai.server");
  /*
   * Strop odpovede treba zdvihnúť ručne: kalendár na 72 splátok má vyše 5 000
   * tokenov a s predvoleným stropom sa odreže uprostred riadka.
   *
   * Vynútený JSON režim (`responseMimeType`) sa nepoužíva. Overené na zmluve
   * z ČSOB 2026-08-16: model v ňom vráti odpoveď bez poslednej zátvorky a tvári
   * sa, že skončil normálne. Bez neho pošle JSON v bloku so spätnými
   * apostrofmi, čo `odpovedNaJson` číta bez problémov.
   */
  const odpoved = await aiVision(base64, mimeType, PROMPT, {
    maxOutputTokens: 32768,
    ucel: "financovanie",
  });
  const parsed = odpovedNaJson<any>(odpoved);
  if (!parsed) throw new Error("Z dokumentu sa nepodarilo prečítať nič.");

  const zmluva = normalizujOdpoved(parsed);
  if (!jePouzitelna(zmluva)) {
    throw new Error("Z dokumentu sa nepodarilo prečítať nič použiteľné.");
  }
  return zmluva;
}
