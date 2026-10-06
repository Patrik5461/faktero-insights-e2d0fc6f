/*
  Výber stĺpcov a uložené filtre zoznamov (ako v Doklado).

  Nastavenie sa ukladá pre používateľa — buď pre konkrétnu firmu, alebo pre
  všetky jeho firmy naraz (company_id null). Stĺpce firmy prebíjajú spoločné;
  filtre sa zlučujú, aby boli k dispozícii obe sady.
*/

export type StlpecZoznamu = {
  kluc: string;
  nazov: string;
  /** Bez neho zoznam nedáva zmysel (napr. dodávateľ) — nedá sa skryť. */
  povinny?: boolean;
  /** Ukazuje sa, kým si používateľ stĺpce nezmení. */
  predvoleny?: boolean;
};

export type UlozenyFilter = {
  nazov: string;
  hodnoty: Record<string, string>;
  /** Odkiaľ prišiel — podľa toho sa aj maže. */
  vsetkyFirmy?: boolean;
};

export type RiadokNastaveni = {
  company_id: string | null;
  stlpce: string[] | null;
  filtre: unknown;
};

export function nacitajFiltre(v: unknown): UlozenyFilter[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((f) => f && typeof f === "object" && String((f as any).nazov ?? "").trim())
    .map((f: any) => ({
      nazov: String(f.nazov).trim().slice(0, 60),
      hodnoty: Object.fromEntries(
        Object.entries(f.hodnoty ?? {}).map(([k, x]) => [k, String(x ?? "")]),
      ),
    }));
}

/** Viditeľné stĺpce a filtre zo spoločného a firemného riadku. */
export function zlucNastavenia(
  stlpce: StlpecZoznamu[],
  riadky: RiadokNastaveni[],
): { viditelne: string[]; filtre: UlozenyFilter[]; stlpcePreVsetky: boolean } {
  const firma = riadky.find((r) => r.company_id);
  const vsetky = riadky.find((r) => !r.company_id);
  const zvolene = firma?.stlpce ?? vsetky?.stlpce ?? null;
  const zname = new Set(stlpce.map((s) => s.kluc));
  const viditelne = zvolene
    ? stlpce.filter((s) => s.povinny || zvolene.includes(s.kluc)).map((s) => s.kluc)
    : stlpce.filter((s) => s.povinny || s.predvoleny !== false).map((s) => s.kluc);
  const filtre = [
    ...nacitajFiltre(firma?.filtre).map((f) => ({ ...f, vsetkyFirmy: false })),
    ...nacitajFiltre(vsetky?.filtre).map((f) => ({ ...f, vsetkyFirmy: true })),
  ];
  return {
    viditelne: viditelne.filter((k) => zname.has(k)),
    filtre,
    stlpcePreVsetky: !firma?.stlpce && !!vsetky?.stlpce,
  };
}

/** Uloženie filtra pod menom: rovnaké meno prepíše starý. */
export function pridajFilter(filtre: UlozenyFilter[], novy: UlozenyFilter): UlozenyFilter[] {
  const meno = novy.nazov.trim().slice(0, 60);
  return [...filtre.filter((f) => f.nazov !== meno), { nazov: meno, hodnoty: novy.hodnoty }].slice(
    -30,
  );
}
