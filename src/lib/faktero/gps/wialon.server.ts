/**
 * Wialon (Gurtam) — adaptér GPS cez Remote API (`/wialon/ajax.html?svc=…&params=…&sid=…`).
 *
 * Dokumentácia: https://help.wialon.com/en/api/user-guide/introduction
 *  - token/login (params {token, fl}) → `eid` = sid relácie:
 *    https://help.wialon.com/en/api/user-guide/api-reference/token/login
 *    Chyby 4 zlá dĺžka tokenu, 7 používateľ zakázaný / bez prístupu, 8 …, 1003 limit.
 *    Relácia bez aktivity vyprší po 5 minútach → prihlasujeme sa pri každom behu a na konci
 *    sa odhlásime (core/logout), nech nevisia relácie.
 *  - core/search_items (itemsType avl_unit) — jednotky = vozidlá:
 *    https://help.wialon.com/en/api/user-guide/api-reference/core/search_items
 *    Formát jednotky (príznaky 0x1 základ, 0x2000 počítadlá `cnm_km`, 0x00800000 profilové polia
 *    `pflds` s menami registration_plate / vin):
 *    https://help.wialon.com/en/api/user-guide/data-format/units
 *  - jazdy: messages/load_interval (načíta správy jednotky do relácie) + unit/get_trips
 *    (msgsSource "1" = načítané správy) → [{from:{i,t,p:{y,x}}, to:{…}, m}] kde m = metre:
 *    https://help.wialon.com/en/api/user-guide/api-reference/messages/load_interval
 *    https://help.wialon.com/en/api/user-guide/api-reference/unit/get_trips
 *    Zvolené namiesto report/exec_report, lebo zostava potrebuje šablónu v zdroji zákazníka.
 *    Na konci messages/unload uvoľní správy z relácie. Časy sú UNIX sekundy (UTC).
 *
 * Čo Wialon cez tento postup nevie / nerobíme:
 *  - Vodič: väzby vodičov sú v zdrojoch (avl_resource) a jazda ho nenesie → `vodic: null`.
 *  - Adresy: get_trips dáva len súradnice; adresy dopĺňa spoločná vrstva cez ORS.
 *  - Tachometer na jazdu ani spotrebu get_trips nevracia.
 *  - Tankovania: v Wialone sú len ako výsledok zostavy (report/exec_report so šablónou „Fuel
 *    fillings“, ktorú si zákazník musí založiť) → metóda `tankovania` chýba.
 *  - Súkromná jazda: Wialon má režim súkromnej jazdy len ako príznak správy (0x40000) bez zápisu
 *    späť cez API → `sukromna: null`.
 */
import { GpsChyba, type GpsAdapter, type GpsJazda, type GpsVozidlo } from "./typy";

const PREDVOLENY_HOST = "hst-api.wialon.com";
/** 0x1 základ + 0x2000 počítadlá + 0x00800000 profilové polia. */
const PRIZNAKY_JEDNOTKY = 0x1 | 0x2000 | 0x00800000;

type Relacia = { url: string; sid: string };

type WialonJednotka = {
  id: number;
  nm?: string;
  cls?: number;
  mu?: number;
  cnm?: number;
  cnm_km?: number;
  pflds?: Record<string, { id: number; n: string; v: string }>;
};

type WialonBod = { i: number; t: number; p: { y: number; x: number } };
type WialonTrip = { from: WialonBod; to: WialonBod; m: number };

/** „hst-api.wialon.com“, „https://moj.wialon.sk/“ aj „…/wialon/ajax.html“ → URL ajax.html. */
export function ajaxUrl(host: string | undefined): string {
  let h = (host ?? "").trim() || PREDVOLENY_HOST;
  if (!/^https?:\/\//i.test(h)) h = `https://${h}`;
  h = h.replace(/\/+$/, "").replace(/\/wialon\/ajax\.html$/i, "");
  return `${h}/wialon/ajax.html`;
}

function chybaZWialonu(kod: number, svc: string): GpsChyba {
  if (kod === 1) return new GpsChyba("prihlasenie", "Wialon: relácia vypršala, skúste znova.");
  if (kod === 1003 || kod === 1004) {
    return new GpsChyba("limit", "Wialon: prekročený limit súbežných volaní, skúste to o chvíľu.");
  }
  if (svc === "token/login" && [4, 7, 8].includes(kod)) {
    return new GpsChyba(
      "prihlasenie",
      "Wialon odmietol token — skontrolujte, či je platný a nie je zakázaný.",
    );
  }
  if (kod === 7) {
    return new GpsChyba(
      "prihlasenie",
      "Token nemá právo „Request reports and messages“ na jednotku — doplňte ho vo Wialone.",
    );
  }
  return new GpsChyba("api", `Wialon vrátil chybu ${kod} (${svc}).`);
}

async function volaj<T>(
  url: string,
  svc: string,
  params: Record<string, unknown>,
  sid?: string,
): Promise<T> {
  const telo = new URLSearchParams({ svc, params: JSON.stringify(params) });
  if (sid) telo.set("sid", sid);
  let odp: Response;
  try {
    odp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: telo.toString(),
    });
  } catch {
    throw new GpsChyba("siet", "Server Wialon je nedostupný — skontrolujte adresu hostingu.");
  }
  if (!odp.ok) throw new GpsChyba("api", `Wialon odpovedal stavom ${odp.status}.`);
  let r: unknown;
  try {
    r = await odp.json();
  } catch {
    throw new GpsChyba("api", "Wialon vrátil nečitateľnú odpoveď — je adresa hostingu správna?");
  }
  if (r && typeof r === "object" && !Array.isArray(r) && "error" in r) {
    const kod = Number((r as { error: unknown }).error);
    if (kod !== 0) throw chybaZWialonu(kod, svc);
  }
  return r as T;
}

async function prihlas(p: Record<string, string>): Promise<Relacia> {
  const token = (p.token ?? "").trim();
  if (!token) throw new GpsChyba("prihlasenie", "Zadajte token z Wialonu.");
  const url = ajaxUrl(p.url);
  const r = await volaj<{ eid?: string }>(url, "token/login", { token, fl: 1 });
  if (!r?.eid) throw new GpsChyba("prihlasenie", "Wialon nevrátil reláciu.");
  return { url, sid: r.eid };
}

async function odhlas(rel: Relacia) {
  try {
    await volaj(rel.url, "core/logout", {}, rel.sid);
  } catch {
    // relácia aj tak po 5 minútach vyprší
  }
}

async function sRelaciou<T>(p: Record<string, string>, prace: (r: Relacia) => Promise<T>) {
  const rel = await prihlas(p);
  try {
    return await prace(rel);
  } finally {
    await odhlas(rel);
  }
}

async function jednotky(rel: Relacia): Promise<WialonJednotka[]> {
  const r = await volaj<{ items?: WialonJednotka[] }>(
    rel.url,
    "core/search_items",
    {
      spec: {
        itemsType: "avl_unit",
        propName: "sys_name",
        propValueMask: "*",
        sortType: "sys_name",
      },
      force: 1,
      flags: PRIZNAKY_JEDNOTKY,
      from: 0,
      to: 0,
    },
    rel.sid,
  );
  return r.items ?? [];
}

function profilovePole(j: WialonJednotka, meno: string): string | null {
  for (const f of Object.values(j.pflds ?? {})) {
    if (f?.n === meno && f.v?.trim()) return f.v.trim();
  }
  return null;
}

export function prevedJednotku(j: WialonJednotka): GpsVozidlo {
  const km = j.cnm_km ?? (j.mu === 0 || j.mu === undefined ? j.cnm : undefined);
  return {
    externeId: String(j.id),
    spz: profilovePole(j, "registration_plate"),
    nazov: j.nm?.trim() || null,
    vin: profilovePole(j, "vin"),
    tachometerKm: km && km > 0 ? km : null,
  };
}

export function prevedJazdy(jednotka: string, trips: WialonTrip[]): GpsJazda[] {
  return trips
    .filter((t) => t?.from && t?.to && t.to.t > t.from.t)
    .map((t) => ({
      externeId: `${jednotka}-${t.from.t}`,
      vozidloExterneId: jednotka,
      zaciatok: new Date(t.from.t * 1000).toISOString(),
      koniec: new Date(t.to.t * 1000).toISOString(),
      odLat: t.from.p?.y ?? null,
      odLng: t.from.p?.x ?? null,
      doLat: t.to.p?.y ?? null,
      doLng: t.to.p?.x ?? null,
      km: Math.round((t.m ?? 0) / 10) / 100,
      vodic: null,
      sukromna: null,
      surove: t,
    }));
}

export const adapter: GpsAdapter = {
  id: "wialon",
  nazov: "Wialon",
  web: "https://wialon.com",
  dokumentacia: "https://help.wialon.com/en/api/user-guide/introduction",
  polia: [
    {
      kluc: "url",
      nazov: "Adresa hostingu",
      typ: "url",
      povinne: false,
      pomoc:
        "Predvolene hst-api.wialon.com (Wialon Hosting); pri Wialon Local adresa vášho servera.",
    },
    {
      kluc: "token",
      nazov: "Token",
      typ: "heslo",
      povinne: true,
      pomoc: "Token vytvorený pre aplikáciu (72 znakov) s právom čítať jednotky, zostavy a správy.",
    },
  ],

  async test(p) {
    await sRelaciou(p, async (rel) => {
      await jednotky(rel);
    });
  },

  async vozidla(p) {
    return sRelaciou(p, async (rel) => (await jednotky(rel)).map(prevedJednotku));
  },

  async jazdy(p, od, do_, vozidla) {
    return sRelaciou(p, async (rel) => {
      const ids = vozidla?.length ? vozidla : (await jednotky(rel)).map((j) => String(j.id));
      const timeFrom = Math.floor(od.getTime() / 1000);
      const timeTo = Math.floor(do_.getTime() / 1000);
      const vysledok: GpsJazda[] = [];
      try {
        for (const id of ids) {
          const itemId = Number(id);
          if (!Number.isFinite(itemId)) continue;
          // správy sa načítajú do relácie; vrátiť ich netreba (loadCount 0)
          await volaj(
            rel.url,
            "messages/load_interval",
            { itemId, timeFrom, timeTo, flags: 0, flagsMask: 0xff00, loadCount: 0 },
            rel.sid,
          );
          const trips = await volaj<WialonTrip[]>(
            rel.url,
            "unit/get_trips",
            { itemId, timeFrom, timeTo, msgsSource: "1" },
            rel.sid,
          );
          vysledok.push(...prevedJazdy(id, Array.isArray(trips) ? trips : []));
        }
      } finally {
        await volaj(rel.url, "messages/unload", {}, rel.sid).catch(() => undefined);
      }
      return vysledok;
    });
  },
};
