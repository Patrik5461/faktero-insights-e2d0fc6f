/**
 * Texty k daňovému režimu faktúry pre nemeckú firmu.
 *
 * Formulár faktúry vysvetľuje režimy slovenským zákonom (§ 69, § 47, § 15
 * ods. 1, riadky slovenského priznania). Nemecká firma sa riadi UStG a podáva
 * UStVA a ZM, tak dostane vlastné znenie. Kľúč aj hodnota sú slovenské texty
 * (kľúče prekladu) — nemecký a český preklad je v `src/lib/i18n/{de,cs}/t4-de.ts`.
 */
const TEXTY_DE: Record<string, string> = {
  "Bežne sa fakturuje so slovenskou DPH. Prepnite len vtedy, keď daň odvedie odberateľ alebo predávate spotrebiteľovi v inom štáte EÚ.":
    "Bežne sa fakturuje s nemeckou DPH. Prepnite len vtedy, keď daň odvedie odberateľ, dodávate tovar či službu do zahraničia alebo predávate spotrebiteľovi v inom štáte EÚ.",
  "Sadzba štátu zákazníka; daň sa odvádza cez jedno kontaktné miesto, nie v slovenskom priznaní.":
    "Sadzba štátu zákazníka; daň sa odvádza cez jedno kontaktné miesto (OSS), nie v UStVA.",
  "Tuzemský prenos podľa §69 zákona o DPH (stavebné práce, kovový odpad…)":
    "Tuzemský prenos podľa § 13b UStG (stavebné práce, upratovanie budov, kovový šrot…)",
  "Vývoz tovaru (oslobodené podľa § 47)": "Vývoz tovaru (oslobodené podľa § 4 Nr. 1a UStG)",
  "Služba mimo EÚ (miesto dodania podľa § 15 ods. 1)":
    "Služba mimo EÚ (miesto plnenia v zahraničí, § 3a ods. 2 UStG)",
  "Vývoz tovaru ide do priznania (r. 13 a 15), služba s miestom dodania mimo EÚ do priznania nepatrí.":
    "Vývoz tovaru ide do UStVA (KZ 43), služba s miestom plnenia mimo EÚ do KZ 45.",
  "Dodanie služby (§ 15 ods. 1)": "Dodanie služby (§ 3a ods. 2 UStG)",
  "Tovar ide aj do priznania (r. 13 a 14), služba len do súhrnného výkazu.":
    "Tovar ide do UStVA (KZ 41) a do ZM ako L, služba do KZ 21 a ZM ako S, trojstranný obchod do KZ 42 a ZM ako D.",
};

/** Slovenský kľúč textu režimu pre nemeckú firmu (bez zmeny, keď nemecké znenie nemá). */
export function textRezimuDe(sk: string): string {
  return TEXTY_DE[sk] ?? sk;
}
