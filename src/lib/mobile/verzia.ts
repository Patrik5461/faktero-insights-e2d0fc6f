/**
 * Vie appka o tom, že je stará?
 *
 * Appka sa neaktualizuje sama — rozhranie je v balíčku, takže každá oprava
 * znamená nový build a cestu cez App Store. Bez tohto by človek mesiace používal
 * verziu s chybou, ktorá je dávno opravená, a nemal by ako to zistiť: čas
 * zostavenia je len v Diagnostike.
 *
 * Zdrojom pravdy je `mobil-verzia.json` na webe. Prepínač `zverejnene` je tam
 * zámerne: build vznikne skôr, než ho Apple schváli, a posielať ľudí na
 * aktualizáciu, ktorá v obchode ešte nie je, je horšie než nepovedať nič.
 */
import { isOnline } from "./offline-queue";

// Endpoint, nie statický súbor: appka beží na vlastnom pôvode a statické súbory
// neposielajú hlavičky CORS — prehliadač vo WebView by odpoveď zahodil.
const ADRESA = "https://www.faktero.sk/api/public/mobil/verzia";

export type NovsiaVerzia = { peciatka: string; odkaz: string };

/** Pečiatka balíčka, ktorý beží. Na webe `null` — tam sa nič neaktualizuje ručne. */
export function mojaPeciatka(): string | null {
  return typeof __PECIATKA__ === "string" ? __PECIATKA__ : null;
}

/**
 * Má sa človeku ponúknuť aktualizácia?
 *
 * Oddelené od sťahovania, aby sa dalo overiť testom — práve tu sa dá pomýliť
 * spôsobom, ktorý sa v prevádzke prejaví ako otravný banner alebo ako ticho.
 */
export function jeNovsia(moja: string, zoServera: unknown): NovsiaVerzia | null {
  const j = zoServera as { peciatka?: unknown; zverejnene?: unknown; odkaz?: unknown } | null;
  if (!j || j.zverejnene !== true) return null;
  const peciatka = typeof j.peciatka === "string" ? j.peciatka : "";
  const odkaz = typeof j.odkaz === "string" ? j.odkaz : "";
  if (!peciatka || !odkaz) return null;
  // Pečiatka je „RRRR-MM-DD HH:MM", takže porovnanie reťazcov stačí.
  if (peciatka <= moja) return null;
  return { peciatka, odkaz };
}

/**
 * Vráti novšiu verziu, alebo `null`. Nikdy nevyhodí — kontrola verzie nie je
 * dôvod, aby sa appka nespustila.
 */
export async function zistiNovsiuVerziu(): Promise<NovsiaVerzia | null> {
  const moja = mojaPeciatka();
  if (!moja) return null;
  if (!(await isOnline())) return null;

  try {
    const riadenie = new AbortController();
    const strop = setTimeout(() => riadenie.abort(), 5000);
    const odpoved = await fetch(`${ADRESA}?t=${Date.now()}`, {
      cache: "no-store",
      signal: riadenie.signal,
    });
    clearTimeout(strop);
    if (!odpoved.ok) return null;

    return jeNovsia(moja, await odpoved.json());
  } catch {
    return null;
  }
}
