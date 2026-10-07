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
  /** Len doklady, ktoré nahral tento používateľ. */
  pouzivatel_id?: string | null;
  /** Len doklady z mailu, ktorého predmet obsahuje tento text. */
  predmet_text?: string | null;
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
  created_by?: string | null;
  predmet_mailu?: string | null;
};

/**
 * Premenné v poznámke pravidla podľa dátumu dokladu — rovnaké ako
 * `faktero_premenne_poznamky` v databáze.
 */
export const PREMENNE_POZNAMKY: { kod: string; popis: string }[] = [
  { kod: "#MM#", popis: "mesiac dokladu (10)" },
  { kod: "#YYYY#", popis: "rok dokladu (2026)" },
  { kod: "#MM/YYYY#", popis: "mesiac a rok (10/2026)" },
  { kod: "#MMYYYY#", popis: "mesiac a rok bez lomky (102026)" },
  { kod: "#MM-1/YYYY#", popis: "predchádzajúci mesiac (09/2026)" },
];

export function premennePoznamky(text: string, den: string | null | undefined): string {
  const d = /^\d{4}-\d{2}/.test(String(den ?? "")) ? String(den) : new Date().toISOString().slice(0, 10);
  const r = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  const pr = m === 1 ? r - 1 : r;
  const pm = m === 1 ? 12 : m - 1;
  const dv = (n: number) => String(n).padStart(2, "0");
  return text
    .replaceAll("#MM-1/YYYY#", `${dv(pm)}/${pr}`)
    .replaceAll("#MM-1YYYY#", `${dv(pm)}${pr}`)
    .replaceAll("#MM-1#", dv(pm))
    .replaceAll("#MM/YYYY#", `${dv(m)}/${r}`)
    .replaceAll("#MM-YYYY#", `${dv(m)}-${r}`)
    .replaceAll("#MMYYYY#", `${dv(m)}${r}`)
    .replaceAll("#YYYY#", String(r))
    .replaceAll("#MM#", dv(m));
}

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
  if (p.pouzivatel_id && p.pouzivatel_id !== d.created_by) return false;
  if (!prazdne(p.predmet_text) && !holyText(d.predmet_mailu).includes(holyText(p.predmet_text!.trim())))
    return false;
  return true;
}

const bezDodavatela = (p: Pravidlo) => prazdne(p.dodavatel_ico) && prazdne(p.dodavatel_text);

/** Prvé pravidlo podľa poradia — tak ako v databáze. */
export function prvePravidlo<T extends Pravidlo>(pravidla: T[], d: DokladNaPorovnanie): T | null {
  return (
    [...pravidla]
      // Pravidlo podľa dodávateľa má prednosť pred pravidlom podľa používateľa či predmetu.
      .sort((a, b) => Number(bezDodavatela(a)) - Number(bezDodavatela(b)) || a.poradie - b.poradie)
      .find((p) => pravidloSedi(p, d)) ?? null
  );
}

/** Čo je s pravidlom zle, alebo `null`. Rovnaké podmienky ako CHECK v databáze. */
export function chybaPravidla(p: Pravidlo): string | null {
  if (prazdne(p.nazov)) return "Pravidlo potrebuje názov.";
  if (
    prazdne(p.dodavatel_ico) &&
    prazdne(p.dodavatel_text) &&
    prazdne(p.sposob_uhrady) &&
    !p.pouzivatel_id &&
    prazdne(p.predmet_text)
  )
    return "Vyplňte aspoň jednu podmienku — IČO, názov dodávateľa, spôsob úhrady, používateľa alebo predmet mailu.";
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
export function popisPravidla(p: Pravidlo, mena?: Record<string, string>): { ked: string; doplni: string } {
  const ked = [
    !prazdne(p.dodavatel_ico) && `IČO ${p.dodavatel_ico!.trim()}`,
    !prazdne(p.dodavatel_text) && `dodávateľ obsahuje „${p.dodavatel_text!.trim()}"`,
    !prazdne(p.sposob_uhrady) &&
      `platené: ${SPOSOBY_UHRADY_DOKLADU.find((s) => s.kod === p.sposob_uhrady)?.nazov ?? p.sposob_uhrady}`,
    p.pouzivatel_id && `nahral ${mena?.[p.pouzivatel_id] ?? "vybraný používateľ"}`,
    !prazdne(p.predmet_text) && `predmet mailu obsahuje „${p.predmet_text!.trim()}"`,
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
    pouzivatel_id: p.pouzivatel_id || null,
    predmet_text: t(p.predmet_text ?? null),
    kategoria: t(p.kategoria),
    predkontacia: t(p.predkontacia),
    clenenie_dph: t(p.clenenie_dph),
    odpocet: p.odpocet,
    poznamka: t(p.poznamka),
  };
}
