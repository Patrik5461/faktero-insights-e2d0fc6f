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

/** Druh dokladu pre stĺpec `purchase_invoices.type`. */
export function druhPrijatehoDokladu(p: PodkladyRozpoznania): "regular" | "proforma" {
  return jeZalohovaFaktura(p) ? "proforma" : "regular";
}
