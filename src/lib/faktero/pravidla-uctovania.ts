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
import { nacitajPomer } from "./rozuctovanie";

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

/**
 * Pre ktorý druh dokladu ponúknuť kódy vo formulári pravidla (`navrhyKodovFn`
 * `pre`). Pravidlo len pre prijaté faktúry dostane predkontácie agendy
 * Prijaté faktúry — Pohoda má ten istý kód v rôznych agendách s iným
 * významom („7“ = Nákup materiálu v prijatých, Hrubá mzda v interných
 * dokladoch). S ponukou bločkov sa „Nákup materiálu“ nedal nájsť a človek
 * cez „Použiť kód…“ uložil do pravidla názov namiesto kódu.
 */
export function ponukaKodovPravidla(druh: DruhPravidla | null | undefined): "prijata" | "doklad" | "vystavena" {
  if (druh === "vystavena") return "vystavena";
  if (druh === "prijata") return "prijata";
  return "doklad";
}

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
  /** Banka: IBAN protistrany (z banky či výpisu). */
  iban_protistrany?: string | null;
  /**
   * Banka: výsledok „Spárované bez dokladu" — pohyb sa pri príchode označí za
   * vybavený (spúšťač `faktero_vybav_novy_pohyb`), nečaká na doklad.
   */
  bez_dokladu?: boolean;
  kategoria: string | null;
  predkontacia: string | null;
  clenenie_dph: string | null;
  odpocet: boolean | null;
  poznamka: string | null;
  kv_clenenie?: string | null;
  /** Len doklady z mailu, ktorého odosielateľ obsahuje tento text (adresa či doména). */
  odosielatel_text?: string | null;
  /** Krajina dodávateľa (ISO kód, napr. CZ); bez krajiny na doklade platí krajina firmy. */
  krajina?: string | null;
  /** Stály variabilný symbol prijatej faktúry (zmluva s operátorom, energie). */
  variabilny_symbol?: string | null;
  /** Výsledok: skratka pokladne v Pohode pre hotovostný bloček. */
  pokladna?: string | null;
  /** Výsledok: rozúčtovanie pomerom (tvar `PomerPredkontacie`), sumy dopočíta export. */
  rozuctovanie?: unknown;
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
  /** Odosielateľ mailu, z ktorého doklad prišiel. */
  odosielatel_mailu?: string | null;
  /** Krajina dodávateľa z dokladu — pozri `krajinaDokladu`. */
  krajina?: string | null;
  /** Krajina firmy — platí, keď doklad krajinu dodávateľa nemá (ako v databáze). */
  krajina_firmy?: string | null;
  variabilny_symbol?: string | null;
};

/**
 * Krajina dodávateľa — rovnaké ako `faktero_krajina_dokladu` v databáze:
 * uvedená krajina, inak predpona IČ DPH (EL = Grécko).
 */
export function krajinaDokladu(
  krajina: string | null | undefined,
  icDph: string | null | undefined,
): string | null {
  const k = String(krajina ?? "").trim().toUpperCase();
  if (k) return k;
  const ic = String(icDph ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}[0-9A-Z]/.test(ic)) return null;
  const p = ic.slice(0, 2);
  return p === "EL" ? "GR" : p;
}

/** VS na porovnanie — len číslice bez úvodných núl. */
export function normVs(v: string | null | undefined): string {
  return String(v ?? "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");
}

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
  if (
    !prazdne(p.odosielatel_text) &&
    !String(d.odosielatel_mailu ?? "")
      .toLowerCase()
      .includes(p.odosielatel_text!.trim().toLowerCase())
  )
    return false;
  if (!prazdne(p.krajina)) {
    const k = String(d.krajina ?? "").trim().toUpperCase() || String(d.krajina_firmy ?? "").trim().toUpperCase();
    if (k !== p.krajina!.trim().toUpperCase()) return false;
  }
  if (!prazdne(p.variabilny_symbol)) {
    const vs = normVs(d.variabilny_symbol);
    if (!vs || vs !== normVs(p.variabilny_symbol)) return false;
  }
  return true;
}

/** Pravidlo podľa partnera alebo stáleho VS má prednosť — ako v databáze. */
const bezDodavatela = (p: Pravidlo) =>
  prazdne(p.dodavatel_ico) && prazdne(p.dodavatel_text) && prazdne(p.variabilny_symbol);

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
    if (
      prazdne(p.bankovy_ucet) &&
      !p.smer &&
      prazdne(p.oznacenie) &&
      prazdne(p.dodavatel_text) &&
      prazdne(p.iban_protistrany) &&
      prazdne(p.variabilny_symbol)
    )
      return "Vyplňte aspoň jednu podmienku — účet, smer, typ pohybu, IBAN protistrany, VS alebo protistranu.";
    if (!prazdne(p.variabilny_symbol) && !normVs(p.variabilny_symbol))
      return "Variabilný symbol musí mať číslice.";
    if (p.bez_dokladu) {
      // Pri príchode pohybu sa typ pohybu ešte nevie — pravidlo by nezabralo nikdy.
      if (!prazdne(p.oznacenie))
        return "Pravidlo „Spárované bez dokladu“ nemôže mať podmienku na typ pohybu — nechajte ho „Akýkoľvek“.";
      // Samotný účet či smer by za vybavené označil všetko.
      if (prazdne(p.iban_protistrany) && prazdne(p.variabilny_symbol) && prazdne(p.dodavatel_text))
        return "Pravidlo „Spárované bez dokladu“ potrebuje IBAN protistrany, VS alebo protistranu.";
      return null;
    }
    if (prazdne(p.predkontacia)) return "Pravidlo pre banku potrebuje predkontáciu.";
    return null;
  }
  if (
    prazdne(p.dodavatel_ico) &&
    prazdne(p.dodavatel_text) &&
    prazdne(p.sposob_uhrady) &&
    !p.pouzivatel_id &&
    prazdne(p.predmet_text) &&
    prazdne(p.typ_dokladu) &&
    prazdne(p.odosielatel_text) &&
    prazdne(p.krajina) &&
    prazdne(p.variabilny_symbol)
  )
    return p.druh === "vystavena"
      ? "Vyplňte aspoň jednu podmienku — IČO, názov odberateľa, typ faktúry alebo vystavovateľa."
      : "Vyplňte aspoň jednu podmienku — IČO, názov dodávateľa, typ, spôsob úhrady, používateľa, e-mail, krajinu alebo variabilný symbol.";
  if (!prazdne(p.krajina) && !/^[A-Za-z]{2}$/.test(p.krajina!.trim()))
    return "Krajina je dvojpísmenový kód, napr. SK alebo CZ.";
  if (!prazdne(p.variabilny_symbol) && !normVs(p.variabilny_symbol))
    return "Variabilný symbol musí mať číslice.";
  if (p.rozuctovanie && !nacitajPomer(p.rozuctovanie))
    return "Rozúčtovanie nesedí — časti musia dať spolu 100 % a každá potrebuje predkontáciu.";
  if (
    prazdne(p.kategoria) &&
    prazdne(p.predkontacia) &&
    prazdne(p.clenenie_dph) &&
    prazdne(p.poznamka) &&
    prazdne(p.kv_clenenie) &&
    prazdne(p.pokladna) &&
    !p.rozuctovanie &&
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
    p.druh === "banka" && !prazdne(p.iban_protistrany) && `IBAN protistrany ${p.iban_protistrany!.trim()}`,
    !prazdne(p.typ_dokladu) &&
      (TYPY_DOKLADU.find((t) => t.kod === p.typ_dokladu)?.nazov ?? p.typ_dokladu),
    !prazdne(p.dodavatel_ico) && `IČO ${p.dodavatel_ico!.trim()}`,
    !prazdne(p.dodavatel_text) && `${partner} obsahuje „${p.dodavatel_text!.trim()}"`,
    !prazdne(p.sposob_uhrady) &&
      `platené: ${SPOSOBY_UHRADY_DOKLADU.find((s) => s.kod === p.sposob_uhrady)?.nazov ?? p.sposob_uhrady}`,
    p.pouzivatel_id &&
      `${p.druh === "vystavena" ? "vystavil" : "nahral"} ${mena?.[p.pouzivatel_id] ?? "vybraný používateľ"}`,
    !prazdne(p.predmet_text) && `predmet mailu obsahuje „${p.predmet_text!.trim()}"`,
    !prazdne(p.odosielatel_text) && `e-mail od „${p.odosielatel_text!.trim()}"`,
    !prazdne(p.krajina) && `krajina ${p.krajina!.trim().toUpperCase()}`,
    !prazdne(p.variabilny_symbol) && `VS ${p.variabilny_symbol!.trim()}`,
  ].filter(Boolean) as string[];
  const doplni = [
    p.druh === "banka" && p.bez_dokladu && "spárované bez dokladu",
    !prazdne(p.kategoria) && `kategória ${nazovKategorie(p.kategoria)}`,
    !prazdne(p.predkontacia) && `predkontácia ${p.predkontacia!.trim()}`,
    !prazdne(p.clenenie_dph) && `členenie DPH ${p.clenenie_dph!.trim()}`,
    !prazdne(p.kv_clenenie) && `KV ${p.kv_clenenie!.trim()}`,
    !prazdne(p.pokladna) && `pokladňa ${p.pokladna!.trim()}`,
    popisRozuctovania(p.rozuctovanie),
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
    iban_protistrany: prazdne(p.iban_protistrany) ? null : normIban(p.iban_protistrany),
    bez_dokladu: p.druh === "banka" && !!p.bez_dokladu,
    kv_clenenie: t(p.kv_clenenie ?? null),
    odosielatel_text: prazdne(p.odosielatel_text) ? null : p.odosielatel_text!.trim().toLowerCase(),
    krajina: prazdne(p.krajina) ? null : p.krajina!.trim().toUpperCase(),
    variabilny_symbol: prazdne(p.variabilny_symbol) ? null : normVs(p.variabilny_symbol) || null,
    pokladna: t(p.pokladna ?? null),
    rozuctovanie: p.rozuctovanie ? nacitajPomer(p.rozuctovanie) : null,
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
  /** IBAN protistrany. */
  protiucet?: string | null;
  vs?: string | null;
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
    [
      p.bankovy_ucet,
      p.smer,
      p.oznacenie,
      p.dodavatel_text,
      p.iban_protistrany,
      p.variabilny_symbol,
    ].filter((x) => !prazdne(x)).length;
  return (
    pravidla
      .filter((p) => p.aktivne && p.druh === "banka" && !prazdne(p.predkontacia))
      .filter((p) => prazdne(p.bankovy_ucet) || normIban(p.bankovy_ucet) === iban)
      .filter((p) => !p.smer || p.smer === pohyb.smer)
      .filter(
        (p) => prazdne(p.iban_protistrany) || normIban(p.iban_protistrany) === normIban(pohyb.protiucet),
      )
      .filter(
        (p) =>
          prazdne(p.variabilny_symbol) ||
          (!!normVs(pohyb.vs) && normVs(p.variabilny_symbol) === normVs(pohyb.vs)),
      )
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
      // Poznámka a VS pri banke ostávajú — poznámka ide k pohybu vybavenému bez dokladu.
      odosielatel_text: null,
      krajina: null,
      pokladna: null,
      rozuctovanie: null,
    };
  let bezBanky: Pravidlo = {
    ...p,
    bankovy_ucet: null,
    smer: null,
    oznacenie: null,
    iban_protistrany: null,
    bez_dokladu: false,
  };
  if (p.druh === "vystavena")
    return {
      ...bezBanky,
      sposob_uhrady: null,
      predmet_text: null,
      kategoria: null,
      odpocet: null,
      poznamka: null,
      odosielatel_text: null,
      krajina: null,
      variabilny_symbol: null,
      pokladna: null,
      rozuctovanie: null,
    };
  // Bloček variabilný symbol nemá; pokladňu má len bloček.
  if (p.druh === "blocek") bezBanky = { ...bezBanky, variabilny_symbol: null };
  if (p.druh === "prijata") bezBanky = { ...bezBanky, pokladna: null };
  // Typ faktúry poznajú len prijaté (bloček typ nemá) — a z typov len tie prijaté.
  if (p.druh !== "prijata" || !TYPY_DOKLADU.some((t) => t.prijata && t.kod === p.typ_dokladu))
    return { ...bezBanky, typ_dokladu: null };
  return bezBanky;
}

/** „rozúčtovanie 80/20" do popisu pravidla, alebo `false`. */
function popisRozuctovania(v: unknown): string | false {
  const x = v as { typ?: string; casti?: { podiel?: number }[]; zaklad?: number } | null;
  if (!x || typeof x !== "object") return false;
  if (x.typ === "pomer" && Array.isArray(x.casti))
    return `rozúčtovanie ${x.casti.map((c) => Number(c?.podiel) || 0).join("/")}`;
  if (x.typ === "dph5050") return `rozúčtovanie ${Number(x.zaklad) || 0} %, DPH 50 %`;
  return false;
}

/* --------------------------------------------- pravidlo z dokladu */

/** Čo sa o doklade vie pri „Vytvoriť pravidlo z tohto dokladu". */
export type ZakladPravidlaZDokladu = {
  druh: "blocek" | "prijata" | "vystavena";
  nazov?: string | null;
  ico?: string | null;
  odosielatel?: string | null;
  vs?: string | null;
  platba?: string | null;
  predkontacia?: string | null;
  clenenie?: string | null;
  kv?: string | null;
  kategoria?: string | null;
  pokladna?: string | null;
};

/**
 * Pravidlo s rovnakým partnerom (IČO, názov), stálym VS alebo odosielateľom
 * pre ten istý druh dokladu — nech sa nové nezdvojí, ale otvorí sa existujúce.
 */
export function podobnePravidlo<T extends Pravidlo>(pravidla: T[], z: ZakladPravidlaZDokladu): T | null {
  const ico = cislice(z.ico);
  const nazov = holyText(z.nazov).trim();
  const vs = normVs(z.vs);
  const mail = String(z.odosielatel ?? "").trim().toLowerCase();
  const preDruh = (p: Pravidlo) =>
    p.druh !== "banka" && (p.druh ? p.druh === z.druh : z.druh !== "vystavena");
  return (
    [...pravidla]
      .sort((a, b) => a.poradie - b.poradie)
      .find((p) => {
        if (!preDruh(p)) return false;
        if (!prazdne(p.variabilny_symbol)) return Boolean(vs) && normVs(p.variabilny_symbol) === vs;
        if (!prazdne(p.dodavatel_ico)) return ico.length >= 6 && cislice(p.dodavatel_ico) === ico;
        if (!prazdne(p.dodavatel_text))
          return Boolean(nazov) && nazov.includes(holyText(p.dodavatel_text!.trim()));
        if (!prazdne(p.odosielatel_text))
          return Boolean(mail) && mail.includes(p.odosielatel_text!.trim().toLowerCase());
        return false;
      }) ?? null
  );
}

/**
 * Parametre odkazu na stránku Pravidlá účtovania, ktoré predvyplnia nové
 * pravidlo z dokladu — alebo otvoria podobné existujúce (`upravit`).
 */
export function hladaniePravidlaZDokladu(
  z: ZakladPravidlaZDokladu,
  existujuce?: { id?: string } | null,
): Record<string, string | undefined> {
  if (existujuce?.id) return { upravit: existujuce.id };
  const ico = cislice(z.ico);
  const v = (x: string | null | undefined) => (prazdne(x) ? undefined : x!.trim());
  return {
    novy: z.druh,
    nazov: v(z.nazov),
    ico: ico.length >= 6 ? ico : undefined,
    // Formulár ich použije ako podmienku sám len bez partnera, inak ich ponúkne na pridanie.
    email: z.druh === "vystavena" ? undefined : v(z.odosielatel),
    vs: z.druh === "prijata" ? v(z.vs) : undefined,
    predkontacia: v(z.predkontacia),
    clenenie: v(z.clenenie),
    kv: v(z.kv),
    kategoria: z.druh === "vystavena" ? undefined : v(z.kategoria),
    pokladna: z.druh === "blocek" ? v(z.pokladna) : undefined,
  };
}
