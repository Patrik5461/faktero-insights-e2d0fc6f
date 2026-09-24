import type { NormalizedCompany } from "./company-registry.server";
import { jeSchemaDph, predvolenaSchema, type SchemaDph } from "./dph-rezim";
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
  const krajina = krajinaDane(take("country", d.country || "SK"));
  const uzVybrate = jeSchemaDph((prev as any).vat_scheme);
  const platitel = uzVybrate ? (prev as any).vat_payer : Boolean(String(icDph ?? "").trim());
  const schema: SchemaDph = uzVybrate
    ? ((prev as any).vat_scheme as SchemaDph)
    : predvolenaSchema(krajina, Boolean(platitel));

  return {
    ...prev,
    ...("vat_scheme" in prev ? { vat_payer: Boolean(platitel), vat_scheme: schema } : {}),
    ico: take("ico", d.ico),
    name: take("name", d.name) || (prev as any).name || "",
    dic: take("dic", d.dic ?? null),
    ic_dph: icDph,
    street: take("street", d.street ?? null),
    city: take("city", d.city ?? null),
    zip: take("zip", d.zip ?? null),
    country: take("country", d.country || "SK"),
  } as T;
}
