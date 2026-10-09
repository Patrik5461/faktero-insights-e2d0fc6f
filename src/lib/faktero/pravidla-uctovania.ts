/*
  Pravidlá na automatické účtovanie (ako „Automatické účtovanie" v Doklado):
  bločky, prijaté a vystavené faktúry a pohyby na bankovom výpise.

  Samotné uplatnenie robí databáza (spúšťač `faktero_uplatni_pravidlo`), aby
  zabralo pri každom spôsobe vzniku dokladu. Tu je to, čo potrebuje obrazovka:
  popis pravidla, kontrola formulára a to isté porovnanie ako v databáze — na
  náhľad „sedí na N dokladov" ešte pred uložením.
*/
import { nazovKategorie } from "@/lib/mobile/kategorie-vydavkov";
import { nazovOznacenia } from "./vypis-oznacenie";

/**
 * Na čo pravidlo platí. `null` sú pôvodné pravidlá — bločky aj prijaté faktúry.
 * Banka sa uplatňuje pri vývoze výpisu do Pohody, ostatné spúšťač v databáze.
 */
export type DruhPravidla = "blocek" | "prijata" | "vystavena" | "banka";

export const DRUHY_PRAVIDIEL: { kod: DruhPravidla | null; nazov: string }[] = [
  { kod: null, nazov: "Bločky aj prijaté faktúry" },
  { kod: "blocek", nazov: "Bločky" },
  { kod: "prijata", nazov: "Prijaté faktúry" },
  { kod: "vystavena", nazov: "Vystavené faktúry" },
  { kod: "banka", nazov: "Banka" },
];

/** Typ faktúry ako podmienka — prijaté poznajú len prvé tri. */
export const TYPY_DOKLADU: { kod: string; nazov: string; prijata: boolean }[] = [
  { kod: "regular", nazov: "Faktúra", prijata: true },
  { kod: "proforma", nazov: "Zálohová faktúra", prijata: true },
  { kod: "credit_note", nazov: "Dobropis", prijata: true },
  { kod: "debit_note", nazov: "Ťarchopis", prijata: false },
  { kod: "advance_payment", nazov: "Daňový doklad k platbe", prijata: false },
];

export const SMERY_POHYBU: { kod: "prijem" | "vydaj"; nazov: string }[] = [
  { kod: "prijem", nazov: "Príjem (kredit)" },
  { kod: "vydaj", nazov: "Výdaj (debet)" },
];

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
  druh?: DruhPravidla | null;
  /** Typ faktúry (`regular`, `proforma`, `credit_note`…). */
  typ_dokladu?: string | null;
  /** Banka: IBAN účtu, smer a označenie pohybu (poplatok, daň…). */
  bankovy_ucet?: string | null;
  smer?: "prijem" | "vydaj" | null;
  oznacenie?: string | null;
  kategoria: string | null;
  predkontacia: string | null;
  clenenie_dph: string | null;
  odpocet: boolean | null;
  poznamka: string | null;
  kv_clenenie?: string | null;
};

export type DokladNaPorovnanie = {
  supplier_ico: string | null;
  supplier_name: string | null;
  payment_method: string | null;
  created_by?: string | null;
  predmet_mailu?: string | null;
  /** Druh dokladu; bez neho bloček (tak sa správali pôvodné pravidlá). */
  druh?: "blocek" | "prijata" | "vystavena";
  /** Typ faktúry — pri prijatej z `typPrijatej`. */
  typ?: string | null;
};

/** Rovnaké ako `faktero_typ_prijatej` v databáze. */
export function typPrijatej(
  typ: string | null | undefined,
  suma: number | string | null | undefined,
  opravuje: string | null | undefined,
): string {
  if (typ === "proforma") return "proforma";
  if (Number(suma ?? 0) < 0 || String(opravuje ?? "").trim()) return "credit_note";
  return "regular";
}

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
  const druh = d.druh ?? "blocek";
  if (p.druh === "banka") return false;
  if (p.druh ? p.druh !== druh : druh === "vystavena") return false;
  if (!prazdne(p.typ_dokladu) && p.typ_dokladu !== (d.typ ?? null)) return false;
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

/** Čo je s pravidlom zle, alebo `null`. */
export function chybaPravidla(p: Pravidlo): string | null {
  if (prazdne(p.nazov)) return "Pravidlo potrebuje názov.";
  if (!prazdne(p.dodavatel_ico) && cislice(p.dodavatel_ico).length < 6)
    return "IČO má aspoň 6 číslic.";
  if (p.druh === "banka") {
    if (prazdne(p.bankovy_ucet) && !p.smer && prazdne(p.oznacenie) && prazdne(p.dodavatel_text))
      return "Vyplňte aspoň jednu podmienku — účet, smer, typ pohybu alebo protistranu.";
    if (prazdne(p.predkontacia)) return "Pravidlo pre banku potrebuje predkontáciu.";
    return null;
  }
  if (
    prazdne(p.dodavatel_ico) &&
    prazdne(p.dodavatel_text) &&
    prazdne(p.sposob_uhrady) &&
    !p.pouzivatel_id &&
    prazdne(p.predmet_text) &&
    prazdne(p.typ_dokladu)
  )
    return p.druh === "vystavena"
      ? "Vyplňte aspoň jednu podmienku — IČO, názov odberateľa, typ faktúry alebo vystavovateľa."
      : "Vyplňte aspoň jednu podmienku — IČO, názov dodávateľa, typ, spôsob úhrady, používateľa alebo predmet mailu.";
  if (
    prazdne(p.kategoria) &&
    prazdne(p.predkontacia) &&
    prazdne(p.clenenie_dph) &&
    prazdne(p.poznamka) &&
    prazdne(p.kv_clenenie) &&
    p.odpocet === null
  )
    return "Vyplňte aspoň jednu vec, ktorú má pravidlo doplniť.";
  return null;
}

/** „Keď … → doplní …" na jeden riadok v zozname. */
export function popisPravidla(p: Pravidlo, mena?: Record<string, string>): { ked: string; doplni: string } {
  const partner = p.druh === "vystavena" ? "odberateľ" : p.druh === "banka" ? "protistrana" : "dodávateľ";
  const ked = [
    p.druh === "banka" && !prazdne(p.bankovy_ucet) && `účet ${p.bankovy_ucet!.trim()}`,
    p.druh === "banka" && p.smer && (p.smer === "prijem" ? "príjem" : "výdaj"),
    p.druh === "banka" && !prazdne(p.oznacenie) && (nazovOznacenia(p.oznacenie) ?? p.oznacenie),
    !prazdne(p.typ_dokladu) &&
      (TYPY_DOKLADU.find((t) => t.kod === p.typ_dokladu)?.nazov ?? p.typ_dokladu),
    !prazdne(p.dodavatel_ico) && `IČO ${p.dodavatel_ico!.trim()}`,
    !prazdne(p.dodavatel_text) && `${partner} obsahuje „${p.dodavatel_text!.trim()}"`,
    !prazdne(p.sposob_uhrady) &&
      `platené: ${SPOSOBY_UHRADY_DOKLADU.find((s) => s.kod === p.sposob_uhrady)?.nazov ?? p.sposob_uhrady}`,
    p.pouzivatel_id &&
      `${p.druh === "vystavena" ? "vystavil" : "nahral"} ${mena?.[p.pouzivatel_id] ?? "vybraný používateľ"}`,
    !prazdne(p.predmet_text) && `predmet mailu obsahuje „${p.predmet_text!.trim()}"`,
  ].filter(Boolean) as string[];
  const doplni = [
    !prazdne(p.kategoria) && `kategória ${nazovKategorie(p.kategoria)}`,
    !prazdne(p.predkontacia) && `predkontácia ${p.predkontacia!.trim()}`,
    !prazdne(p.clenenie_dph) && `členenie DPH ${p.clenenie_dph!.trim()}`,
    !prazdne(p.kv_clenenie) && `KV ${p.kv_clenenie!.trim()}`,
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
    druh: p.druh ?? null,
    typ_dokladu: t(p.typ_dokladu ?? null),
    bankovy_ucet: prazdne(p.bankovy_ucet) ? null : normIban(p.bankovy_ucet),
    smer: p.smer ?? null,
    oznacenie: t(p.oznacenie ?? null),
    kv_clenenie: t(p.kv_clenenie ?? null),
    kategoria: t(p.kategoria),
    predkontacia: t(p.predkontacia),
    clenenie_dph: t(p.clenenie_dph),
    odpocet: p.odpocet,
    poznamka: t(p.poznamka),
  };
}

const normIban = (v: string | null | undefined) => String(v ?? "").replace(/\s+/g, "").toUpperCase();

export type PohybNaPorovnanie = {
  smer: "prijem" | "vydaj";
  oznacenie?: string | null;
  protistrana?: string | null;
  popis?: string | null;
};

/**
 * Pravidlo pre pohyb na výpise (ako „Automatické účtovanie pre banku" v
 * Doklado: účet, kredit/debet, typ pohybu). Protistrana sa hľadá v mene aj v
 * popise platby. Pri viacerých platí menšie poradie, pri rovnakom to s viac
 * podmienkami.
 */
export function pravidloPohybu<T extends Pravidlo>(
  pravidla: T[],
  pohyb: PohybNaPorovnanie,
  ucet: string | null | undefined,
): T | null {
  const iban = normIban(ucet);
  const podmienok = (p: Pravidlo) =>
    [p.bankovy_ucet, p.smer, p.oznacenie, p.dodavatel_text].filter((x) => !prazdne(x)).length;
  return (
    pravidla
      .filter((p) => p.aktivne && p.druh === "banka" && !prazdne(p.predkontacia))
      .filter((p) => prazdne(p.bankovy_ucet) || normIban(p.bankovy_ucet) === iban)
      .filter((p) => !p.smer || p.smer === pohyb.smer)
      .filter((p) => prazdne(p.oznacenie) || p.oznacenie === pohyb.oznacenie)
      .filter(
        (p) =>
          prazdne(p.dodavatel_text) ||
          holyText(`${pohyb.protistrana ?? ""} ${pohyb.popis ?? ""}`).includes(
            holyText(p.dodavatel_text!.trim()),
          ),
      )
      .filter((p) => podmienok(p) > 0)
      .sort((a, b) => a.poradie - b.poradie || podmienok(b) - podmienok(a))[0] ?? null
  );
}

/**
 * Pred uložením zahodí podmienky a výsledky, ktoré daný druh nepozná — pri
 * prepnutí druhu vo formulári by inak ostali skryté a pravidlo by nesedelo.
 */
export function ocistiPodlaDruhu(p: Pravidlo): Pravidlo {
  if (p.druh === "banka")
    return {
      ...p,
      dodavatel_ico: null,
      sposob_uhrady: null,
      pouzivatel_id: null,
      predmet_text: null,
      typ_dokladu: null,
      kategoria: null,
      clenenie_dph: null,
      kv_clenenie: null,
      odpocet: null,
      poznamka: null,
    };
  const bezBanky = { ...p, bankovy_ucet: null, smer: null, oznacenie: null };
  if (p.druh === "vystavena")
    return { ...bezBanky, sposob_uhrady: null, predmet_text: null, kategoria: null, odpocet: null, poznamka: null };
  // Typ faktúry poznajú len prijaté (bloček typ nemá) — a z typov len tie prijaté.
  if (p.druh !== "prijata" || !TYPY_DOKLADU.some((t) => t.prijata && t.kod === p.typ_dokladu))
    return { ...bezBanky, typ_dokladu: null };
  return bezBanky;
}
