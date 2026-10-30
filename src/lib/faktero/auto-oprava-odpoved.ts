/*
  Odpoveď zákazníkovi po nasadení automatickej opravy — čisté funkcie.

  Text vzniká zo zhrnutia, ktoré pri návrhu napísal agent „pre zákazníka“.
  Agent pracoval nad kódom, preto sa zo zhrnutia vyhodí všetko technické
  (cesty k súborom, kód v úvodzovkách, názvy vetiev a commitov) a oslovenie
  či podpis, ktoré sem dáva šablóna. Podpora text pred odoslaním vidí a smie
  ho prepísať; prepísaný text sa už neupravuje.
*/
import { cisloPoziadavky } from "./podpora";

/** Najdlhšie zhrnutie, ktoré ide do odpovede — dlhšie sa skráti na celú vetu. */
export const MAX_ZHRNUTIE = 900;
/** Po koľkých dňoch od nasadenia už automat neodpovedá (zabudnutý riadok). */
export const DNI_NA_ODPOVED = 2;

/** Zhrnutie zo starších riadkov, kde bolo len v poli `zmena` za „Návrh odpovede:“. */
export function zhrnutieZoZmeny(zmena: string | null | undefined): string | null {
  const m = String(zmena ?? "").match(/Návrh odpovede:\s*([\s\S]+)$/);
  return m?.[1]?.trim() || null;
}

const OSLOVENIE = /^\s*(dobrý deň|dobry den|dobrý večer|ahoj|zdravím|vážen[ýá][^,\n]*)[,!.]?\s*/i;
const PODPIS =
  /\n\s*(s pozdravom|s pozdravem|ďakujeme|ďakujem|pekný deň|váš tím|tím faktero|podpora faktera)[\s\S]*$/i;

/** Zo zhrnutia agenta urobí pár viet bežnou rečou, bez technických detailov. */
export function ocistiZhrnutie(text: string | null | undefined): string | null {
  let t = String(text ?? "").replace(/\r/g, "");
  t = t.replace(OSLOVENIE, "");
  t = t.replace(PODPIS, "");
  t = t
    // blok kódu a kód v `…`
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    // cesty a názvy súborov (src/…, *.tsx, *.ts, *.sql …)
    .replace(/\(?\b(?:src|scripts|supabase|public)\/[\w./$-]+\)?/g, " ")
    .replace(/\(?\b[\w.$-]+\.(?:tsx?|mjs|js|sql|json|css)\b\)?/g, " ")
    // vetvy a odtlačky commitov
    .replace(/\boprava\/P-\d+-\d+\b/g, " ")
    .replace(/\b[0-9a-f]{7,40}\b/g, " ")
    // odkazy nechávame len na faktero.sk
    .replace(/https?:\/\/(?![^\s/]*faktero\.sk)[^\s)]+/gi, " ");
  t = t
    .replace(/[ \t]+/g, " ")
    .replace(/ +([,.;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((r) => r.trim())
    .join("\n")
    .trim();
  if (t.length > MAX_ZHRNUTIE) {
    const kus = t.slice(0, MAX_ZHRNUTIE);
    const koniecVety = Math.max(kus.lastIndexOf(". "), kus.lastIndexOf(".\n"));
    t = koniecVety > MAX_ZHRNUTIE / 3 ? kus.slice(0, koniecVety + 1) : `${kus.trimEnd()}…`;
  }
  return t.length >= 10 ? t : null;
}

/** Predvolený text odpovede, keď ho podpora neprepísala. */
export function navrhOdpovede(args: {
  cislo: number;
  predmet: string;
  zhrnutie: string | null | undefined;
}): string {
  const c = cisloPoziadavky(args.cislo);
  const predmet = String(args.predmet ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const zhrnutie = ocistiZhrnutie(args.zhrnutie);
  return [
    "Dobrý deň,",
    "",
    `chybu, ktorú ste nahlásili v požiadavke ${c}${predmet ? ` („${predmet}“)` : ""}, sme opravili a oprava je už na faktero.sk.`,
    ...(zhrnutie ? ["", zhrnutie] : []),
    "",
    "Aby sa zmena prejavila, stačí stránku obnoviť (v mobilnej appke ju zavrieť a znova otvoriť).",
    "Ak by sa problém ešte objavil, odpovedzte na túto správu a pozrieme sa na to znova.",
    "",
    "Ďakujeme, že ste nám chybu nahlásili.",
    "Podpora Faktera",
  ].join("\n");
}

/** Text, ktorý naozaj odíde: prepísaný podporou, inak predvolený. */
export function textOdpovede(o: {
  cislo: number;
  predmet: string;
  odpoved_text?: string | null;
  odpoved_zhrnutie?: string | null;
  zmena?: string | null;
}): string {
  const vlastny = String(o.odpoved_text ?? "").trim();
  if (vlastny) return vlastny;
  return navrhOdpovede({
    cislo: o.cislo,
    predmet: o.predmet,
    zhrnutie: o.odpoved_zhrnutie ?? zhrnutieZoZmeny(o.zmena),
  });
}

/**
 * Či text obsahuje niektorú zo serverových tajných hodnôt (kľúče z prostredia).
 * Krátke hodnoty (prepínače, čísla portov) sa nerátajú — tie nie sú tajomstvo
 * a dávali by falošné poplachy.
 */
export function obsahujeTajomstvo(text: string, hodnoty: Iterable<string | undefined>): boolean {
  for (const h of hodnoty) {
    if (typeof h !== "string" || h.length < 16) continue;
    if (text.includes(h)) return true;
  }
  return false;
}

export type DovodBezOdpovede =
  "nie_je_nasadena" | "vypnuta" | "uz_odoslana" | "pozde" | "poziadavka_uzavreta";

/** Či smie automat po nasadení odpovedať — pravidlá na jednom mieste. */
export function smieOdpovedat(
  o: {
    stav: string;
    odpoved_auto: boolean | null;
    odpoved_odoslana_at: string | null;
    nasadena_at: string | null;
  },
  stavPoziadavky: string,
  teraz = Date.now(),
): DovodBezOdpovede | null {
  if (o.stav !== "nasadena") return "nie_je_nasadena";
  if (o.odpoved_odoslana_at) return "uz_odoslana";
  if (!o.odpoved_auto) return "vypnuta";
  if (!o.nasadena_at || teraz - new Date(o.nasadena_at).getTime() > DNI_NA_ODPOVED * 86_400_000)
    return "pozde";
  // Podpora požiadavku medzitým uzavrela sama (napr. odpovedala ručne).
  if (stavPoziadavky === "vyriesena") return "poziadavka_uzavreta";
  return null;
}
