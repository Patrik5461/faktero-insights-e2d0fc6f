/**
 * Trasa ako obrázok do tlače.
 *
 * Do PDF sa živá mapa dostať nedá — tlačí sa to, čo je na stránke, takže
 * trasu treba vykresliť do plátna a vložiť ako obrázok. Dlaždice sú tie isté
 * z OpenStreetMap ako v mape na obrazovke; posiela ich s hlavičkou
 * `Access-Control-Allow-Origin`, takže plátno ostane čitateľné a dá sa z neho
 * spraviť obrázok.
 *
 * Keď sa dlaždice nestiahnu (bez internetu, pomalá sieť), obrázok aj tak
 * vznikne — len bez podkladu. Prázdne miesto v knihe jázd je horšie než holý
 * tvar trasy.
 */
export type Bod = { lat: number; lng: number };

const VELKOST_DLAZDICE = 256;
const MAX_ZOOM = 17;
/** Ako dlho sa čaká na jednu dlaždicu, kým sa vykreslí bez podkladu. */
const CAKANIE_MS = 6000;

/** Web Mercator: zemepisné súradnice na pixely sveta pri danom priblížení. */
export function naPixely(bod: Bod, zoom: number): { x: number; y: number } {
  const meritko = VELKOST_DLAZDICE * 2 ** zoom;
  const x = ((bod.lng + 180) / 360) * meritko;
  const sin = Math.sin((bod.lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * meritko;
  return { x, y };
}

export function ohranicenie(body: Bod[]): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} {
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  for (const b of body) {
    if (b.lat < minLat) minLat = b.lat;
    if (b.lat > maxLat) maxLat = b.lat;
    if (b.lng < minLng) minLng = b.lng;
    if (b.lng > maxLng) maxLng = b.lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Najväčšie priblíženie, pri ktorom sa celá trasa ešte zmestí do obrázka.
 * Bez okraja by koncové značky sedeli presne na hrane.
 */
export function vyberZoom(body: Bod[], sirka: number, vyska: number, okraj = 28): number {
  if (body.length < 2) return MAX_ZOOM;
  const { minLat, maxLat, minLng, maxLng } = ohranicenie(body);
  const dostupnaSirka = Math.max(32, sirka - 2 * okraj);
  const dostupnaVyska = Math.max(32, vyska - 2 * okraj);

  for (let z = MAX_ZOOM; z > 0; z--) {
    const a = naPixely({ lat: maxLat, lng: minLng }, z);
    const b = naPixely({ lat: minLat, lng: maxLng }, z);
    if (Math.abs(b.x - a.x) <= dostupnaSirka && Math.abs(b.y - a.y) <= dostupnaVyska) return z;
  }
  return 1;
}

function nacitajDlazdicu(url: string): Promise<HTMLImageElement | null> {
  return new Promise((hotovo) => {
    const img = new Image();
    // Bez tohto by plátno ostalo „zašpinené" a obrázok sa z neho nedá vytiahnuť.
    img.crossOrigin = "anonymous";
    const cas = setTimeout(() => hotovo(null), CAKANIE_MS);
    img.onload = () => {
      clearTimeout(cas);
      hotovo(img);
    };
    img.onerror = () => {
      clearTimeout(cas);
      hotovo(null);
    };
    img.src = url;
  });
}

/**
 * Trasa vykreslená do obrázka (data URL) pripraveného na vloženie do tlače.
 * Vráti `null`, keď trasa nemá aspoň dva body alebo plátno nie je dostupné.
 */
export async function obrazokTrasy(
  body: Bod[],
  opts: { sirka?: number; vyska?: number } = {},
): Promise<string | null> {
  if (body.length < 2 || typeof document === "undefined") return null;

  const sirka = opts.sirka ?? 640;
  const vyska = opts.vyska ?? 380;
  const platno = document.createElement("canvas");
  platno.width = sirka;
  platno.height = vyska;
  const ctx = platno.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(0, 0, sirka, vyska);

  const zoom = vyberZoom(body, sirka, vyska);
  const { minLat, maxLat, minLng, maxLng } = ohranicenie(body);
  const stred = naPixely({ lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 }, zoom);
  const vlavo = stred.x - sirka / 2;
  const hore = stred.y - vyska / 2;

  const pocetDlazdic = 2 ** zoom;
  const odX = Math.floor(vlavo / VELKOST_DLAZDICE);
  const doX = Math.floor((vlavo + sirka) / VELKOST_DLAZDICE);
  const odY = Math.max(0, Math.floor(hore / VELKOST_DLAZDICE));
  const doY = Math.min(pocetDlazdic - 1, Math.floor((hore + vyska) / VELKOST_DLAZDICE));

  const ulohy: Promise<void>[] = [];
  for (let x = odX; x <= doX; x++) {
    for (let y = odY; y <= doY; y++) {
      // Pri prechode cez 180. poludník sa stĺpec dlaždíc omotá dookola.
      const dlazdicaX = ((x % pocetDlazdic) + pocetDlazdic) % pocetDlazdic;
      const url = `https://tile.openstreetmap.org/${zoom}/${dlazdicaX}/${y}.png`;
      ulohy.push(
        nacitajDlazdicu(url).then((img) => {
          if (img) {
            ctx.drawImage(
              img,
              x * VELKOST_DLAZDICE - vlavo,
              y * VELKOST_DLAZDICE - hore,
              VELKOST_DLAZDICE,
              VELKOST_DLAZDICE,
            );
          }
        }),
      );
    }
  }
  await Promise.all(ulohy);

  const naPlatno = (b: Bod) => {
    const p = naPixely(b, zoom);
    return { x: p.x - vlavo, y: p.y - hore };
  };

  ctx.strokeStyle = "#007e46";
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  body.forEach((b, i) => {
    const p = naPlatno(b);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  const bodka = (b: Bod, farba: string) => {
    const p = naPlatno(b);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = farba;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  };
  bodka(body[0]!, "#16a34a");
  bodka(body[body.length - 1]!, "#dc2626");

  // Uvedenie autora podkladu je podmienkou používania dlaždíc.
  const popis = "© prispievatelia OpenStreetMap";
  ctx.font = "11px system-ui, sans-serif";
  const sirkaPopisu = ctx.measureText(popis).width + 10;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillRect(sirka - sirkaPopisu, vyska - 18, sirkaPopisu, 18);
  ctx.fillStyle = "#334155";
  ctx.fillText(popis, sirka - sirkaPopisu + 5, vyska - 5);

  return platno.toDataURL("image/jpeg", 0.82);
}
