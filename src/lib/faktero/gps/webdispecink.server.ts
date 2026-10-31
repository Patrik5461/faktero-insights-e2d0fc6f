/**
 * Webdispečink (Eurowag / PRINCIP a.s.) — SOAP API 2.0.
 *
 * Dokumentácia: https://developers.webdispecink.cz/guides/api-version-2-0
 * WSDL:         https://api.webdispecink.cz/code/WebDispecinkServiceNet.php?wsdl
 * Cenník:       https://developers.webdispecink.cz/pricing — Free 60 000 volaní/mesiac,
 *               Basic 600 000 (200 €), Full 1 200 000 (400 €). Pri zneužívaní vracia „Access blocked“.
 * Licencia:     https://developers.webdispecink.cz/down/Licencni_ujednani_k_API_v1.pdf
 *
 * Väzba vo WSDL je `style="rpc"` + `use="literal"`, SOAP 1.1, menný priestor
 * `urn://api.webdispecink.cz/webdisser_02`. Každá metóda berie na začiatku
 * `kodf` (kód firmy), `username` a `pass` — heslo sa dá nahradiť tokenom
 * používateľa (popis `_login`). Relácia neexistuje, údaje idú v každom volaní.
 *
 * Obálku skladáme ručne a odpoveď čítame cez fast-xml-parser — bez SOAP knižnice.
 *
 * Návratové kódy zapisovacích metód (napr. `_delCarCosts`): 1 = úspech,
 * 0 = prihlásenie zlyhalo, záporné = iná chyba (-1 bez práva, -3 zamknutá kniha jázd).
 * `_login` aj `_updateBookPrivate` vracajú `int` bez popisu, čítame ich rovnako.
 *
 * Čo adaptér používa:
 * - `_login`            → test
 * - `_getCarsList2`     → vozidlá (ŠPZ, stav tachometra) + `_getCarInfo` (značka, model, VIN), ak ho účet smie
 * - `_getCarLogBook4`   → kniha jázd (najnovšia verzia, okno najviac 60 dní, vstup v miestnom čase, výstup v GMT)
 * - `_updateBookPrivate`→ zápis súkromná/služobná späť
 * - `_getCarCosts`      → tankovania (náklady s `IsFuel` 1/2; elektrina v kWh sa vynecháva)
 * - `_getFuelCards`     → palivové karty (mimo rozhrania GpsAdapter, PIN sa zahadzuje)
 * `_getFuelStatus` vracia len stav nádrže v čase (sonda), nie tankovania — preto sa nepoužíva.
 */
import { XMLParser } from "fast-xml-parser";
import {
  GpsChyba,
  type GpsAdapter,
  type GpsJazda,
  type GpsTankovanie,
  type GpsVozidlo,
} from "./typy";

export const WD_URL = "https://api.webdispecink.cz/code/WebDispecinkServiceNet.php";
export const WD_NS = "urn://api.webdispecink.cz/webdisser_02";
/** Webdispečink beží v českom/slovenskom čase; vstupy kníh jázd a nákladov sú v miestnom čase. */
const ZONA = "Europe/Prague";
/** `_getCarLogBook4`: „maximum 60 days“ na jedno volanie. */
const MAX_OKNO_MS = 60 * 24 * 3600 * 1000 - 1000;
const TIMEOUT_MS = 20_000;
/** Koľko vozidiel sa pýta naraz — šetrí čas behu, nie limit volaní. */
const SUBEZNE = 3;

type Parametre = Array<[string, string | number]>;

// ───────────────────────────── SOAP ─────────────────────────────

function xmlText(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Obálka SOAP 1.1 pre rpc/literal: parametre sú nekvalifikované prvky pod `ns1:<metóda>`. */
export function soapObalka(metoda: string, parametre: Parametre): string {
  const telo = parametre.map(([k, v]) => `<${k}>${xmlText(String(v))}</${k}>`).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="${WD_NS}">` +
    `<SOAP-ENV:Body><ns1:${metoda}>${telo}</ns1:${metoda}></SOAP-ENV:Body></SOAP-ENV:Envelope>`
  );
}

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  // Hodnoty nechávame ako text: ID jázd sú `long` a ŠPZ môžu vyzerať ako čísla.
  parseTagValue: false,
  trimValues: true,
  isArray: (meno) => meno === "item",
});

/** Hláška chyby nesmie niesť heslo ani token, ani keby ho server zopakoval. */
function bezTajomstiev(text: string, p: Record<string, string>): string {
  let t = text;
  for (const k of ["heslo", "kodf", "meno"]) {
    const v = p[k];
    if (v && v.length >= 3) t = t.split(v).join("••••");
  }
  return t.slice(0, 300);
}

function chybaZFaultu(text: string, p: Record<string, string>): GpsChyba {
  if (/access\s*blocked/i.test(text))
    return new GpsChyba(
      "limit",
      "Webdispečink zablokoval prístup k API (prekročený limit volaní). Treba požiadať prevádzkovateľa o odblokovanie.",
    );
  // Naostro 31. 10. 2026: neexistujúci kód firmy aj firma bez objednaného API vrátia
  // fault „API package is not activated“ — po anglicky by používateľovi nič nepovedal.
  if (/package\s+is\s+not\s+activated|not\s+activated/i.test(text))
    return new GpsChyba(
      "prihlasenie",
      "Webdispečink: pre tento kód firmy nie je aktivovaný balík API. Skontrolujte kód firmy, prípadne si API objednajte u Webdispečinku.",
    );
  if (
    /log(ged)?\s*in|login|password|heslo|přihl|prihl|unauthori[sz]ed|autentiz|authenti/i.test(text)
  )
    return new GpsChyba(
      "prihlasenie",
      "Webdispečink odmietol prihlásenie. Skontrolujte kód firmy, meno a heslo alebo token.",
    );
  return new GpsChyba("api", `Webdispečink vrátil chybu: ${bezTajomstiev(text, p)}`);
}

/**
 * Zavolá metódu a vráti obsah prvku `<return>` (text alebo objekt so zoznamom `item`).
 * Prihlasovacie údaje pridá na začiatok parametrov.
 */
export async function volaj(
  p: Record<string, string>,
  metoda: string,
  parametre: Parametre = [],
): Promise<unknown> {
  const telo = soapObalka(metoda, [
    ["kodf", (p.kodf ?? "").trim()],
    ["username", (p.meno ?? "").trim()],
    ["pass", p.heslo ?? ""],
    ...parametre,
  ]);
  let res: Response;
  try {
    res = await fetch(WD_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${WD_NS}#${metoda}"`,
      },
      body: telo,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    console.error(`[webdispecink] ${metoda} — sieť: ${(e as Error)?.name ?? "chyba"}`);
    throw new GpsChyba("siet", "Webdispečink neodpovedá. Skúste to o chvíľu znova.");
  }
  const text = await res.text().catch(() => "");
  let data: any;
  try {
    data = parser.parse(text);
  } catch {
    data = null;
  }
  const body = data?.Envelope?.Body;
  // SOAP Fault prichádza s HTTP 500 — preto telo čítame pred stavom.
  if (body?.Fault) {
    const f = body.Fault;
    const hlaska = String(f.faultstring ?? f.Reason?.Text ?? f.detail ?? "SOAP Fault");
    console.error(`[webdispecink] ${metoda} -> ${res.status} Fault: ${bezTajomstiev(hlaska, p)}`);
    throw chybaZFaultu(hlaska, p);
  }
  if (!res.ok || !body) {
    console.error(`[webdispecink] ${metoda} -> ${res.status}`);
    if (res.status === 429) throw chybaZFaultu("access blocked", p);
    if (res.status === 401 || res.status === 403) throw chybaZFaultu("unauthorized", p);
    if (/access\s*blocked/i.test(text)) throw chybaZFaultu(text, p);
    throw new GpsChyba(
      res.status >= 500 ? "siet" : "api",
      `Webdispečink odpovedal neočakávane (HTTP ${res.status}).`,
    );
  }
  const odpoved = body[`${metoda}Response`];
  if (odpoved === undefined)
    throw new GpsChyba("api", `Webdispečink nevrátil odpoveď na ${metoda}.`);
  return typeof odpoved === "object" && odpoved !== null ? odpoved.return : undefined;
}

/** Pole `item` z `<return>`; prázdna odpoveď je prázdny zoznam. */
export function polozky(ret: unknown): Record<string, unknown>[] {
  if (ret == null || ret === "") return [];
  if (Array.isArray(ret)) return ret as Record<string, unknown>[];
  if (typeof ret === "object") {
    const it = (ret as any).item;
    if (Array.isArray(it)) return it;
    if (it && typeof it === "object") return [it];
  }
  return [];
}

/** Číselný návratový kód (int) metód typu `_login` / `_update*`. */
function kod(ret: unknown): number {
  const n = Number(typeof ret === "object" && ret !== null ? NaN : ret);
  return Number.isFinite(n) ? n : NaN;
}

// ───────────────────────────── prevody ─────────────────────────────

function cislo(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function text(v: unknown): string | null {
  if (v == null || typeof v === "object") return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** Súradnica 0 znamená „neznáma“ — nie bod v Guinejskom zálive. */
function suradnica(v: unknown): number | null {
  const n = cislo(v);
  return n == null || n === 0 ? null : n;
}

const dvoj = (n: number) => String(n).padStart(2, "0");

/** Posun pásma (ms) v danom okamihu: miestny čas − UTC. */
function posunPasma(ms: number, zona: string): number {
  const casti = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zona,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  const miestne = Date.UTC(
    +casti.year,
    +casti.month - 1,
    +casti.day,
    +casti.hour,
    +casti.minute,
    +casti.second,
  );
  return miestne - Math.floor(ms / 1000) * 1000;
}

/** Date → „dd.mm.YYYY HH:mm:ss“ (alebo bez sekúnd) v miestnom čase Webdispečinku. */
export function miestnyCas(d: Date, sekundy = true): string {
  const m = new Date(d.getTime() + posunPasma(d.getTime(), ZONA));
  const s =
    `${dvoj(m.getUTCDate())}.${dvoj(m.getUTCMonth() + 1)}.${m.getUTCFullYear()} ` +
    `${dvoj(m.getUTCHours())}:${dvoj(m.getUTCMinutes())}`;
  return sekundy ? `${s}:${dvoj(m.getUTCSeconds())}` : s;
}

/**
 * Text dátumu z odpovede → ISO (UTC). Dokumentácia neuvádza formát výstupu,
 * preto berieme „YYYY-MM-DD HH:mm[:ss]“, „dd.mm.YYYY HH:mm[:ss]“ aj ISO s pásmom.
 * `gmt` = text je v GMT (kniha jázd), inak miestny čas (náklady).
 */
export function naIso(v: unknown, gmt: boolean): string | null {
  const s = text(v);
  if (!s) return null;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) && s.includes("T")) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  let r: number[] | null = null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) r = [+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)];
  m = s.match(/^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!r && m) r = [+m[3], +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)];
  if (!r) return null;
  const naivne = Date.UTC(r[0], r[1] - 1, r[2], r[3], r[4], r[5]);
  if (!Number.isFinite(naivne)) return null;
  if (gmt) return new Date(naivne).toISOString();
  // Miestny čas → UTC: dvakrát, aby sedel aj deň prechodu letného času.
  let utc = naivne - posunPasma(naivne, ZONA);
  utc = naivne - posunPasma(utc, ZONA);
  return new Date(utc).toISOString();
}

/** Rozdelí obdobie na okná najviac `max` ms (limit 60 dní na volanie). */
export function okna(od: Date, do_: Date, max = MAX_OKNO_MS): Array<[Date, Date]> {
  const vysledok: Array<[Date, Date]> = [];
  let z = od.getTime();
  const k = do_.getTime();
  while (z < k) {
    const koniec = Math.min(z + max, k);
    vysledok.push([new Date(z), new Date(koniec)]);
    z = koniec;
  }
  return vysledok;
}

async function poDavkach<T, R>(vstup: T[], f: (x: T) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < vstup.length; i += SUBEZNE) {
    const casti = await Promise.all(vstup.slice(i, i + SUBEZNE).map(f));
    for (const c of casti) out.push(...c);
  }
  return out;
}

// ───────────────────────────── mapovanie ─────────────────────────────

/** WDS_LogBook2Item → GpsJazda. Bez `Id_jizda` alebo času sa jazda nedá uložiť idempotentne. */
export function jazdaZPolozky(it: Record<string, unknown>, carid: string): GpsJazda | null {
  const id = text(it.Id_jizda);
  const zaciatok = naIso(it.Dt_from, true);
  const koniec = naIso(it.Dt_to, true) ?? zaciatok;
  if (!id || !zaciatok || !koniec) return null;
  const druh = cislo(it.Druh);
  const tachZ = cislo(it.Tach_start);
  const tachK = cislo(it.Tach_end);
  let km = cislo(it.Vzdalenost);
  if (km == null && tachZ != null && tachK != null && tachK >= tachZ) km = tachK - tachZ;
  const spotreba = cislo(it.Spotreba);
  return {
    externeId: id,
    vozidloExterneId: text(it.Idcar) ?? carid,
    zaciatok,
    koniec,
    odAdresa: text(it.Mistood),
    doAdresa: text(it.Mistodo),
    // Podľa dokumentácie je Ew_* zemepisná šírka a El_* dĺžka.
    odLat: suradnica(it.Ew_start),
    odLng: suradnica(it.El_start),
    doLat: suradnica(it.Ew_end),
    doLng: suradnica(it.El_end),
    km: km ?? 0,
    tachometerZaciatok: tachZ,
    tachometerKoniec: tachK,
    vodic: text(it.Ridic),
    // Druh: 1 = súkromná, 0 = služobná
    sukromna: druh === 1 ? true : druh === 0 ? false : null,
    ucel: text(it.Ucel) ?? text(it.Purpose1),
    spotrebaL: spotreba != null && spotreba > 0 ? spotreba : null,
    surove: it,
  };
}

/**
 * WDS_CarCostsItem → GpsTankovanie. Berieme len palivo (`IsFuel` 1 = palivo, 2 = CNG/druhé palivo);
 * elektrina (3) a jednotky kWh/kg nie sú litre, preto sa vynechávajú.
 */
export function tankovanieZPolozky(
  it: Record<string, unknown>,
  carid: string,
  spz: string | null,
): GpsTankovanie | null {
  const palivo = cislo(it.IsFuel);
  if (palivo !== 1 && palivo !== 2) return null;
  const jednotka = (text(it.Unit) ?? "").toLowerCase();
  if (jednotka === "kwh" || jednotka === "kg") return null;
  const litre = cislo(it.Mnozstvi);
  const cas = naIso(it.Datum, false);
  const id = text(it.IdCost) ?? text(it.ExternalID);
  if (!id || !cas || litre == null || litre <= 0) return null;
  return {
    externeId: id,
    vozidloExterneId: text(it.carid) ?? carid,
    spz,
    cas,
    litre,
    suma: cislo(it.Cenacelkem),
    mena: text(it.Mena),
    palivo: text(it.Typ) ?? text(it.Popis),
    miesto: text(it.Misto) ?? text(it.TankSt),
    tachometerKm: cislo(it.km),
    surove: it,
  };
}

// ───────────────────────────── adaptér ─────────────────────────────

async function zoznamVozidiel(p: Record<string, string>): Promise<GpsVozidlo[]> {
  const auta = polozky(await volaj(p, "_getCarsList2", [["activeOnly", 0]]));
  // Značka, model a VIN sú len v `_getCarInfo` (jedno volanie pre všetky vozidlá).
  // Nie každý účet ho smie volať — bez neho ostane názov prázdny.
  const info = new Map<string, Record<string, unknown>>();
  try {
    for (const it of polozky(
      await volaj(p, "_getCarInfo", [
        ["Value", ""],
        ["Type", "Any"],
      ]),
    )) {
      const id = text(it.IdCar);
      if (id) info.set(id, it);
    }
  } catch (e) {
    if (e instanceof GpsChyba && e.druh === "limit") throw e;
  }
  const out: GpsVozidlo[] = [];
  for (const a of auta) {
    const id = text(a.carid);
    if (!id) continue;
    const i = info.get(id);
    const nazov = [text(i?.TovZn), text(i?.Model)].filter(Boolean).join(" ") || null;
    out.push({
      externeId: id,
      spz: text(a.identifikator),
      nazov,
      vin: text(i?.VerifiedVIN),
      tachometerKm: cislo(a.odometerKm),
    });
  }
  return out;
}

export type WdPalivovaKarta = {
  externeId: string;
  cislo: string | null;
  typ: string | null;
  /** vozidlo = karta patrí autu, vodic = vodičovi */
  priradenie: "vozidlo" | "vodic" | null;
  priradenieId: string | null;
  aktivna: boolean;
  platnostDo: string | null;
  poznamka: string | null;
};

/**
 * Palivové karty firmy (`_getFuelCards`). Admin vidí všetky, bežný používateľ len svoje.
 * PIN, ktorý API vracia, sa zámerne zahadzuje — nesmie sa nikam uložiť.
 */
export async function palivoveKarty(p: Record<string, string>): Promise<WdPalivovaKarta[]> {
  const out: WdPalivovaKarta[] = [];
  for (const it of polozky(await volaj(p, "_getFuelCards"))) {
    const id = text(it.id);
    if (!id) continue;
    const pr = cislo(it.assign);
    out.push({
      externeId: id,
      cislo: text(it.card_number),
      typ: text(it.type),
      priradenie: pr === 1 ? "vozidlo" : pr === 2 ? "vodic" : null,
      priradenieId: text(it.assign_id),
      aktivna: cislo(it.is_inactive) !== 1,
      platnostDo: text(it.expiration_date),
      poznamka: text(it.note),
    });
  }
  return out;
}

export const adapter: GpsAdapter = {
  id: "webdispecink",
  nazov: "Webdispečink",
  web: "https://www.webdispecink.cz",
  dokumentacia: "https://developers.webdispecink.cz/guides/api-version-2-0",
  polia: [
    {
      kluc: "kodf",
      nazov: "Kód firmy",
      typ: "text",
      povinne: true,
      pomoc: "Kód firmy, ktorý zadávate pri prihlásení do Webdispečinku.",
    },
    { kluc: "meno", nazov: "Používateľské meno", typ: "text", povinne: true },
    {
      kluc: "heslo",
      nazov: "Heslo alebo token",
      typ: "heslo",
      povinne: true,
      pomoc:
        "Heslo používateľa alebo jeho API token. Odporúčame samostatného používateľa s právom na knihu jázd a náklady.",
    },
  ],

  async test(p) {
    const r = kod(await volaj(p, "_login"));
    if (r === 1) return;
    if (Number.isFinite(r) && r > 0) return;
    throw new GpsChyba(
      "prihlasenie",
      "Webdispečink odmietol prihlásenie. Skontrolujte kód firmy, meno a heslo alebo token.",
    );
  },

  vozidla: zoznamVozidiel,

  async jazdy(p, od, do_, vozidla) {
    const ids = vozidla?.length ? vozidla : (await zoznamVozidiel(p)).map((v) => v.externeId);
    const intervaly = okna(od, do_);
    const ulohy = ids.flatMap((carid) => intervaly.map((o) => [carid, o] as const));
    const jazdy = await poDavkach(ulohy, async ([carid, [z, k]]) => {
      const ret = await volaj(p, "_getCarLogBook4", [
        ["carid", carid],
        ["casod", miestnyCas(z)],
        ["casdo", miestnyCas(k)],
      ]);
      return polozky(ret)
        .map((it) => jazdaZPolozky(it, carid))
        .filter((j): j is GpsJazda => j != null);
    });
    // Jazda na hranici okien príde dvakrát.
    const videne = new Set<string>();
    return jazdy.filter((j) => (videne.has(j.externeId) ? false : (videne.add(j.externeId), true)));
  },

  async tankovania(p, od, do_) {
    const auta = await zoznamVozidiel(p);
    const intervaly = okna(od, do_);
    const ulohy = auta.flatMap((a) => intervaly.map((o) => [a, o] as const));
    const vysledok = await poDavkach(ulohy, async ([a, [z, k]]) => {
      const ret = await volaj(p, "_getCarCosts", [
        ["carid", a.externeId],
        ["casod", miestnyCas(z, false)],
        ["casdo", miestnyCas(k, false)],
      ]);
      return polozky(ret)
        .map((it) => tankovanieZPolozky(it, a.externeId, a.spz))
        .filter((t): t is GpsTankovanie => t != null);
    });
    const videne = new Set<string>();
    return vysledok.filter((t) =>
      videne.has(t.externeId) ? false : (videne.add(t.externeId), true),
    );
  },

  async oznacSukromnu(p, jazdaExterneId, sukromna) {
    if (!/^\d+$/.test(jazdaExterneId))
      throw new GpsChyba("api", "Neplatné ID jazdy z Webdispečinku.");
    const r = kod(
      await volaj(p, "_updateBookPrivate", [
        ["idjizda", jazdaExterneId],
        ["privateroute", sukromna ? 1 : 0],
      ]),
    );
    if (r === 1) return;
    if (r === 0)
      throw new GpsChyba(
        "prihlasenie",
        "Webdispečink odmietol prihlásenie. Skontrolujte kód firmy, meno a heslo alebo token.",
      );
    if (r === -1)
      throw new GpsChyba("api", "Používateľ vo Webdispečinku nemá právo upravovať knihu jázd.");
    if (r === -3)
      throw new GpsChyba("api", "Kniha jázd je vo Webdispečinku za toto obdobie uzamknutá.");
    throw new GpsChyba(
      "api",
      `Webdispečink zmenu jazdy neprijal (kód ${Number.isFinite(r) ? r : "?"}).`,
    );
  },
};
