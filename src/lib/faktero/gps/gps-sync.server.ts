/**
 * Synchronizácia GPS integrácií (spoločná pre všetkých poskytovateľov).
 *
 * Beh má strop času (25 s — nginx reže po 30 s, pozri pamäť
 * faktero-dlhe-volania-30s): sťahuje po vozidlách a po oknách, kurzor
 * `gps_vozidla_vazby.jazdy_do` si pamätá, kam sa došlo. Čo sa nestihne,
 * dokončí ďalší beh (pripojenie ostane `neuplne`).
 *
 * Jazdy idú do `trips` (external_source = id poskytovateľa, external_id),
 * tankovania do `fuel_records` — oboje idempotentne cez unikátne indexy.
 */
import { supabaseAdmin as admin } from "@/integrations/supabase/client.server";
import { decryptSecret, isDecryptError } from "../payment-crypto.server";
import { adapterPodlaId, ADAPTERY } from "./register";
import { GpsChyba, type GpsAdapter, type GpsJazda, type GpsTankovanie } from "./typy";
import {
  bezTajomstiev,
  jazdaNaTrip,
  normalizujSpz,
  najblizsiaSkupina,
  oknoStahovania,
  tankovanieNaRiadok,
  trebaSynchronizovat,
  type TripRiadok,
  type TankovanieRiadok,
} from "./gps-logika";

// Nové tabuľky ešte nie sú v typoch databázy.
const db = admin as any;

export const CASOVY_STROP_MS = 25_000;

export type Pripojenie = {
  id: string;
  company_id: string;
  poskytovatel: string;
  nazov: string;
  prihlasenie_sifrovane: string;
  aktivne: boolean;
  auto_sync: boolean;
  neuplne: boolean;
  posledna_sync_at: string | null;
  tankovania_do: string | null;
};

export type VysledokSync = {
  vozidla: number;
  noveVozidla: number;
  stiahnute: number;
  importovane: number;
  duplicity: number;
  preskocene: number;
  chyby: number;
  tankovania: number;
  tankovaniaBezVozidla: number;
  nesparovane: number;
  neuplne: boolean;
};

const DECRYPT_SPRAVA =
  "Prihlasovacie údaje treba zadať znova (zmenil sa bezpečnostný kľúč systému).";

export function desifrujPrihlasenie(sifrovane: string): Record<string, string> {
  const obj = JSON.parse(decryptSecret(sifrovane));
  return obj && typeof obj === "object" ? (obj as Record<string, string>) : {};
}

/** Ľudská správa pre používateľa — bez tajomstiev a bez technických detailov. */
export function spravaChyby(
  e: unknown,
  adapter: GpsAdapter | null,
  p: Record<string, string>,
): { sprava: string; stav: "chyba" | "limit" } {
  if (e instanceof GpsChyba) {
    return {
      sprava: adapter ? bezTajomstiev(e.message, p, adapter.polia) : e.message.slice(0, 500),
      stav: e.druh === "limit" ? "limit" : "chyba",
    };
  }
  if (isDecryptError(e)) return { sprava: DECRYPT_SPRAVA, stav: "chyba" };
  return { sprava: "Synchronizácia zlyhala. Skúste to neskôr.", stav: "chyba" };
}

export async function zapisLog(
  pr: { id: string; company_id: string },
  druh: string,
  stav: "ok" | "chyba" | "limit" | "ciastocne",
  sprava: string,
  detail?: unknown,
) {
  try {
    await db.from("gps_sync_logy").insert({
      company_id: pr.company_id,
      pripojenie_id: pr.id,
      druh,
      stav,
      sprava,
      detail: detail ?? null,
    });
  } catch (e: any) {
    console.error("[gps-sync] zápis logu zlyhal", e?.message);
  }
}

/**
 * Stiahne vozidlá od poskytovateľa a založí/aktualizuje väzby. Nové väzby sa
 * spárujú s vozidlom firmy podľa ŠPZ; existujúce párovanie sa nemení.
 */
export async function synchronizujVozidla(
  pr: Pripojenie,
  adapter: GpsAdapter,
  p: Record<string, string>,
): Promise<{ vozidla: number; nove: number }> {
  const zoznam = await adapter.vozidla(p);
  const { data: existujuce } = await db
    .from("gps_vozidla_vazby")
    .select("id, externe_id, vehicle_id")
    .eq("pripojenie_id", pr.id);
  const podlaExt = new Map<string, any>();
  for (const v of existujuce ?? []) podlaExt.set(String(v.externe_id), v);

  const { data: auta } = await admin
    .from("vehicles")
    .select("id, license_plate, vin")
    .eq("company_id", pr.company_id);
  const podlaSpz = new Map<string, string>();
  const podlaVin = new Map<string, string>();
  for (const a of auta ?? []) {
    const s = normalizujSpz(a.license_plate);
    if (s) podlaSpz.set(s, a.id);
    if (a.vin) podlaVin.set(String(a.vin).toUpperCase().trim(), a.id);
  }

  let nove = 0;
  const teraz = new Date().toISOString();
  for (const v of zoznam) {
    const ext = String(v.externeId);
    const e = podlaExt.get(ext);
    if (e) {
      await db
        .from("gps_vozidla_vazby")
        .update({ nazov: v.nazov, spz: v.spz, vin: v.vin ?? null, posledna_sync_at: teraz })
        .eq("id", e.id);
      continue;
    }
    const vehicle_id =
      podlaSpz.get(normalizujSpz(v.spz)) ??
      (v.vin ? podlaVin.get(String(v.vin).toUpperCase().trim()) : undefined) ??
      null;
    const { error } = await db.from("gps_vozidla_vazby").insert({
      company_id: pr.company_id,
      pripojenie_id: pr.id,
      externe_id: ext,
      nazov: v.nazov,
      spz: v.spz,
      vin: v.vin ?? null,
      vehicle_id,
      posledna_sync_at: teraz,
    });
    if (!error) nove++;
  }
  return { vozidla: zoznam.length, nove };
}

function jeDuplicita(sprava: string | null | undefined) {
  const m = (sprava ?? "").toLowerCase();
  return m.includes("duplicate key") || m.includes("_external_unique");
}

/** Zapíše riadky, ktoré ešte v DB nie sú. Vráti počty. */
async function zapisNove<T extends { external_id: string }>(
  tabulka: "trips" | "fuel_records",
  companyId: string,
  zdroj: string,
  riadky: T[],
): Promise<{ nove: number; duplicity: number; chyby: number }> {
  const out = { nove: 0, duplicity: 0, chyby: 0 };
  if (!riadky.length) return out;
  const unikatne = new Map<string, T>();
  for (const r of riadky) unikatne.set(r.external_id, r);
  out.duplicity += riadky.length - unikatne.size;
  const ids = [...unikatne.keys()];
  const existujuce = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db
      .from(tabulka)
      .select("external_id")
      .eq("company_id", companyId)
      .eq("external_source", zdroj)
      .in("external_id", ids.slice(i, i + 200));
    for (const r of data ?? []) existujuce.add(String(r.external_id));
  }
  const nove = [...unikatne.values()].filter((r) => !existujuce.has(r.external_id));
  out.duplicity += unikatne.size - nove.length;
  for (let i = 0; i < nove.length; i += 100) {
    const davka = nove.slice(i, i + 100);
    const { error } = await db.from(tabulka).insert(davka);
    if (!error) {
      out.nove += davka.length;
      continue;
    }
    // Dávku zhodil jeden riadok (uzamknuté obdobie, súbeh) — po jednom.
    for (const r of davka) {
      const { error: e1 } = await db.from(tabulka).insert(r);
      if (!e1) out.nove++;
      else if (jeDuplicita(e1.message)) out.duplicity++;
      else {
        out.chyby++;
        if (out.chyby <= 3)
          console.warn(`[gps-sync] ${tabulka} ${zdroj}/${r.external_id}: ${e1.message}`);
      }
    }
  }
  return out;
}

/**
 * Jedna synchronizácia pripojenia. `koniec` = čas (ms), dokedy smie bežať.
 * Chyby poskytovateľa zapíše do pripojenia a logu, nehádže.
 */
export async function synchronizujPripojenie(
  pripojenieId: string,
  opts: { koniec?: number; druh?: string; vynutVozidla?: boolean } = {},
): Promise<VysledokSync & { chyba?: string }> {
  const koniec = opts.koniec ?? Date.now() + CASOVY_STROP_MS;
  const druh = opts.druh ?? "rucne";
  const v: VysledokSync = {
    vozidla: 0,
    noveVozidla: 0,
    stiahnute: 0,
    importovane: 0,
    duplicity: 0,
    preskocene: 0,
    chyby: 0,
    tankovania: 0,
    tankovaniaBezVozidla: 0,
    nesparovane: 0,
    neuplne: false,
  };

  const { data: pr } = await db
    .from("gps_pripojenia")
    .select(
      "id, company_id, poskytovatel, nazov, prihlasenie_sifrovane, aktivne, auto_sync, neuplne, posledna_sync_at, tankovania_do",
    )
    .eq("id", pripojenieId)
    .maybeSingle();
  if (!pr) throw new Error("Pripojenie neexistuje.");
  const adapter = adapterPodlaId(pr.poskytovatel);
  if (!adapter) {
    const sprava = "Tento poskytovateľ už nie je podporovaný.";
    await zapisLog(pr, druh, "chyba", sprava);
    return { ...v, chyba: sprava };
  }

  let p: Record<string, string> = {};
  try {
    p = desifrujPrihlasenie(pr.prihlasenie_sifrovane);

    // Vozidlá raz denne (alebo na vyžiadanie / pri prvom behu).
    const staraSync =
      !pr.posledna_sync_at || Date.now() - new Date(pr.posledna_sync_at).getTime() > 20 * 3600_000;
    if (opts.vynutVozidla || staraSync) {
      const r = await synchronizujVozidla(pr, adapter, p);
      v.vozidla = r.vozidla;
      v.noveVozidla = r.nove;
    }

    const { data: vazby } = await db
      .from("gps_vozidla_vazby")
      .select("id, externe_id, spz, vehicle_id, jazdy_do")
      .eq("pripojenie_id", pr.id)
      .order("jazdy_do", { ascending: true, nullsFirst: true });
    const sparovane = (vazby ?? []).filter((x: any) => x.vehicle_id);
    v.nesparovane = (vazby ?? []).length - sparovane.length;

    // Jazdy po oknách. Vozidlá s rovnakým kurzorom (pri prvom stiahnutí a po
    // každom úplnom behu sú všetky rovnaké) idú jedným volaním — poskytovatelia
    // s prísnym limitom (Webfleet 1 volanie/min) tak nečakajú na každé auto.
    const teraz = new Date();
    const kurzory = new Map<string, string | null>();
    for (const vz of sparovane) kurzory.set(vz.id, vz.jazdy_do ?? null);
    for (;;) {
      if (Date.now() > koniec - 3000) {
        v.neuplne = true;
        break;
      }
      const skupina = najblizsiaSkupina(
        sparovane.map((vz: any) => ({ id: vz.id, jazdyDo: kurzory.get(vz.id) ?? null })),
        teraz,
      );
      if (!skupina) break;
      // Poskytovateľ, ktorý sa pýta po jednom vozidle, dostane naraz len dávku — veľký
      // vozový park by inak jedným volaním adaptéra prešvihol strop 25 s (nginx 30 s).
      const { okno } = skupina;
      const ids = skupina.ids.slice(0, adapter.vozidielNaVolanie ?? skupina.ids.length);
      const vSkupine = sparovane.filter((vz: any) => ids.includes(vz.id));
      const podlaExt = new Map<string, any>(vSkupine.map((vz: any) => [String(vz.externe_id), vz]));
      const jazdy: GpsJazda[] = await adapter.jazdy(p, okno.od, okno.do_, [...podlaExt.keys()]);
      v.stiahnute += jazdy.length;
      const riadky: TripRiadok[] = [];
      for (const j of jazdy) {
        const vz = podlaExt.get(String(j.vozidloExterneId));
        if (!vz) continue;
        const r = jazdaNaTrip(j, {
          companyId: pr.company_id,
          vehicleId: vz.vehicle_id,
          poskytovatel: adapter.id,
          nazovPoskytovatela: adapter.nazov,
          pripojenieId: pr.id,
          teraz,
        });
        if ("preskoc" in r) v.preskocene++;
        else riadky.push(r.riadok);
      }
      const z = await zapisNove("trips", pr.company_id, adapter.id, riadky);
      v.importovane += z.nove;
      v.duplicity += z.duplicity;
      v.chyby += z.chyby;
      const jazdyDo = okno.do_.toISOString();
      for (const id of ids) kurzory.set(id, jazdyDo);
      await db
        .from("gps_vozidla_vazby")
        .update({ jazdy_do: jazdyDo, posledna_sync_at: new Date().toISOString() })
        .in("id", ids);
    }

    // Tankovania (ak poskytovateľ vie).
    if (adapter.tankovania && !v.neuplne && Date.now() < koniec - 5000) {
      const teraz = new Date();
      const okno = oknoStahovania(pr.tankovania_do, teraz);
      if (okno) {
        const tank: GpsTankovanie[] = await adapter.tankovania(p, okno.od, okno.do_);
        const podlaExt = new Map<string, string>();
        const podlaSpz = new Map<string, string>();
        for (const vz of sparovane) {
          podlaExt.set(String(vz.externe_id), vz.vehicle_id);
          if (vz.spz) podlaSpz.set(normalizujSpz(vz.spz), vz.vehicle_id);
        }
        // Palivové karty nemajú väzby — párujú sa rovno na vozidlá firmy podľa ŠPZ.
        const { data: auta } = await admin
          .from("vehicles")
          .select("id, license_plate")
          .eq("company_id", pr.company_id);
        for (const a of auta ?? []) {
          const s = normalizujSpz(a.license_plate);
          if (s && !podlaSpz.has(s)) podlaSpz.set(s, a.id);
        }
        const riadky: TankovanieRiadok[] = [];
        for (const t of tank) {
          const vehicleId =
            (t.vozidloExterneId ? podlaExt.get(String(t.vozidloExterneId)) : undefined) ??
            (t.spz ? podlaSpz.get(normalizujSpz(t.spz)) : undefined);
          if (!vehicleId) {
            v.tankovaniaBezVozidla++;
            continue;
          }
          const r = tankovanieNaRiadok(t, {
            companyId: pr.company_id,
            vehicleId,
            poskytovatel: adapter.id,
            pripojenieId: pr.id,
            teraz,
          });
          if (r) riadky.push(r);
          else v.preskocene++;
        }
        const z = await zapisNove("fuel_records", pr.company_id, adapter.id, riadky);
        v.tankovania += z.nove;
        v.duplicity += z.duplicity;
        v.chyby += z.chyby;
        // Tankovania bez spárovaného vozidla sa pri ďalšom behu skúsia znova (prekryv),
        // kurzor sa preto posúva len o to, čo je isté.
        await db
          .from("gps_pripojenia")
          .update({ tankovania_do: okno.do_.toISOString() })
          .eq("id", pr.id);
        if (okno.do_.getTime() < teraz.getTime() - 60_000) v.neuplne = true;
      }
    }

    const sprava = v.neuplne
      ? `Stiahnutá časť: ${v.importovane} nových jázd. Zvyšok dokončí ďalší beh.`
      : `Hotovo: ${v.importovane} nových jázd${adapter.tankovania ? `, ${v.tankovania} tankovaní` : ""}.`;
    await zapisLog(pr, druh, v.neuplne ? "ciastocne" : "ok", sprava, v);
    await db
      .from("gps_pripojenia")
      .update({
        stav: "ok",
        posledna_chyba: null,
        neuplne: v.neuplne,
        posledna_sync_at: new Date().toISOString(),
      })
      .eq("id", pr.id);
    return v;
  } catch (e: any) {
    const { sprava, stav } = spravaChyby(e, adapter, p);
    if (!(e instanceof GpsChyba))
      console.error(`[gps-sync] ${pr.poskytovatel} ${pr.id}:`, e?.message);
    await zapisLog(pr, druh, stav, sprava, v);
    await db
      .from("gps_pripojenia")
      .update({
        stav,
        posledna_chyba: sprava,
        // Limit volaní (napr. Webfleet 1/min): kurzory vozidiel sú uložené, ďalší beh
        // cronu (o 15 min) pokračuje tam, kde sa skončilo. Iná chyba sa skúsi až
        // ďalšiu noc — nechceme zlé heslo skúšať každých 15 minút.
        neuplne: stav === "limit",
        posledna_sync_at: new Date().toISOString(),
      })
      .eq("id", pr.id);
    return { ...v, chyba: sprava };
  }
}

/** Beh cronu: pripojenia, ktoré dnes ešte nebežali alebo nedobehli, kým je čas. */
export async function behCronu(strop = CASOVY_STROP_MS) {
  const koniec = Date.now() + strop;
  const teraz = new Date();
  const { data } = await db
    .from("gps_pripojenia")
    .select("id, aktivne, auto_sync, neuplne, posledna_sync_at, poskytovatel")
    .eq("aktivne", true)
    .eq("auto_sync", true)
    .in(
      "poskytovatel",
      ADAPTERY.map((a) => a.id),
    )
    .order("posledna_sync_at", { ascending: true, nullsFirst: true })
    .limit(500);
  const naRade = (data ?? []).filter((p: any) => trebaSynchronizovat(p, teraz));
  const out = { naRade: naRade.length, spracovane: 0, importovane: 0, chyby: 0, ostava: 0 };
  for (const p of naRade) {
    if (Date.now() > koniec - 5000) break;
    const r = await synchronizujPripojenie(p.id, { koniec, druh: "noc" });
    out.spracovane++;
    out.importovane += r.importovane;
    if (r.chyba) out.chyby++;
  }
  out.ostava = naRade.length - out.spracovane;
  return out;
}

/**
 * Zápis „súkromná/služobná“ späť k poskytovateľovi pre jazdy z GPS, ktorého
 * API to vie. Chyby len spočíta — v knihe jázd je zmena už uložená.
 */
export async function zapisZaradenieSpat(companyId: string, tripIds: string[], sukromna: boolean) {
  const vieZapis = ADAPTERY.filter((a) => a.oznacSukromnu).map((a) => a.id);
  const out = { zapisane: 0, chyby: 0 };
  if (!vieZapis.length || !tripIds.length) return out;
  const { data: jazdy } = await db
    .from("trips")
    .select(
      "id, vehicle_id, external_source, external_id, pripojenie:raw_provider_data->pripojenie_id",
    )
    .eq("company_id", companyId)
    .in("id", tripIds.slice(0, 200))
    .in("external_source", vieZapis);
  const prihlasenia = new Map<string, Record<string, string> | null>();
  for (const j of jazdy ?? []) {
    const prId = typeof j.pripojenie === "string" ? j.pripojenie : null;
    if (!prId || !j.external_id) continue;
    if (!prihlasenia.has(prId)) {
      const { data: pr } = await db
        .from("gps_pripojenia")
        .select("prihlasenie_sifrovane, company_id")
        .eq("id", prId)
        .maybeSingle();
      let p: Record<string, string> | null = null;
      if (pr && pr.company_id === companyId) {
        try {
          p = desifrujPrihlasenie(pr.prihlasenie_sifrovane);
        } catch {
          p = null;
        }
      }
      prihlasenia.set(prId, p);
    }
    const p = prihlasenia.get(prId);
    const adapter = adapterPodlaId(j.external_source);
    if (!p || !adapter?.oznacSukromnu) continue;
    try {
      await adapter.oznacSukromnu(p, j.external_id, sukromna);
      out.zapisane++;
    } catch (e: any) {
      out.chyby++;
      console.warn(`[gps-sync] zápis zaradenia ${j.external_source}/${j.external_id}:`, e?.message);
    }
  }
  return out;
}
