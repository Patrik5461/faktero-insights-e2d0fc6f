/**
 * Náležitosti faktúry, ktoré zákon vyžaduje a program ich vie ustrážiť.
 *
 * Nejde o kompletnú kontrolu dokladu — iba o tie tri veci, ktoré sa najčastejšie
 * zabudnú a ktoré sa dajú zistiť z formulára:
 *  - platiteľ musí uviesť dátum dodania (§ 74 ods. 1 písm. d zákona o DPH),
 *  - faktúra sa vyhotovuje do 15 dní od dodania alebo od prijatia platby (§ 73),
 *  - vety osobitných úprav, bez ktorých je doklad neúplný (§ 74 ods. 1 písm. k až n).
 */

/** Do koľkých dní od dodania treba faktúru vyhotoviť. */
export const LEHOTA_VYSTAVENIA_DNI = 15;

export type KontrolaFaktury = { chyba?: string; upozornenie?: string };

function dni(od: string, do_: string): number {
  const a = new Date(`${od}T00:00:00Z`).getTime();
  const b = new Date(`${do_}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Dátum dodania a lehota na vystavenie.
 *
 * Neplatiteľ dátum dodania mať nemusí, preto sa od neho nevyžaduje — vyžadovať
 * ho od každého by bola prekážka tam, kde zákon nič nežiada.
 */
export function skontrolujDatumy(
  vstup: {
    platitel: boolean;
    datumDodania?: string | null;
    datumVystavenia?: string | null;
  },
  dnes: string = new Date().toISOString().slice(0, 10),
): KontrolaFaktury {
  const dodanie = String(vstup.datumDodania ?? "").trim();
  if (vstup.platitel && !dodanie) {
    return {
      chyba:
        "Doplňte dátum dodania — na faktúre platiteľa je povinný (§ 74 ods. 1 zákona o DPH) a určuje aj obdobie DPH.",
    };
  }
  if (!dodanie) return {};

  const vystavenie = String(vstup.datumVystavenia ?? dnes).trim() || dnes;
  const odstup = dni(dodanie, vystavenie);
  if (odstup > LEHOTA_VYSTAVENIA_DNI) {
    return {
      upozornenie: `Od dodania uplynulo ${odstup} dní. Faktúra sa má vyhotoviť do ${LEHOTA_VYSTAVENIA_DNI} dní od dodania alebo od prijatia platby (§ 73 zákona o DPH).`,
    };
  }
  if (odstup < 0) {
    return {
      upozornenie: "Dátum dodania je neskorší než dátum vystavenia — skontrolujte ho.",
    };
  }
  return {};
}

/** Osobitné úpravy, ktoré sa uvádzajú na doklade. */
export type OsobitnaUprava = "65" | "66_tovar" | "66_umenie" | "66_starozitnosti";

const VETY_UPRAV: Record<OsobitnaUprava, string> = {
  "65": "Úprava zdaňovania prirážky – cestovné kancelárie",
  "66_tovar": "Úprava zdaňovania prirážky – použitý tovar",
  "66_umenie": "Úprava zdaňovania prirážky – umelecké diela",
  "66_starozitnosti": "Úprava zdaňovania prirážky – zberateľské predmety a starožitnosti",
};

export const UPRAVY_NA_VYBER: { kod: OsobitnaUprava; nazov: string }[] = (
  Object.keys(VETY_UPRAV) as OsobitnaUprava[]
).map((kod) => ({ kod, nazov: VETY_UPRAV[kod] }));

/** Veta podľa § 68d — platí pre celú firmu, nie pre jednotlivý doklad. */
export const VETA_68D = "Daň sa uplatňuje na základe prijatia platby";

/**
 * Vety, ktoré musia byť na doklade.
 *
 * Poradie je pevné: najprv úprava dane firmy, potom osobitná úprava dodania.
 * Prenesenie daňovej povinnosti a oslobodenie kreslí tlač samostatne, lebo majú
 * vlastný rámik.
 */
export function vetyNaDoklad(vstup: {
  danZPrijatejPlatby?: boolean | null;
  osobitnaUprava?: string | null;
}): string[] {
  const von: string[] = [];
  if (vstup.danZPrijatejPlatby) von.push(VETA_68D);
  const u = vstup.osobitnaUprava as OsobitnaUprava | null | undefined;
  if (u && VETY_UPRAV[u]) von.push(VETY_UPRAV[u]);
  return von;
}
