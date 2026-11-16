/**
 * Je prijatý doklad zálohová faktúra?
 *
 * Zálohová (proforma, preddavková) faktúra od dodávateľa nie je daňový
 * doklad — platí sa, ale daň prinesie až ostrá faktúra. Keď ju systém
 * zaradí medzi bežné prijaté faktúry, firma si odpočíta daň, na ktorú
 * ešte nemá nárok, a po doručení ostrej faktúry visí ten istý záväzok
 * dvakrát. Preto sa to rozhoduje hneď pri zaevidovaní.
 *
 * Rozhoduje sa z toho, čo je na papieri: názov dokladu, číslo dokladu,
 * názov súboru a veta „nie je daňový doklad". Model dostane otázku
 * priamo (`document_subtype`), text je poistka, keď odpovie nejasne.
 */

/*
  Bez diakritiky a bez oddeľovačov: v názve súboru býva „zalohova-faktura“ a
  v čísle „ZF_2026“, pričom na papieri je to to isté slovo s medzerou.
*/
const NORMALIZUJ = (h: unknown): string =>
  String(h ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[._\-\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Slová, ktoré na doklade znamenajú zálohu. */
const ZALOHOVE = [
  "zalohova faktura",
  "zalohovy list",
  "zaloha na",
  "preddavkova faktura",
  "preddavok",
  "proforma",
  "pro forma",
  "zalohova platba",
  "advance invoice",
  "prepayment",
  "vorauszahlung",
  "anzahlungsrechnung",
];

/**
 * Vety, ktoré samy osebe zálohu neznamenajú — ostrá faktúra ich píše pri
 * odpočte zaplatenej zálohy („odpočet zálohy", „zúčtovanie zálohy").
 */
const ODPOCET = ["odpocet zaloh", "zuctovanie zaloh", "zuctovanie preddavk", "vysporiadanie zaloh"];

/** Skratky v čísle dokladu — „ZF2026001", „PF-14", „PROF/2026/3". */
const CISLO_ZALOHY = /^(zf|pf|prof|zal|pred)[\s._/-]*\d/i;

export type PodkladyRozpoznania = {
  /** Odpoveď modelu na otázku o druhu dokladu. */
  druhOdAi?: unknown;
  /** Nadpis dokladu, ako ho model prečítal. */
  nazovDokladu?: unknown;
  cisloDokladu?: unknown;
  nazovSuboru?: unknown;
  predmetMailu?: unknown;
  poznamka?: unknown;
};

/**
 * `true`, keď doklad vyzerá ako zálohová faktúra.
 *
 * Rozhoduje odpoveď modelu; keď ju nedal alebo je nejasná, hľadá sa
 * v texte. Veta o odpočte zálohy sa odfiltruje — tú nesie práve ostrá
 * faktúra, ktorá zálohu zúčtováva.
 */
export function jeZalohovaFaktura(p: PodkladyRozpoznania): boolean {
  const druh = NORMALIZUJ(p.druhOdAi);
  if (druh) {
    if (["zalohova", "proforma", "preddavkova", "advance"].some((d) => druh.includes(d))) {
      return true;
    }
    if (["ostra", "danovy", "regular", "final", "bezna"].some((d) => druh.includes(d))) {
      return false;
    }
  }

  const text = [p.nazovDokladu, p.cisloDokladu, p.nazovSuboru, p.predmetMailu, p.poznamka]
    .map(NORMALIZUJ)
    .filter(Boolean)
    .join(" | ");
  if (!text) return false;

  const bezOdpoctov = ODPOCET.reduce((t, veta) => t.replaceAll(veta, " "), text);
  if (ZALOHOVE.some((slovo) => bezOdpoctov.includes(slovo))) return true;

  const cislo = String(p.cisloDokladu ?? "").trim();
  return CISLO_ZALOHY.test(cislo);
}

/*
  Daňový doklad k prijatej platbe (od dodávateľa, k našej zaplatenej zálohe):
  „Daňový doklad k prijatej platbe“, CZ „Daňový doklad k přijaté platbě“,
  „Daňový doklad k záloze / k úhrade zálohy“, „Doklad k prijatej platbe“.
  Po normalizácii (bez diakritiky) „prijatej“ aj „přijaté“ = „prijat…“.
*/
const DANOVY_K_PLATBE = [
  /danov\w* doklad\w* (?:k|ku|o|na) (?:prijat\w* |uhrad\w* |zaplaten\w* )?(?:platb|zaloh|zaloz|preddavk|uhrad)/,
  /doklad\w* (?:k|o) prijat\w* platb/,
  /tax (?:document|invoice|receipt) (?:for|on|to) (?:the |a |an )?(?:received |advance )?(?:payment|advance|deposit)/,
  /steuerbeleg (?:zur|uber die|fur die) (?:erhaltene[nr]? )?(?:zahlung|anzahlung)/,
];

/**
 * `true`, keď doklad vyzerá ako daňový doklad k prijatej platbe (k zálohe).
 * Rozhoduje odpoveď modelu (`danovy_doklad_k_platbe`), inak nadpis, číslo,
 * názov súboru. Má prednosť pred zálohovou — v nadpise býva aj „k zálohovej
 * faktúre č. …“.
 */
export function jeDanovyDokladKPlatbe(p: PodkladyRozpoznania): boolean {
  const druh = NORMALIZUJ(p.druhOdAi);
  if (druh && (druh.includes("k platbe") || druh.includes("danovy doklad k"))) return true;
  const text = [p.nazovDokladu, p.cisloDokladu, p.nazovSuboru, p.predmetMailu]
    .map(NORMALIZUJ)
    .filter(Boolean)
    .join(" | ");
  if (!text) return false;
  return DANOVY_K_PLATBE.some((r) => r.test(text));
}

/** Druh dokladu pre stĺpec `purchase_invoices.type`. */
export function druhPrijatehoDokladu(p: PodkladyRozpoznania): "regular" | "proforma" {
  return jeZalohovaFaktura(p) ? "proforma" : "regular";
}
