/**
 * Prečítanie ostatného dokladu (list, predpis, exekúcia, zmluva) cez AI.
 *
 * Model má určiť druh, odosielateľa, predmet a — ak sú — sumu a lehotu.
 * Upratovanie odpovede je v čistom `normalizujRozpoznanie`, tu je len zadanie.
 */
import { odpovedNaJson } from "./json-odpoved";
import { normalizujRozpoznanie, type RozpoznanyOstatny } from "./ostatne-doklady";

export const DRUHY_PRE_AI = `"exekucia" (exekučný príkaz, upovedomenie o začatí exekúcie, príkaz na zrážky zo mzdy),
"poistovna" (predpis poistného, poistná zmluva, výzva poisťovne na platbu — komerčná poisťovňa),
"danovy_urad" (list, výzva, rozhodnutie alebo platobný výmer od daňového/finančného úradu),
"socialna_zdravotna" (Sociálna poisťovňa, zdravotná poisťovňa — výkaz nedoplatkov, rozhodnutie, výzva),
"zmluva" (akákoľvek zmluva alebo dodatok),
"leasing_uver" (leasingová alebo úverová zmluva, splátkový kalendár, oznámenie banky o úvere),
"uradny_list" (iný úradný list — súd, obec, register, ministerstvo),
"ine" (nič z uvedeného)`;

const PROMPT = `Si asistent slovenského účtovníka. Dostaneš dokument, ktorý firma dostala — nie je to faktúra ani bloček,
ale list, predpis, exekúcia, zmluva alebo iný podklad. Zisti z neho:

- kind — jeden z kľúčov:
${DRUHY_PRE_AI}
- sender — kto dokument poslal alebo vydal (úrad, exekútor, poisťovňa, banka), nie adresát.
- subject — o čom dokument je, jednou vetou po slovensky (napr. "Exekučný príkaz na zrážky zo mzdy — Ján Novák").
- document_date — dátum na dokumente (YYYY-MM-DD).
- amount — suma, ktorú treba zaplatiť alebo ktorej sa dokument týka, ako číslo ("1 234,56" → 1234.56). Ak žiadna nie je, null.
- currency — kód meny (EUR, CZK…).
- due_date — lehota alebo splatnosť (YYYY-MM-DD), ak je v dokumente.
- summary — 1 až 3 vety pre účtovníka: čo z dokumentu vyplýva a čo treba urobiť.

Čo v dokumente nie je, daj null. Nič si nevymýšľaj.
Vráť VÝHRADNE JSON:
{"kind":string,"sender":string|null,"subject":string|null,"document_date":"YYYY-MM-DD"|null,"amount":number|null,"currency":string|null,"due_date":"YYYY-MM-DD"|null,"summary":string|null}`;

export async function precitajOstatny(
  base64: string,
  mimeType: string,
): Promise<RozpoznanyOstatny> {
  const { aiVision } = await import("./ai.server");
  const odpoved = await aiVision(base64, mimeType, PROMPT, { ucel: "ostatny-doklad" });
  const parsed = odpovedNaJson<any>(odpoved);
  if (!parsed) throw new Error("Z dokumentu sa nepodarilo prečítať nič.");
  return normalizujRozpoznanie(parsed);
}
