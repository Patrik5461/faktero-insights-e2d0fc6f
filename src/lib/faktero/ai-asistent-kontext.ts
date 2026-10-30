/*
  Pomocníci Faktero AI asistenta — čisté funkcie, aby sa dali otestovať bez
  databázy a bez volania modelu.
*/

/** Najviac správ z histórie, ktoré ide modelu (posledné, nie prvé). */
export const MAX_SPRAV_HISTORIE = 30;

/** Strop otázok jedného používateľa za deň — brzda proti míňaniu kreditu AI. */
export const DENNY_STROP_OTAZOK = 200;

type RiadokFaktury = { total?: unknown; currency?: unknown; customer_name?: unknown };

const menaRiadku = (r: RiadokFaktury, domaca: string) =>
  typeof r.currency === "string" && /^[A-Za-z]{3}$/.test(r.currency)
    ? r.currency.toUpperCase()
    : domaca;

const zaokruhli = (n: number) => Math.round(n * 100) / 100;

/**
 * Súčty podľa meny. Faktúry v rôznych menách sa nesmú sčítať do jedného čísla
 * — asistent by inak hlásil napr. „16 050 Kč“ z 11 210 Kč a 4 840 €.
 * Domáca mena ide prvá, ostatné podľa sumy.
 */
export function sumyPodlaMeny(
  riadky: RiadokFaktury[],
  domaca = "EUR",
): { mena: string; suma: number; pocet: number }[] {
  const m = new Map<string, { suma: number; pocet: number }>();
  for (const r of riadky) {
    const k = menaRiadku(r, domaca);
    const s = m.get(k) ?? { suma: 0, pocet: 0 };
    s.suma += Number(r.total ?? 0) || 0;
    s.pocet += 1;
    m.set(k, s);
  }
  return [...m.entries()]
    .map(([mena, s]) => ({ mena, suma: zaokruhli(s.suma), pocet: s.pocet }))
    .sort((a, b) => (a.mena === domaca ? -1 : b.mena === domaca ? 1 : b.suma - a.suma));
}

/** Suma len v domácej mene — tá jediná sa dá ukázať ako jedno číslo. */
export function sumaVDomacejMene(riadky: RiadokFaktury[], domaca = "EUR"): number {
  return sumyPodlaMeny(riadky, domaca).find((s) => s.mena === domaca)?.suma ?? 0;
}

/** Najväčší dlžníci — odberateľ a mena spolu, nikdy nie súčet cez meny. */
export function najvacsiDlznici(
  riadky: RiadokFaktury[],
  domaca = "EUR",
  kolko = 5,
): { name: string; total: number; currency: string }[] {
  const m = new Map<string, { name: string; total: number; currency: string }>();
  for (const r of riadky) {
    const meno = typeof r.customer_name === "string" ? r.customer_name.trim() : "";
    if (!meno) continue;
    const mena = menaRiadku(r, domaca);
    const k = `${meno}\u0000${mena}`;
    const d = m.get(k) ?? { name: meno, total: 0, currency: mena };
    d.total += Number(r.total ?? 0) || 0;
    m.set(k, d);
  }
  return [...m.values()]
    .map((d) => ({ ...d, total: zaokruhli(d.total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, kolko);
}

/**
 * Posledných `max` správ v poradí od najstaršej. Dotaz ich číta od najnovšej
 * (inak by po 30 správach model dostával začiatok rozhovoru a novú otázku nie).
 */
export function poslednychVPoradi<T>(
  odNajnovsej: T[] | null | undefined,
  max = MAX_SPRAV_HISTORIE,
): T[] {
  return [...(odNajnovsej ?? []).slice(0, max)].reverse();
}

const NAZVY_JAZYKOV: Record<string, string> = {
  sk: "slovenčine",
  cs: "češtine",
  de: "nemčine",
  en: "angličtine",
};

/** Pokyn k jazyku odpovede — podľa jazyka otázky, inak podľa jazyka aplikácie. */
export function pokynJazyka(jazykAplikacie?: string | null): string {
  const j = NAZVY_JAZYKOV[String(jazykAplikacie ?? "").toLowerCase()] ?? NAZVY_JAZYKOV.sk;
  return `Odpovedaj v jazyku, v ktorom je napísaná posledná otázka používateľa (slovenčina, čeština, nemčina…). Keď sa to z otázky nedá určiť, odpovedaj v ${j}. Názvy obrazoviek a ciest v aplikácii môžeš nechať tak, ako sú v podkladoch.`;
}
