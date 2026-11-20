/*
  Hľadanie v hlavičke — dotazy do databázy klientom prihláseného (RLS).

  Každá skupina je jeden dotaz s `or` podmienkami, limitom a presným počtom;
  bežia súbežne. Skupiny, ktoré človek s vlastným prístupom nevidí, sa vôbec
  nepýtajú. Chyba jednej skupiny (napr. RLS) ostatné nezhodí — skupina je
  prázdna.
*/
import {
  DEF_SKUPIN,
  NACITAT_NA_SKUPINU,
  MIN_DLZKA,
  filterSkupiny,
  mapujRiadok,
  rozoberDotaz,
  skupinyPreClena,
  zoskupVysledky,
  type SkupinaHladania,
  type SkupinaVysledkov,
} from "./globalne-hladanie";
import { normalizuj } from "./hladanie-text";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Klient = any;

export type VysledokGlobalnehoHladania = {
  dotaz: string;
  skupiny: SkupinaVysledkov[];
  /** Skupiny, v ktorých sa hľadalo (bez tých, ktoré človek nevidí). */
  prehladane: SkupinaHladania[];
};

/** Rola a oprávnenia prihláseného v danej firme; null = nie je členom. */
export async function clenstvo(
  sb: Klient,
  companyId: string,
  userId: string,
): Promise<{ rola: string; opravnenia: Record<string, unknown> } | null> {
  const { data } = await sb
    .from("company_users")
    .select("role, permissions")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return { rola: String(data.role), opravnenia: (data.permissions ?? {}) as Record<string, unknown> };
}

export async function hladajSkupinu(
  sb: Klient,
  companyId: string,
  s: SkupinaHladania,
  filter: string,
): Promise<{ pocet: number; riadky: Record<string, unknown>[] }> {
  const d = DEF_SKUPIN[s];
  let q = sb.from(d.tabulka).select(d.stlpce, { count: "exact" }).eq("company_id", companyId);
  if (d.kos) q = q.is("deleted_at", null);
  q = q.or(filter);
  const { data, error, count } = await q
    .order(d.poradie.stlpec, { ascending: !!d.poradie.vzostupne, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(NACITAT_NA_SKUPINU);
  if (error) {
    console.warn(`[globalne-hladanie] ${s}: ${error.message}`);
    return { pocet: 0, riadky: [] };
  }
  return { pocet: count ?? (data ?? []).length, riadky: data ?? [] };
}

export async function hladajGlobalne(
  sb: Klient,
  p: { companyId: string; userId: string; dotaz: string; dnes: string },
): Promise<VysledokGlobalnehoHladania> {
  const clen = await clenstvo(sb, p.companyId, p.userId);
  if (!clen) throw new Error("K tejto firme nemáte prístup.");
  const rozbor = rozoberDotaz(p.dotaz);
  const prehladane = skupinyPreClena(clen.rola, clen.opravnenia);
  if (normalizuj(rozbor.text).replace(/ /g, "").length < MIN_DLZKA && rozbor.suma == null)
    return { dotaz: rozbor.text, skupiny: [], prehladane };
  const vysledky = await Promise.all(
    prehladane.map(async (s) => {
      const filter = filterSkupiny(s, rozbor);
      if (!filter) return { skupina: s, pocet: 0, riadky: [] };
      const { pocet, riadky } = await hladajSkupinu(sb, p.companyId, s, filter);
      return { skupina: s, pocet, riadky: riadky.map((r) => mapujRiadok(s, r, p.dnes)) };
    }),
  );
  return { dotaz: rozbor.text, skupiny: zoskupVysledky(vysledky, rozbor.text), prehladane };
}
