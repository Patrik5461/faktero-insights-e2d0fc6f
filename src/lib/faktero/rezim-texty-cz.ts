/**
 * Texty k daňovému režimu faktúry pre českú firmu.
 *
 * Formulár faktúry vysvetľuje režimy slovenským zákonom (§ 69, § 47, § 15
 * ods. 1, riadky slovenského priznania). Česká firma sa riadi zákonom
 * 235/2004 Sb. (§ 92a, § 64, § 66, § 9 odst. 1) a podáva DPHDP3 a súhrnné
 * hlásenie. Kľúč aj hodnota sú slovenské texty (kľúče prekladu) — český a
 * nemecký preklad je v `src/lib/i18n/{cs,de}/t4-cz.ts`.
 */
const TEXTY_CZ: Record<string, string> = {
  "Bežne sa fakturuje so slovenskou DPH. Prepnite len vtedy, keď daň odvedie odberateľ alebo predávate spotrebiteľovi v inom štáte EÚ.":
    "Bežne sa fakturuje s českou DPH. Prepnite len vtedy, keď daň odvedie odberateľ alebo predávate spotrebiteľovi v inom štáte EÚ.",
  "Sadzba štátu zákazníka; daň sa odvádza cez jedno kontaktné miesto, nie v slovenskom priznaní.":
    "Sadzba štátu zákazníka; daň sa odvádza cez jedno kontaktné miesto, nie v českom priznaní.",
  "Tuzemský prenos podľa §69 zákona o DPH (stavebné práce, kovový odpad…)":
    "Tuzemský prenos podľa § 92a zákona o DPH (stavebné a montážne práce, odpad, kovy…)",
  "Vývoz tovaru (oslobodené podľa § 47)": "Vývoz tovaru (oslobodené podľa § 66)",
  "Služba mimo EÚ (miesto dodania podľa § 15 ods. 1)":
    "Služba mimo EÚ (miesto plnenia podľa § 9 ods. 1)",
  "Vývoz tovaru ide do priznania (r. 13 a 15), služba s miestom dodania mimo EÚ do priznania nepatrí.":
    "Vývoz tovaru ide do priznania na ř. 22, služba s miestom plnenia mimo EÚ na ř. 26.",
  "Dodanie služby (§ 15 ods. 1)": "Dodanie služby (§ 9 ods. 1)",
  "Tovar ide aj do priznania (r. 13 a 14), služba len do súhrnného výkazu.":
    "Tovar ide do priznania na ř. 20, služba na ř. 21 — obe aj do súhrnného hlásenia.",
};

/** Slovenský kľúč textu režimu pre českú firmu (bez zmeny, keď české znenie nemá). */
export function textRezimuCz(sk: string): string {
  return TEXTY_CZ[sk] ?? sk;
}
