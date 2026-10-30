import type { NormalizedCompany } from "./company-registry.server";
import {
  jeSchemaDph,
  predvolenaSchema,
  schema as schemaDph,
  zosuladSchemu,
  type SchemaDph,
} from "./dph-rezim";
import { krajinaDane } from "./vat-rates";

export type AutofillTarget = {
  name?: string | null;
  ico?: string | null;
  dic?: string | null;
  ic_dph?: string | null;
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string | null;
  vat_payer?: boolean | null;
  vat_scheme?: string | null;
};

/**
 * Merge FinStat data into a form state. Manual-edit safety:
 * - mode "overwrite" (explicit user click): replace every field FinStat returned.
 * - mode "fill-empty" (automatic debounce lookup or name pick): only fill fields
 *   that are currently empty in the form; never overwrite a value the user typed.
 *
 * Nájdené IČ DPH zaškrtne „platiteľ“, ale iba kým si človek postavenie k DPH
 * sám nenastavil. Register totiž paragraf registrácie nehovorí — kto je
 * registrovaný podľa § 7 alebo § 7a, IČ DPH má a platiteľom nie je, a takú
 * voľbu nesmie prepísať ďalšie vyhľadanie.
 */
export function mergeCompanyAutofill<T extends AutofillTarget>(
  prev: T,
  d: NormalizedCompany,
  opts: { mode: "overwrite" | "fill-empty" },
): T {
  const fillEmpty = opts.mode === "fill-empty";
  const take = <K extends keyof AutofillTarget>(
    key: K,
    value: AutofillTarget[K],
  ): AutofillTarget[K] => {
    const current = (prev as any)[key];
    const isEmpty = current === null || current === undefined || String(current).trim() === "";
    if (fillEmpty && !isEmpty) return current;
    return value ?? current ?? null;
  };
  const icDph = take("ic_dph", d.ic_dph ?? null);
  const krajina = krajinaDane(take("country", kodKrajiny(d.country) || "SK"));
  const uzVybrate = jeSchemaDph((prev as any).vat_scheme);
  /*
    České firmy: ARES povie platiteľstvo priamo (registrácia DPH aktívna) —
    to platí aj nad skôr predvoleným „neplatiteľom“. Slovenské IČ DPH samo
    platiteľstvo neznamená (§ 7), tam ostáva voľba človeka.
  */
  /*
    Režim priamo z registra DPH (FS SR s paragrafom registrácie, Registr
    plátců DPH s typom subjektu). Ten je presný, a tak prebije aj predvoleného
    „neplatiteľa“, s ktorým formulár začína. Režim, ktorý človek vybral inak,
    ostáva — prepíše ho len výslovné vyhľadanie (mode „overwrite“).
  */
  const rezimRegistra =
    jeSchemaDph(d.vatScheme) && schemaDph(d.vatScheme).krajina === krajina ? d.vatScheme : null;
  const predvoleny =
    !uzVybrate ||
    (!(prev as any).vat_payer && (prev as any).vat_scheme === predvolenaSchema(krajina, false));
  if (rezimRegistra && "vat_scheme" in prev && (opts.mode === "overwrite" || predvoleny)) {
    return {
      ...zaklad(prev, d, take, icDph),
      vat_payer: schemaDph(rezimRegistra).platitel,
      vat_scheme: rezimRegistra,
    } as T;
  }
  const zRegistraPlatitel = krajina === "CZ" && d.vatStatus === "Áno";
  const platitel = zRegistraPlatitel
    ? true
    : uzVybrate
      ? (prev as any).vat_payer
      : Boolean(String(icDph ?? "").trim());
  // Vybraný režim ostáva, len ak patrí ku krajine z registra — inak by česká
  // firma odišla do databázy so slovenským „neplatiteľom“.
  const schema: SchemaDph = uzVybrate
    ? zosuladSchemu((prev as any).vat_scheme as SchemaDph, krajina, Boolean(platitel))
    : predvolenaSchema(krajina, Boolean(platitel));

  return {
    ...zaklad(prev, d, take, icDph),
    ...("vat_scheme" in prev ? { vat_payer: Boolean(platitel), vat_scheme: schema } : {}),
  } as T;
}

function zaklad<T extends AutofillTarget>(
  prev: T,
  d: NormalizedCompany,
  take: <K extends keyof AutofillTarget>(key: K, value: AutofillTarget[K]) => AutofillTarget[K],
  icDph: AutofillTarget["ic_dph"],
) {
  return {
    ...prev,
    ico: take("ico", d.ico),
    name: take("name", d.name) || (prev as any).name || "",
    dic: take("dic", d.dic ?? null),
    ic_dph: icDph,
    street: take("street", d.street ?? null),
    city: take("city", d.city ?? null),
    zip: take("zip", d.zip ?? null),
    country: take("country", kodKrajiny(d.country) || "SK"),
  };
}

/**
 * Register vracia krajinu slovom („Česká republika“), no všade inde sa
 * porovnáva kód (QR platba, eFaktúra, VIES). Slovenské a české názvy sa
 * preložia na kód, ostatné sa nechajú tak.
 */
export function kodKrajiny(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = s.toUpperCase();
  if (/^(CZ|CZE|ČESK|CESK|CZECH)/.test(n)) return "CZ";
  if (/^(SK|SVK|SLOVENSK|SLOVAK)/.test(n)) return "SK";
  return s;
}

/**
 * Dvojpísmenový kód krajiny pre exporty (Money `KodStatu`, MRP `CountryCode`,
 * Pohoda `typ:country`, ISDOC) — „Slovensko" na odberateľovi dalo v Money
 * neplatné XML a skrátené „SL" by bola Sierra Leone. Čo sa na kód previesť
 * nedá, vráti null a pole sa vynechá.
 */
export function kodStatu(v: unknown): string | null {
  const k = kodKrajiny(typeof v === "string" ? v : v == null ? null : String(v));
  const u = String(k ?? "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(u) ? u : null;
}
