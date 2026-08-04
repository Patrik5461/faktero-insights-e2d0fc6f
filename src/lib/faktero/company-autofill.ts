import type { NormalizedCompany } from "./company-registry.server";

export type AutofillTarget = {
  name?: string | null;
  ico?: string | null;
  dic?: string | null;
  ic_dph?: string | null;
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string | null;
};

/**
 * Merge FinStat data into a form state. Manual-edit safety:
 * - mode "overwrite" (explicit user click): replace every field FinStat returned.
 * - mode "fill-empty" (automatic debounce lookup or name pick): only fill fields
 *   that are currently empty in the form; never overwrite a value the user typed.
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
  return {
    ...prev,
    ico: take("ico", d.ico),
    name: take("name", d.name) || (prev as any).name || "",
    dic: take("dic", d.dic ?? null),
    ic_dph: take("ic_dph", d.ic_dph ?? null),
    street: take("street", d.street ?? null),
    city: take("city", d.city ?? null),
    zip: take("zip", d.zip ?? null),
    country: take("country", d.country || "SK"),
  } as T;
}
