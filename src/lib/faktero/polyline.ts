/**
 * Kódovanie trasy do polyline (Google, presnosť 5 desatinných miest ≈ 1 meter).
 *
 * Prečo nie surové body: hodinová jazda má pri filtri na 30 metrov okolo
 * 1 500 bodov, čo je v JSON-e asi 60 kB na jeden riadok knihy jázd.
 * Zakódovane je to zhruba štvrtina a mapa si to vie prečítať priamo.
 *
 * Plugin naschvál vracia surové body a kódovanie necháva na túto vrstvu.
 */
export type Bod = { lat: number; lng: number };

/**
 * Koľko bodov sa najviac uloží. Pri 30-metrovom filtri to zodpovedá zhruba
 * 150 kilometrom; dlhšia cesta sa preriedi, tvar trasy tým neutrpí.
 */
export const MAX_BODOV = 5000;

function cislo(hodnota: number): string {
  // Zigzag: znamienko sa presunie do najnižšieho bitu.
  let v = hodnota < 0 ? ~(hodnota << 1) : hodnota << 1;
  let out = "";
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return out + String.fromCharCode(v + 63);
}

export function zakoduj(body: Bod[], presnost = 5): string {
  const faktor = 10 ** presnost;
  let out = "";
  let predLat = 0;
  let predLng = 0;
  for (const b of body) {
    if (!Number.isFinite(b?.lat) || !Number.isFinite(b?.lng)) continue;
    const lat = Math.round(b.lat * faktor);
    const lng = Math.round(b.lng * faktor);
    out += cislo(lat - predLat) + cislo(lng - predLng);
    predLat = lat;
    predLng = lng;
  }
  return out;
}

export function dekoduj(zakodovana: string | null | undefined, presnost = 5): Bod[] {
  if (!zakodovana) return [];
  const faktor = 10 ** presnost;
  const body: Bod[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;

  while (i < zakodovana.length) {
    let posun = 0;
    let vysledok = 0;
    let znak = 0;
    do {
      znak = zakodovana.charCodeAt(i++) - 63;
      vysledok |= (znak & 0x1f) << posun;
      posun += 5;
    } while (znak >= 0x20 && i < zakodovana.length);
    lat += vysledok & 1 ? ~(vysledok >> 1) : vysledok >> 1;

    posun = 0;
    vysledok = 0;
    do {
      znak = zakodovana.charCodeAt(i++) - 63;
      vysledok |= (znak & 0x1f) << posun;
      posun += 5;
    } while (znak >= 0x20 && i < zakodovana.length);
    lng += vysledok & 1 ? ~(vysledok >> 1) : vysledok >> 1;

    body.push({ lat: lat / faktor, lng: lng / faktor });
  }
  return body;
}

/**
 * Preriedi trasu na najviac `MAX_BODOV`. Prvý a posledný bod ostávajú vždy —
 * bez nich by trasa na mape začínala a končila inde, než jazda.
 */
export function prerieduj(body: Bod[], max = MAX_BODOV): Bod[] {
  if (body.length <= max) return body;
  const krok = Math.ceil(body.length / max);
  const out = body.filter((_, i) => i % krok === 0);
  const posledny = body[body.length - 1]!;
  if (out[out.length - 1] !== posledny) out.push(posledny);
  return out;
}

/**
 * Trasa pripravená na zápis do `trips.route`. Jazda bez použiteľnej trasy
 * vráti `null` — do stĺpca nemá čo písať prázdny reťazec.
 */
export function trasaDoPolyline(body: Bod[] | null | undefined): string | null {
  if (!body || body.length < 2) return null;
  const zakodovana = zakoduj(prerieduj(body));
  return zakodovana || null;
}
