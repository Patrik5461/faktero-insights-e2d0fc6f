/*
  Predlohy zaúčtovania (ako „Predloha" v automatickom účtovaní Doklado):
  pomenovaná šablóna kódov bez podmienky. Nič sa neuplatní samo — účtovník
  ju jedným klikom použije v paneli zaúčtovania dokladu.
*/

export type DruhPredlohy = "blocek" | "prijata" | "vystavena";

export type Predloha = {
  id?: string;
  nazov: string;
  /** `null` = bločky aj prijaté faktúry. */
  druh: DruhPredlohy | null;
  predkontacia: string | null;
  clenenie_dph: string | null;
  kv_clenenie: string | null;
  /** Skratka pokladne — len pri bločku. */
  pokladna: string | null;
  /** Číselný rad v Pohode. */
  rad: string | null;
  /** Interná poznámka pre účtovníka (ide do Pohody). */
  poznamka: string | null;
  poradie: number;
};

export const NOVA_PREDLOHA: Predloha = {
  nazov: "",
  druh: null,
  predkontacia: null,
  clenenie_dph: null,
  kv_clenenie: null,
  pokladna: null,
  rad: null,
  poznamka: null,
  poradie: 100,
};

export const DRUHY_PREDLOH: { kod: DruhPredlohy | null; nazov: string }[] = [
  { kod: null, nazov: "Bločky aj prijaté faktúry" },
  { kod: "blocek", nazov: "Bločky" },
  { kod: "prijata", nazov: "Prijaté faktúry" },
  { kod: "vystavena", nazov: "Vystavené faktúry" },
];

const prazdne = (v: string | null | undefined) => !String(v ?? "").trim();

/** Čo je s predlohou zle, alebo `null`. */
export function chybaPredlohy(p: Predloha): string | null {
  if (prazdne(p.nazov)) return "Predloha potrebuje názov.";
  if (p.nazov.trim().length > 120) return "Názov má najviac 120 znakov.";
  if ([p.predkontacia, p.clenenie_dph, p.kv_clenenie, p.pokladna, p.rad, p.poznamka].every(prazdne))
    return "Vyplňte aspoň jednu vec, ktorú má predloha doplniť.";
  if (String(p.poznamka ?? "").length > 240) return "Poznámka má najviac 240 znakov.";
  return null;
}

/** Prázdne na `null`; čo daný druh nepozná (pokladňa mimo bločku), preč. */
export function naUlozeniePredlohy(p: Predloha): Omit<Predloha, "id"> {
  const t = (v: string | null | undefined) => (prazdne(v) ? null : v!.trim());
  const blocek = p.druh === "blocek" || p.druh === null;
  return {
    nazov: p.nazov.trim(),
    druh: p.druh ?? null,
    predkontacia: t(p.predkontacia),
    clenenie_dph: t(p.clenenie_dph),
    kv_clenenie: t(p.kv_clenenie),
    pokladna: blocek ? t(p.pokladna) : null,
    rad: t(p.rad),
    poznamka: t(p.poznamka),
    poradie: Math.round(Number(p.poradie) || 100),
  };
}

/** Predlohy, ktoré sa ponúknu pri doklade daného druhu (v poradí). */
export function predlohyPreDruh<T extends Predloha>(predlohy: T[], druh: DruhPredlohy): T[] {
  return predlohy
    .filter((p) => (p.druh ? p.druh === druh : druh !== "vystavena"))
    .sort((a, b) => a.poradie - b.poradie || a.nazov.localeCompare(b.nazov, "sk"));
}

/** „518 / PD / KV B2 / rad 26FP" na jeden riadok. */
export function popisPredlohy(p: Predloha): string {
  return [
    !prazdne(p.predkontacia) && p.predkontacia!.trim(),
    !prazdne(p.clenenie_dph) && p.clenenie_dph!.trim(),
    !prazdne(p.kv_clenenie) && `KV ${p.kv_clenenie!.trim()}`,
    !prazdne(p.pokladna) && `pokladňa ${p.pokladna!.trim()}`,
    !prazdne(p.rad) && `rad ${p.rad!.trim()}`,
    !prazdne(p.poznamka) && `„${p.poznamka!.trim()}"`,
  ]
    .filter(Boolean)
    .join(" / ");
}

/**
 * Hodnoty predlohy do formulára — prepíšu len to, čo predloha má; ostatné
 * polia ostanú, ako ich človek vyplnil.
 */
export function uplatniPredlohu<
  H extends {
    predkontacia?: string;
    clenenie?: string;
    kv?: string;
    rad?: string;
    intPoznamka?: string;
    pokladna?: string;
  },
>(h: H, p: Predloha): H {
  const out = { ...h };
  const nastav = (k: keyof H, v: string | null) => {
    if (!prazdne(v)) (out as Record<string, unknown>)[k as string] = v!.trim();
  };
  nastav("predkontacia", p.predkontacia);
  nastav("clenenie", p.clenenie_dph);
  nastav("kv", p.kv_clenenie);
  if ("rad" in h) nastav("rad", p.rad);
  if ("intPoznamka" in h) nastav("intPoznamka", p.poznamka);
  if ("pokladna" in h) nastav("pokladna", p.pokladna);
  return out;
}
