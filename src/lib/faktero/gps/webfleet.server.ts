/**
 * Webfleet (WEBFLEET.connect) — adaptér GPS.
 *
 * Dokumentácia: https://www.webfleet.com/en_ie/fleet-management/integration/resources/
 * Príručka: WEBFLEET.connect Reference Guide 1.57.0
 *   https://media.webfleet.com/fl_attachment/media/doc/documentations/webfleet.connect-doc-1.57.0
 *
 * Ako API funguje (podľa príručky):
 * - jediná adresa `https://csv.webfleet.com/extern`, všetko je GET s parametrami v URL;
 *   prihlásenie je `account` + `username` + `password` + `apikey` priamo v adrese
 *   (príručka výslovne zakazuje HTTP Basic). Adresa preto nikdy nesmie ísť do logu ani do chyby.
 * - `outputformat=json` vráti pole plochých objektov, prázdny výsledok je `[]`
 *   (v CSV by to bola chyba „63, document is empty“).
 * - `useISO8601=true` — dátumy v parametroch aj vo výsledku sú ISO 8601, výsledok v UTC.
 * - chyba prichádza v hlavičkách `X-Webfleet-Errorcode` / `X-Webfleet-Errormessage`
 *   a v tele ako text „id, popis“.
 * - limity sú na akciu: showTripReportExtern 1 / min, showObjectReportExtern 6 / min,
 *   showVehicleReportExtern, showLogbook, updateLogbook 10 / min. Preto sa volania
 *   radia za sebou (nikdy paralelne) a medzi dvoma volaniami tej istej akcie sa čaká.
 *
 * Čo adaptér robí:
 * - vozidlá: `showVehicleReportExtern` (objekty typu vozidlo s `licenseplatenumber`
 *   a VIN v `identnumber`); kľúčom je `objectuid`, lebo `objectno` si zákazník môže zmeniť.
 * - jazdy: `showTripReportExtern` s `range_pattern=ud`; filter platí na koniec jazdy.
 *   Bez `objectno` smie byť obdobie najviac mesiac, preto sa dlhšie obdobie delí na okná
 *   po 31 dní. `tripmode` 1 = súkromná, 2 = služobná, 3 = cesta do práce (berieme ako
 *   služobnú — zamestnávateľ ju v knihe jázd vedie ako pracovnú), 0/4 = nevedno.
 * - súkromná jazda späť: `updateLogbook` s `logflag` 1/2 (funguje len na účtoch
 *   s knihou jázd — inak Webfleet vráti chybu, ktorú prepošleme ako ľudskú hlášku).
 *
 * Čo API nevie:
 * - tankovania: WEBFLEET.connect nemá zoznam tankovaní. Natankovanie je len udalosť
 *   v správovej fronte (`popQueueMessagesExtern`, typ 80000822 „Refuelled vehicle“)
 *   s hladinou nádrže v promile, bez litrov aj ceny; fronta sa navyše po prečítaní
 *   potvrdzuje a maže, takže by kolidovala s inými aplikáciami zákazníka. Metóda chýba zámerne.
 * - účel jazdy (`logpurpose`) vracia len `showLogbook`, a to po jednom vozidle; pri limite
 *   10 / min by to synchronizáciu neúmerne predĺžilo, preto `ucel` ostáva prázdny.
 */
import { GpsChyba, type GpsAdapter, type GpsJazda, type GpsVozidlo } from "./typy";

const BASE = "https://csv.webfleet.com/extern";

/** Najmenší odstup medzi dvoma volaniami tej istej akcie (ms), s rezervou 10 %. */
const ODSTUP_AKCIE: Record<string, number> = {
  showTripReportExtern: 66_000,
  showObjectReportExtern: 11_000,
};
const ODSTUP_PREDVOLENY = 6_600; // 10 / min

/** Dlhšie, než toto, sa na limit nečaká — synchronizácia skončí chybou „limit“ a skúsi sa neskôr. */
let maxCakanieMs = 20_000;

/** Webfleet prijíma najviac mesiac bez `objectno`; 31 dní je bezpečne pod tým. */
const OKNO_DNI = 31;

// ---------------------------------------------------------------------------
// Fronta volaní: jeden účet = jedna rada, každá akcia si pamätá posledné volanie.
// ---------------------------------------------------------------------------

const rady = new Map<string, Promise<unknown>>();
const posledne = new Map<string, number>();

let hodiny = {
  teraz: () => Date.now(),
  cakaj: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
};

/** Len pre testy: náhradné hodiny, strop čakania a vyčistenie pamäte limitov. */
export function _nastavPreTest(n: {
  teraz?: () => number;
  cakaj?: (ms: number) => Promise<void>;
  maxCakanieMs?: number;
}) {
  hodiny = { teraz: n.teraz ?? hodiny.teraz, cakaj: n.cakaj ?? hodiny.cakaj };
  if (n.maxCakanieMs != null) maxCakanieMs = n.maxCakanieMs;
  rady.clear();
  posledne.clear();
}

function kluceUctu(p: Record<string, string>) {
  return `${(p.account ?? "").trim().toLowerCase()}|${(p.username ?? "").trim().toLowerCase()}`;
}

/** Zaradí volanie do rady účtu; pred ním počká, kým akcia smie znova. */
function doRady<T>(p: Record<string, string>, akcia: string, fn: () => Promise<T>): Promise<T> {
  const ucet = kluceUctu(p);
  const predchadzajuce = rady.get(ucet) ?? Promise.resolve();
  const moje = predchadzajuce
    .catch(() => undefined)
    .then(async () => {
      const kluc = `${ucet}|${akcia}`;
      const odstup = ODSTUP_AKCIE[akcia] ?? ODSTUP_PREDVOLENY;
      const naposledy = posledne.get(kluc);
      if (naposledy != null) {
        const cakat = naposledy + odstup - hodiny.teraz();
        if (cakat > maxCakanieMs) {
          throw new GpsChyba(
            "limit",
            `Webfleet dovoľuje túto požiadavku len raz za ${Math.round(odstup / 1000)} s. Skúste to o chvíľu znova.`,
          );
        }
        if (cakat > 0) await hodiny.cakaj(cakat);
      }
      posledne.set(kluc, hodiny.teraz());
      return fn();
    });
  rady.set(ucet, moje);
  return moje;
}

// ---------------------------------------------------------------------------
// Volanie API
// ---------------------------------------------------------------------------

function prihlasenie(p: Record<string, string>) {
  const account = (p.account ?? "").trim();
  const username = (p.username ?? "").trim();
  const password = p.password ?? "";
  const apikey = (p.apikey ?? "").trim();
  if (!account || !username || !password || !apikey) {
    throw new GpsChyba("prihlasenie", "Vyplňte účet, používateľa, heslo aj API kľúč Webfleet.");
  }
  return { account, username, password, apikey };
}

/** Chybové kódy z kapitoly „Response codes“ → ľudská hláška. */
export function chybaZKodu(kod: number, popis: string): GpsChyba | null {
  if (kod === 0 || kod === 63) return null; // úspech / prázdny výsledok
  if ([1101, 1105, 1106, 1112, 1140, 4107].includes(kod))
    return new GpsChyba(
      "prihlasenie",
      "Webfleet neprijal prihlásenie — skontrolujte účet, používateľa a heslo.",
    );
  if (kod === 1143)
    return new GpsChyba(
      "prihlasenie",
      "Webfleet neprijal API kľúč — skontrolujte ho v My Account → API keys.",
    );
  if (kod === 1146)
    return new GpsChyba(
      "prihlasenie",
      "Heslo používateľa vo Webfleete vypršalo — zmeňte ho a uložte nové.",
    );
  if (kod === 1130 || kod === 1132)
    return new GpsChyba("prihlasenie", "Účet Webfleet je zablokovaný alebo už neplatí.");
  if (kod === 8014 || kod === 45)
    return new GpsChyba(
      "prihlasenie",
      "Používateľ nemá vo Webfleete právo WEBFLEET.connect — pridajte mu ho v nastaveniach používateľa.",
    );
  if (kod === 8011)
    return new GpsChyba(
      "limit",
      "Webfleet hlási prekročený limit požiadaviek. Skúste to o chvíľu znova.",
    );
  const text = popis.trim().slice(0, 200);
  return new GpsChyba("api", `Webfleet vrátil chybu ${kod}${text ? `: ${text}` : ""}.`);
}

/** Text chyby „id, popis“ (CSV) alebo JSON s errorCode → [kód, popis]. */
export function rozoberChybu(telo: string): [number, string] | null {
  const t = telo.trim();
  const m = /^(\d+)\s*,\s*([\s\S]*)$/.exec(t);
  if (m) return [Number(m[1]), m[2]];
  try {
    const j = JSON.parse(t);
    if (j && !Array.isArray(j) && typeof j === "object" && j.errorCode != null)
      return [Number(j.errorCode), String(j.errorMsg ?? j.errorMessage ?? "")];
  } catch {
    /* nie je JSON */
  }
  return null;
}

async function volaj(
  p: Record<string, string>,
  akcia: string,
  parametre: Record<string, string> = {},
): Promise<Record<string, unknown>[]> {
  const pr = prihlasenie(p);
  return doRady(p, akcia, async () => {
    const q = new URLSearchParams({
      lang: "en",
      account: pr.account,
      username: pr.username,
      password: pr.password,
      apikey: pr.apikey,
      action: akcia,
      outputformat: "json",
      useISO8601: "true",
      useUTF8: "true",
      ...parametre,
    });
    let res: Response;
    try {
      res = await fetch(`${BASE}?${q.toString()}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      // Chyba fetch-u môže niesť URL s heslom — preto vlastná hláška bez detailov.
      throw new GpsChyba("siet", "Webfleet neodpovedá. Skúste to neskôr.");
    }
    const telo = await res.text();
    const kodHlavicka = res.headers.get("x-webfleet-errorcode");
    if (kodHlavicka) {
      const ch = chybaZKodu(Number(kodHlavicka), res.headers.get("x-webfleet-errormessage") ?? "");
      if (ch) throw ch;
      return [];
    }
    if (res.status === 429) throw chybaZKodu(8011, "")!;
    if (res.status === 401 || res.status === 403) throw chybaZKodu(1106, "")!;
    if (!res.ok) throw new GpsChyba("api", `Webfleet vrátil HTTP ${res.status}.`);
    const prazdne = telo.trim();
    if (!prazdne) return [];
    let data: unknown;
    try {
      data = JSON.parse(prazdne);
    } catch {
      const ch = rozoberChybu(prazdne);
      if (ch) {
        const e = chybaZKodu(ch[0], ch[1]);
        if (e) throw e;
        return [];
      }
      throw new GpsChyba("api", "Webfleet vrátil odpoveď, ktorej nerozumieme.");
    }
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    const ch = rozoberChybu(prazdne);
    if (ch) {
      const e = chybaZKodu(ch[0], ch[1]);
      if (e) throw e;
      return [];
    }
    throw new GpsChyba("api", "Webfleet vrátil odpoveď, ktorej nerozumieme.");
  });
}

// ---------------------------------------------------------------------------
// Prevody
// ---------------------------------------------------------------------------

function text(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function cislo(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Mikrostupne (10^-6°) → stupne. */
function mikrostupne(v: unknown): number | null {
  const n = cislo(v);
  return n == null || n === 0 ? null : n / 1_000_000;
}

/** `tripmode` / `logflag` → súkromná? */
export function jeSukromna(tripmode: unknown): boolean | null {
  const n = cislo(tripmode);
  if (n === 1) return true;
  if (n === 2 || n === 3) return false;
  return null;
}

/**
 * Tachometer na začiatku a konci jazdy v km.
 * Príručka pri `start_odometer` jednotku neuvádza (inde je tachometer v 100 m, v zázname
 * jazdy je `distance` „rozdiel tachometrov v metroch“). Jednotku preto určí rozdiel:
 * sedí na `distance` → metre, sedí na `distance / 100` → stovky metrov.
 */
export function tachometreKm(
  start: unknown,
  koniec: unknown,
  vzdialenostM: number,
): [number | null, number | null] {
  const s = cislo(start);
  const k = cislo(koniec);
  if (s == null || k == null) return [null, null];
  const rozdiel = k - s;
  let delitel = 1000; // metre
  if (vzdialenostM > 0 && Math.abs(rozdiel * 100 - vzdialenostM) < Math.abs(rozdiel - vzdialenostM))
    delitel = 10; // stovky metrov
  const zaokruhli = (x: number) => Math.round((x / delitel) * 10) / 10;
  return [zaokruhli(s), zaokruhli(k)];
}

export function naVozidlo(r: Record<string, unknown>): GpsVozidlo | null {
  const id = text(r.objectuid) ?? text(r.objectno);
  if (!id) return null;
  return {
    externeId: id,
    spz: text(r.licenseplatenumber),
    nazov: text(r.objectname) ?? text(r.objectno),
    vin: text(r.identnumber),
    tachometerKm: null,
  };
}

export function naJazdu(r: Record<string, unknown>): GpsJazda | null {
  const id = text(r.tripid);
  const vozidlo = text(r.objectuid) ?? text(r.objectno);
  const zaciatok = text(r.start_time);
  const koniec = text(r.end_time);
  if (!id || !vozidlo || !zaciatok || !koniec) return null;
  const m = cislo(r.distance) ?? 0;
  const [tachZ, tachK] = tachometreKm(r.start_odometer, r.end_odometer, m);
  const zIso = new Date(zaciatok);
  const kIso = new Date(koniec);
  if (Number.isNaN(zIso.getTime()) || Number.isNaN(kIso.getTime())) return null;
  return {
    externeId: id,
    vozidloExterneId: vozidlo,
    zaciatok: zIso.toISOString(),
    koniec: kIso.toISOString(),
    odAdresa: text(r.start_postext),
    doAdresa: text(r.end_postext),
    odLat: mikrostupne(r.start_latitude),
    odLng: mikrostupne(r.start_longitude),
    doLat: mikrostupne(r.end_latitude),
    doLng: mikrostupne(r.end_longitude),
    km: Math.round((m / 1000) * 100) / 100,
    tachometerZaciatok: tachZ,
    tachometerKoniec: tachK,
    vodic: text(r.drivername) ?? text(r.driverno),
    sukromna: jeSukromna(r.tripmode),
    ucel: null,
    spotrebaL: cislo(r.fuel_usage),
    surove: r,
  };
}

/** Rozdelí obdobie na okná po najviac `dni` dňoch. */
export function oknaObdobia(od: Date, do_: Date, dni = OKNO_DNI): [Date, Date][] {
  const okna: [Date, Date][] = [];
  const krok = dni * 86_400_000;
  let z = od.getTime();
  const k = do_.getTime();
  while (z < k) {
    const kon = Math.min(z + krok, k);
    okna.push([new Date(z), new Date(kon)]);
    z = kon;
  }
  return okna;
}

/** ISO bez milisekúnd, v UTC — tvar, ktorý príručka uvádza pri `useISO8601`. */
function iso(d: Date) {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ---------------------------------------------------------------------------
// Adaptér
// ---------------------------------------------------------------------------

export const adapter: GpsAdapter = {
  id: "webfleet",
  nazov: "Webfleet",
  web: "https://www.webfleet.com",
  dokumentacia: "https://www.webfleet.com/en_ie/fleet-management/integration/resources/",
  polia: [
    { kluc: "account", nazov: "Účet (account)", typ: "text", povinne: true },
    {
      kluc: "username",
      nazov: "Používateľ",
      typ: "text",
      povinne: true,
      pomoc: "Používateľ musí mať vo Webfleete právo WEBFLEET.connect.",
    },
    { kluc: "password", nazov: "Heslo", typ: "heslo", povinne: true },
    {
      kluc: "apikey",
      nazov: "API kľúč",
      typ: "heslo",
      povinne: true,
      pomoc: "Vo Webfleete ho vytvoríte v My Account → API keys.",
    },
  ],

  async test(p) {
    await volaj(p, "showVehicleReportExtern", { columnfilter: "objectno" });
  },

  async vozidla(p) {
    const riadky = await volaj(p, "showVehicleReportExtern");
    return riadky.map(naVozidlo).filter((v): v is GpsVozidlo => v != null);
  },

  async jazdy(p, od, do_, vozidla) {
    const filter = vozidla?.length ? new Set(vozidla) : null;
    const vysledok = new Map<string, GpsJazda>();
    for (const [z, k] of oknaObdobia(od, do_)) {
      const riadky = await volaj(p, "showTripReportExtern", {
        range_pattern: "ud",
        rangefrom_string: iso(z),
        rangeto_string: iso(k),
      });
      for (const r of riadky) {
        const j = naJazdu(r);
        if (!j) continue;
        if (filter && !filter.has(j.vozidloExterneId) && !filter.has(String(r.objectno ?? "")))
          continue;
        vysledok.set(j.externeId, j); // jazda na hranici okien príde dvakrát
      }
    }
    return [...vysledok.values()];
  },

  async oznacSukromnu(p, jazdaExterneId, sukromna) {
    if (!/^\d+$/.test(jazdaExterneId)) throw new GpsChyba("api", "Jazda nepochádza z Webfleetu.");
    await volaj(p, "updateLogbook", { tripid: jazdaExterneId, logflag: sukromna ? "1" : "2" });
  },
};
