/**
 * Skladanie adresy z odpovede geokodéra — čistá časť, bez siete.
 *
 * Pelias (cez OpenRouteService) vracia pri bode aj ulicu s číslom, aj názov
 * blízkeho bodu záujmu. Do knihy jázd sa hodí ulica a mesto; „Fontána Zem,
 * Bratislava" síce sedí, ale po roku už nikto nevie, kde to bolo. Preto sa
 * meno bodu záujmu berie až vtedy, keď ulica nie je.
 */

export type GeoVlastnosti = {
  name?: string | null;
  street?: string | null;
  housenumber?: string | null;
  locality?: string | null;
  localadmin?: string | null;
  county?: string | null;
  region?: string | null;
  country?: string | null;
  label?: string | null;
};

/** Mesto, ako ho pozná človek — Pelias ho podľa krajiny ukladá do rôznych polí. */
function mesto(v: GeoVlastnosti): string | null {
  return v.locality?.trim() || v.localadmin?.trim() || v.county?.trim() || null;
}

function ulica(v: GeoVlastnosti): string | null {
  const u = v.street?.trim();
  if (!u) return null;
  const c = v.housenumber?.trim();
  return c ? `${u} ${c}` : u;
}

/**
 * Adresa do knihy jázd. Vracia `null`, keď z odpovede nevznikne nič čitateľné —
 * prázdne miesto je lepšie než „Slovensko".
 */
export function zlozAdresu(v: GeoVlastnosti | null | undefined): string | null {
  if (!v) return null;
  const m = mesto(v);
  const u = ulica(v);
  if (u && m) return `${u}, ${m}`;
  if (u) return u;
  // Bez ulice je meno bodu záujmu lepšie ako samotné mesto — aspoň povie,
  // pri čom auto stálo.
  const n = v.name?.trim();
  if (n && m && n !== m) return `${n}, ${m}`;
  if (m) return m;
  return n || v.label?.trim() || null;
}

/**
 * Kľúč do pamäte preložených miest. Štyri desatinné miesta sú zhruba 11 metrov
 * — dosť na to, aby sa parkovanie pred tou istou bránou nepýtalo dvakrát, a
 * málo na to, aby sa zliali dve susedné ulice.
 */
export function geoKluc(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}
