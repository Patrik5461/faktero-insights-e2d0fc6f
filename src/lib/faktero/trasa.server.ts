/**
 * Návrh trasy medzi dvoma adresami.
 *
 * Kniha jázd mala „Odkiaľ" a „Kam" ako voľný text a kilometre sa brali výhradne
 * z tachometra. Trasu po cestách vie appka nakresliť (`MapaTrasy`), ale len keď
 * ju zmeria telefón — pri ručne zadanej jazde nemal kto povedať, kade sa išlo.
 *
 * Adresu na súradnice a súradnice na trasu prekladá OpenRouteService: stojí na
 * tých istých dátach OpenStreetMap ako dlaždice, ktoré už kreslíme, takže mapa
 * a trasa sedia. Volá sa zo servera, nie z prehliadača — kľúč nemá čo hľadať
 * v stránke.
 *
 * DÔLEŽITÉ: navrhnutá vzdialenosť je najkratšia cesta po cestách, nie to, čo
 * auto naozaj prešlo. Pre knihu jázd je rozhodujúci tachometer, preto sa
 * odtiaľto nič nikam nezapisuje — je to ponuka, ktorú človek buď použije,
 * alebo nie.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ORS = "https://api.openrouteservice.org";

/** Slovensko ako stred hľadania — „Hlavná 12" je inak v každej druhej krajine. */
const STRED_SK = { lat: 48.7, lng: 19.7 };

const Vstup = z.object({
  odkial: z.string().min(2).max(200),
  kam: z.string().min(2).max(200),
});

export type NavrhTrasy = {
  /** Zakódovaná trasa pre `MapaTrasy`. */
  route: string;
  vzdialenost_km: number;
  trvanie_min: number;
  odkial: { nazov: string; lat: number; lng: number };
  kam: { nazov: string; lat: number; lng: number };
};

function kluc(): string {
  const k = process.env.ORS_API_KEY?.trim();
  if (!k) {
    throw new Error("Návrh trasy nie je nastavený — chýba kľúč k OpenRouteService (ORS_API_KEY).");
  }
  return k;
}

/**
 * Preklad chyby služby na vetu, ktorá človeku niečo povie.
 *
 * Zvlášť preto, aby sa dala otestovať bez behu servera — a aby sa nedalo
 * ticho pridať stavový kód bez hlášky.
 */
export function chybaSluzby(stav: number): string {
  return (
    {
      401: "Kľúč k OpenRouteService neplatí.",
      403: "Kľúč nemá na túto službu oprávnenie.",
      429: "Denný limit bezplatnej úrovne je vyčerpaný, skúste zajtra.",
      404: "Medzi zadanými miestami sa nenašla cesta pre auto.",
    }[stav] ?? `Služba máp vrátila ${stav}.`
  );
}

/** Odpoveď smerovania na čísla, ktoré uvidí človek. */
export function trasaZOdpovede(smer: unknown): {
  route: string;
  vzdialenost_km: number;
  trvanie_min: number;
} {
  const trasa = (smer as any)?.routes?.[0];
  if (!trasa?.geometry) throw new Error("Medzi zadanými miestami sa nenašla cesta pre auto.");
  return {
    // ORS vracia zakódovanú čiaru s rovnakou presnosťou (5), akú číta `dekoduj`.
    route: trasa.geometry,
    // Na desatiny kilometra — jemnejšie číslo by v knihe jázd nič neznamenalo.
    vzdialenost_km: Math.round((trasa.summary?.distance ?? 0) / 100) / 10,
    trvanie_min: Math.round((trasa.summary?.duration ?? 0) / 60),
  };
}

/** Prvý výsledok hľadania adresy. */
export function miestoZOdpovede(
  data: unknown,
  adresa: string,
): { nazov: string; lat: number; lng: number } {
  const prvy = (data as any)?.features?.[0];
  if (!prvy) throw new Error(`Adresu „${adresa}" sa nepodarilo nájsť na mape.`);
  const [lng, lat] = prvy.geometry.coordinates;
  return { nazov: prvy.properties?.label ?? adresa, lat, lng };
}

async function zavolaj(cesta: string, moznosti: RequestInit = {}): Promise<any> {
  const odpoved = await fetch(`${ORS}${cesta}`, {
    ...moznosti,
    headers: {
      Authorization: kluc(),
      "Content-Type": "application/json",
      Accept: "application/json, application/geo+json",
      ...(moznosti.headers ?? {}),
    },
    // Bez stropu by pomalá odpoveď držala serverovú funkciu, kým ju nginx po
    // 30 sekundách neutne — a človek by nedostal ani chybu.
    signal: AbortSignal.timeout(12_000),
  });
  const text = await odpoved.text();
  if (!odpoved.ok) throw new Error(chybaSluzby(odpoved.status));
  return JSON.parse(text);
}

/** Adresa na súradnice. Vracia aj nájdený názov, nech je vidieť, čo sa trafilo. */
async function najdi(adresa: string): Promise<{ nazov: string; lat: number; lng: number }> {
  const q = new URLSearchParams({
    text: adresa,
    size: "1",
    "focus.point.lat": String(STRED_SK.lat),
    "focus.point.lon": String(STRED_SK.lng),
  });
  return miestoZOdpovede(await zavolaj(`/geocode/search?${q}`), adresa);
}

/**
 * Napovedanie adries počas písania.
 *
 * Vlastný endpoint (`/geocode/autocomplete`), nie hľadanie — je stavaný na
 * rozpísaný text a odpovedá rýchlejšie. Obmedzené na Slovensko: kniha jázd sa
 * píše po slovensky a „Hlavná" je inak v každej druhej krajine.
 */
export const napovedzAdresu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ text: z.string().trim().min(2).max(120) }).parse(d))
  .handler(async ({ data }): Promise<string[]> => {
    const q = new URLSearchParams({
      text: data.text,
      size: "6",
      "boundary.country": "SK",
      "focus.point.lat": String(STRED_SK.lat),
      "focus.point.lon": String(STRED_SK.lng),
    });
    const odpoved = await zavolaj(`/geocode/autocomplete?${q}`);
    return navrhyZOdpovede(odpoved);
  });

/** Z odpovede napovedania spraví zoznam názvov bez opakovania. */
export function navrhyZOdpovede(data: unknown): string[] {
  const prvky = ((data as any)?.features ?? []) as any[];
  const von: string[] = [];
  for (const f of prvky) {
    const nazov = f?.properties?.label;
    // Rovnaká adresa chodí aj viackrát (ulica a bod na nej) — v zozname na
    // výber by dva rovnaké riadky vyzerali ako chyba.
    if (typeof nazov === "string" && nazov && !von.includes(nazov)) von.push(nazov);
  }
  return von;
}

export const navrhniTrasu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Vstup.parse(d))
  .handler(async ({ data }): Promise<NavrhTrasy> => {
    // Obe adresy naraz — jedna čaká na druhú zbytočne.
    const [odkial, kam] = await Promise.all([najdi(data.odkial), najdi(data.kam)]);

    const smer = await zavolaj("/v2/directions/driving-car", {
      method: "POST",
      body: JSON.stringify({
        coordinates: [
          [odkial.lng, odkial.lat],
          [kam.lng, kam.lat],
        ],
      }),
    });

    return { ...trasaZOdpovede(smer), odkial, kam };
  });
