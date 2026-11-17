/*
  Rozhodnutia rozhrania pre testovaciu firmu (pás, prepínač, nastavenia).

  Čistá logika bez Reactu — aby sa dala otestovať. Pravidlá testovacej firmy
  sú v testovacia-firma.ts.
*/
import { jeTestovacia, PREDPONA_TESTOVACEJ, zoradSTestovacimi } from "./testovacia-firma";
import type { ZoradeneFirmy } from "./poradie-firiem";
import { jeAdminRola } from "./opravnenia";

type FirmaZoZoznamu = { id: string; name: string; testovacia_pre?: string | null };

export type SkutocnaFirma = { id: string; name: string };

/**
 * Skutočná firma k aktívnej testovacej — pre pás „Prepnúť na {názov}“.
 * Pre skutočnú firmu `null` (pás sa neukáže). Rodič je v zozname vždy
 * (členstvo sa zrkadlí); keby predsa chýbal, názov sa odvodí z „Test – …“
 * a prepnúť sa nedá (`id` je null).
 */
export function skutocnaFirmaPre(
  aktivna: FirmaZoZoznamu | null | undefined,
  firmy: FirmaZoZoznamu[],
): { id: string | null; name: string } | null {
  if (!aktivna || !jeTestovacia(aktivna)) return null;
  const rodic = firmy.find((f) => f.id === aktivna.testovacia_pre);
  if (rodic) return { id: rodic.id, name: rodic.name };
  const n = String(aktivna.name ?? "");
  return {
    id: null,
    name: n.startsWith(PREDPONA_TESTOVACEJ) ? n.slice(PREDPONA_TESTOVACEJ.length) : n,
  };
}

/**
 * Poradie v prepínači: v každej skupine (naposledy použité / ostatné) ide
 * testovacia hneď pod svoju skutočnú. Testovacia, ktorej rodič je v inej
 * skupine (alebo ho dotaz vyfiltroval), ide na koniec svojej skupiny.
 */
export function zoradPrepinacSTestovacimi<F extends FirmaZoZoznamu>(
  z: ZoradeneFirmy<F>,
): ZoradeneFirmy<F> {
  const posledne = zoradSTestovacimi(z.posledne);
  const ostatne = zoradSTestovacimi(z.ostatne);
  return { posledne, ostatne, vsetky: [...posledne, ...ostatne] };
}

export type NastaveniaTestovacej = {
  /** Ukázať sekciu „Testovacia firma“ s vysvetlením. */
  sekcia: boolean;
  /** Smie vymazať údaje testovacej firmy (len správca). */
  vymazanie: boolean;
  /** Používatelia a pozvánky sa spravujú v skutočnej firme. */
  clenoviaZablokovani: boolean;
  /** Zmazať firmu nejde — maže sa spolu so skutočnou. */
  zmazanieZablokovane: boolean;
};

/** Čo z nastavení firmy ukázať pre danú firmu a rolu. */
export function nastaveniaTestovacej(
  firma: { testovacia_pre?: string | null } | null | undefined,
  rola: string | null | undefined,
): NastaveniaTestovacej {
  const test = jeTestovacia(firma);
  return {
    sekcia: test,
    vymazanie: test && jeAdminRola(rola),
    clenoviaZablokovani: test,
    zmazanieZablokovane: test,
  };
}
