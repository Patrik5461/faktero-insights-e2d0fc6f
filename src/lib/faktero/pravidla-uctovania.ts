/*
  Pravidlá na automatické účtovanie prijatých dokladov.

  Samotné uplatnenie robí databáza (spúšťač `faktero_uplatni_pravidlo`), aby
  zabralo pri každom spôsobe vzniku dokladu. Tu je to, čo potrebuje obrazovka:
  popis pravidla, kontrola formulára a to isté porovnanie ako v databáze — na
  náhľad „sedí na N dokladov" ešte pred uložením.
*/
import { nazovKategorie } from "@/lib/mobile/kategorie-vydavkov";

export type Pravidlo = {
  id?: string;
  nazov: string;
  poradie: number;
  aktivne: boolean;
  dodavatel_ico: string | null;
  dodavatel_text: string | null;
  sposob_uhrady: string | null;
  kategoria: string | null;
  predkontacia: string | null;
  clenenie_dph: string | null;
  odpocet: boolean | null;
  poznamka: string | null;
};

export type DokladNaPorovnanie = {
  supplier_ico: string | null;
  supplier_name: string | null;
  payment_method: string | null;
};

export const SPOSOBY_UHRADY_DOKLADU: { kod: string; nazov: string }[] = [
  { kod: "hotovost", nazov: "Hotovosť" },
  { kod: "karta", nazov: "Karta" },
  { kod: "prevod", nazov: "Prevod" },
];

const prazdne = (v: string | null | undefined) => !String(v ?? "").trim();

/** Rovnaké ako `translate(lower(…))` v databáze — malé písmená bez diakritiky. */
export function holyText(v: string | null | undefined): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const cislice = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");

/** Sedí pravidlo na doklad? Musí sa zhodovať s `faktero_pravidlo_pre_doklad`. */
export function pravidloSedi(p: Pravidlo, d: DokladNaPorovnanie): boolean {
  if (!p.aktivne) return false;
  if (!prazdne(p.dodavatel_ico) && cislice(d.supplier_ico) !== cislice(p.dodavatel_ico))
    return false;
  if (
    !prazdne(p.dodavatel_text) &&
    !holyText(d.supplier_name).includes(holyText(p.dodavatel_text!.trim()))
  )
    return false;
  if (!prazdne(p.sposob_uhrady) && p.sposob_uhrady !== d.payment_method) return false;
  return true;
}

/** Prvé pravidlo podľa poradia — tak ako v databáze. */
export function prvePravidlo<T extends Pravidlo>(pravidla: T[], d: DokladNaPorovnanie): T | null {
  return (
    [...pravidla].sort((a, b) => a.poradie - b.poradie).find((p) => pravidloSedi(p, d)) ?? null
  );
}

/** Čo je s pravidlom zle, alebo `null`. Rovnaké podmienky ako CHECK v databáze. */
export function chybaPravidla(p: Pravidlo): string | null {
  if (prazdne(p.nazov)) return "Pravidlo potrebuje názov.";
  if (prazdne(p.dodavatel_ico) && prazdne(p.dodavatel_text) && prazdne(p.sposob_uhrady))
    return "Vyplňte aspoň jednu podmienku — IČO, názov dodávateľa alebo spôsob úhrady.";
  if (!prazdne(p.dodavatel_ico) && cislice(p.dodavatel_ico).length < 6)
    return "IČO má aspoň 6 číslic.";
  if (
    prazdne(p.kategoria) &&
    prazdne(p.predkontacia) &&
    prazdne(p.clenenie_dph) &&
    prazdne(p.poznamka) &&
    p.odpocet === null
  )
    return "Vyplňte aspoň jednu vec, ktorú má pravidlo doplniť.";
  return null;
}

/** „Keď … → doplní …" na jeden riadok v zozname. */
export function popisPravidla(p: Pravidlo): { ked: string; doplni: string } {
  const ked = [
    !prazdne(p.dodavatel_ico) && `IČO ${p.dodavatel_ico!.trim()}`,
    !prazdne(p.dodavatel_text) && `dodávateľ obsahuje „${p.dodavatel_text!.trim()}"`,
    !prazdne(p.sposob_uhrady) &&
      `platené: ${SPOSOBY_UHRADY_DOKLADU.find((s) => s.kod === p.sposob_uhrady)?.nazov ?? p.sposob_uhrady}`,
  ].filter(Boolean) as string[];
  const doplni = [
    !prazdne(p.kategoria) && `kategória ${nazovKategorie(p.kategoria)}`,
    !prazdne(p.predkontacia) && `predkontácia ${p.predkontacia!.trim()}`,
    !prazdne(p.clenenie_dph) && `členenie DPH ${p.clenenie_dph!.trim()}`,
    p.odpocet === false && "bez odpočtu DPH",
    p.odpocet === true && "s odpočtom DPH",
    !prazdne(p.poznamka) && `poznámka „${p.poznamka!.trim()}"`,
  ].filter(Boolean) as string[];
  return { ked: ked.join(" a "), doplni: doplni.join(", ") };
}

/** Prázdne reťazce na `null`, aby sa v databáze nemiešalo „nič" s „prázdnym". */
export function naUlozenie(p: Pravidlo): Omit<Pravidlo, "id"> {
  const t = (v: string | null) => (prazdne(v) ? null : v!.trim());
  return {
    nazov: p.nazov.trim(),
    poradie: Math.round(Number(p.poradie) || 100),
    aktivne: p.aktivne,
    dodavatel_ico: prazdne(p.dodavatel_ico) ? null : cislice(p.dodavatel_ico),
    dodavatel_text: t(p.dodavatel_text),
    sposob_uhrady: t(p.sposob_uhrady),
    kategoria: t(p.kategoria),
    predkontacia: t(p.predkontacia),
    clenenie_dph: t(p.clenenie_dph),
    odpocet: p.odpocet,
    poznamka: t(p.poznamka),
  };
}
