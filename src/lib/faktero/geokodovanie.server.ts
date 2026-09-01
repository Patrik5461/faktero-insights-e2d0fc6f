/**
 * Preklad súradníc na adresu (reverse geocoding) cez OpenRouteService.
 *
 * Ten istý kľúč, akým sa navrhujú trasy. Bezplatná kvóta je obmedzená, preto
 * má každé miesto v `geokod_cache` svoj riadok — domov a firma sa v knihe jázd
 * opakujú stále dokola a preložia sa raz.
 *
 * Zlyhanie tu nikdy nesmie zhodiť volajúceho: adresa je pohodlie, nie údaj,
 * bez ktorého jazda neplatí. Preto sa vracia `null` a nič sa nevyhadzuje.
 */
import { geoKluc, zlozAdresu, type GeoVlastnosti } from "./geokodovanie";

const CAS_LIMIT_MS = 8000;

/** Koľko volaní za sebou smie zlyhať, kým sa na službu prestane chodiť. */
const STROP_ZLYHANI = 3;
let zlyhaniPoSebe = 0;

function kluc(): string | null {
  return process.env.ORS_API_KEY?.trim() || null;
}

async function opytajSaOrs(lat: number, lon: number): Promise<string | null> {
  const k = kluc();
  if (!k) return null;

  const url =
    `https://api.openrouteservice.org/geocode/reverse?api_key=${encodeURIComponent(k)}` +
    `&point.lat=${lat}&point.lon=${lon}&size=1&lang=sk`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CAS_LIMIT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      console.warn(`[geokod] ${res.status} pre ${lat},${lon}`);
      zlyhaniPoSebe++;
      return null;
    }
    const json: any = await res.json();
    zlyhaniPoSebe = 0;
    const v: GeoVlastnosti | undefined = json?.features?.[0]?.properties;
    return zlozAdresu(v);
  } catch (e: any) {
    console.warn(`[geokod] ${lat},${lon} zlyhalo: ${e?.message ?? e}`);
    zlyhaniPoSebe++;
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Adresa bodu. Najprv pamäť, potom služba. Zapamätá sa aj neúspech (prázdna
 * adresa), aby sa to isté prázdne miesto nepýtalo pri každom behu znova.
 */
export async function adresaZBodu(
  supabaseAdmin: any,
  lat: number,
  lon: number,
): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const k = geoKluc(lat, lon);

  const { data: zPamate } = await supabaseAdmin
    .from("geokod_cache")
    .select("adresa")
    .eq("kluc", k)
    .maybeSingle();
  if (zPamate) return zPamate.adresa;

  if (zlyhaniPoSebe >= STROP_ZLYHANI) return null;

  const adresa = await opytajSaOrs(lat, lon);
  // Keď služba nedostupná, do pamäte sa nezapisuje — inak by sa výpadok
  // zabetónoval a miesto by ostalo bez adresy navždy.
  if (adresa === null && zlyhaniPoSebe > 0) return null;

  await supabaseAdmin
    .from("geokod_cache")
    .upsert({ kluc: k, lat, lon, adresa }, { onConflict: "kluc" });
  return adresa;
}
