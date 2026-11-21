/*
  Filtre zoznamu Nespracovaných dokladov — rovnaké názvy a hodnoty v adrese
  ako ostatné zoznamy (stavebnice z `filtre-dokladov.ts`, kľúče pod `f`):
    ?f[druh]=faktura|zalohova|danovy|dobropis|blocek|ostatny|vydana|uhrada|neurceny
    ?f[uhrada]=hotovost|karta|prevod      — spôsob úhrady z vyčítaných údajov
    ?f[zauct]=ano|nie                     — s návrhom zaúčtovania (predkontácia) / bez
    ?f[obdobie_od]=RRRR-MM-DD&f[obdobie_do]=RRRR-MM-DD&f[podla]=vystavenie|nahratie
    ?f[citanie]=vytazene|cita|chyba       — stav čítania
    ?f[nahral]=<id používateľa>

  Zoznam sa načítava celý (nespracovaneFn), filtruje sa v pamäti.
  Bloček zo skenu nemá druh — patrí pod „Bloček“, nie pod „Neurčený“.
*/

export type RiadokNaFilter = {
  typ?: string | null;
  druh?: string | null;
  stav?: string | null;
  datum?: string | null;
  vytvorene?: string | null;
  nahral?: string | null;
  zdroj?: string | null;
  /** Spôsob úhrady (uložený, inak vyčítaný). */
  uhradaFiltra?: string | null;
  /** Nesie riadok predkontáciu (návrh zaúčtovania)? */
  navrhZauctovania?: boolean | null;
};

export type FiltreNespracovanych = {
  druh?: string | null;
  /** Spôsob úhrady (`?f[uhrada]`). */
  platba?: string | null;
  zauct?: string | null;
  podla?: string | null;
  od?: string | null;
  do?: string | null;
  citanie?: string | null;
  nahral?: string | null;
};

const SPOSOBY = ["hotovost", "karta", "prevod"] as const;

/** Spôsob úhrady z uloženej hodnoty, inak z AI (`payment_method`); iné hodnoty → null. */
export function sposobUhrady(...hodnoty: unknown[]): string | null {
  for (const h of hodnoty) {
    const v = typeof h === "string" ? h.trim().toLowerCase() : "";
    if ((SPOSOBY as readonly string[]).includes(v)) return v;
  }
  return null;
}

/** Druh riadku pre filter — bloček zo skenu je „blocek“, doklad bez druhu „neurceny“. */
export function druhNaFilter(r: RiadokNaFilter): string {
  if (r.typ === "blocek") return "blocek";
  return r.druh || "neurceny";
}

/** Deň (RRRR-MM-DD) podľa zvoleného dátumu; bez dátumu vystavenia sa berie nahratie. */
export function denNaFilter(r: RiadokNaFilter, podla: string | null | undefined): string {
  const vystavenie = r.datum ? String(r.datum).slice(0, 10) : "";
  if (podla !== "nahratie" && vystavenie) return vystavenie;
  if (!r.vytvorene) return "";
  const d = new Date(r.vytvorene);
  if (Number.isNaN(d.getTime())) return String(r.vytvorene).slice(0, 10);
  // Miestny deň nahratia (doklad nahratý o 0:30 patrí k tomu dňu, nie k predošlému v UTC).
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function vyhovujeFiltrom(r: RiadokNaFilter, f: FiltreNespracovanych): boolean {
  if (f.druh && druhNaFilter(r) !== f.druh) return false;
  if (f.platba && (r.uhradaFiltra ?? null) !== f.platba) return false;
  if (f.zauct === "ano" && !r.navrhZauctovania) return false;
  if (f.zauct === "nie" && r.navrhZauctovania) return false;
  if (f.citanie && (r.stav || "vytazene") !== f.citanie) return false;
  // Ako stĺpec Nahral: pri maile a API je `created_by` majiteľ adresy/kľúča, nie ten, kto nahral.
  if (f.nahral && (r.nahral !== f.nahral || r.zdroj === "mail" || r.zdroj === "api")) return false;
  if (f.od || f.do) {
    const den = denNaFilter(r, f.podla);
    if (!den) return false;
    if (f.od && den < f.od) return false;
    if (f.do && den > f.do) return false;
  }
  return true;
}

/** Možnosti filtra „Nahral“ — len kolegovia, ktorí v zozname niečo nahrali (mail a API sa nepočítajú). */
export function moznostiNahral(
  riadky: RiadokNaFilter[],
  mena: Record<string, string>,
): { value: string; label: string }[] {
  const ids = new Set<string>();
  for (const r of riadky) if (r.nahral && r.zdroj !== "mail" && r.zdroj !== "api" && mena[r.nahral]) ids.add(r.nahral);
  return [...ids]
    .map((id) => ({ value: id, label: mena[id]! }))
    .sort((a, b) => a.label.localeCompare(b.label, "sk"));
}
