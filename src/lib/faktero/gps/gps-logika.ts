/**
 * Čisté funkcie synchronizácie GPS — prevod jazdy/tankovania na riadok
 * databázy, okná sťahovania a výber pripojení na beh. Bez prístupu k DB,
 * aby sa dali testovať.
 */
import type { GpsJazda, GpsPole, GpsTankovanie } from "./typy";
import { dnesBratislava } from "../datum-vystavenia";

export const DEN_MS = 24 * 3600 * 1000;
/** Pri pripojení sa sťahuje posledných 30 dní. */
export const PRVE_STIAHNUTIE_DNI = 30;
/** Prekryv s minulým behom — jazdy, ktoré poskytovateľ dopočíta neskoro. */
export const PREKRYV_MS = 2 * DEN_MS;
/** Najviac toľko dní na jedno vozidlo v jednom behu (zvyšok dokončí ďalší beh). */
export const MAX_OKNO_DNI = 31;

/** ŠPZ na porovnanie: veľké písmená bez medzier a pomlčiek. */
export function normalizujSpz(spz: string | null | undefined): string {
  return String(spz ?? "")
    .toUpperCase()
    .replace(/[\s\-–.]/g, "");
}

/** Odkiaľ a pokiaľ sťahovať jazdy vozidla. `null` = netreba (už je aktuálne). */
export function oknoStahovania(
  jazdyDo: string | null | undefined,
  teraz: Date,
): { od: Date; do_: Date } | null {
  // Kurzor až po „teraz“ → aktuálne. Prekryv platí až pre ďalší beh.
  if (jazdyDo && new Date(jazdyDo).getTime() >= teraz.getTime() - 60_000) return null;
  const najskor = teraz.getTime() - PRVE_STIAHNUTIE_DNI * DEN_MS;
  const od = jazdyDo ? Math.max(najskor, new Date(jazdyDo).getTime() - PREKRYV_MS) : najskor;
  const do_ = Math.min(teraz.getTime(), od + MAX_OKNO_DNI * DEN_MS);
  if (do_ - od < 60_000) return null;
  return { od: new Date(od), do_: new Date(do_) };
}

/**
 * Ďalšie okno na stiahnutie: vozidlá s najstarším kurzorom, ktoré majú
 * rovnaké okno, idú spolu. `null` = všetky vozidlá sú aktuálne.
 */
export function najblizsiaSkupina(
  vozidla: Array<{ id: string; jazdyDo: string | null }>,
  teraz: Date,
): { okno: { od: Date; do_: Date }; ids: string[] } | null {
  let najlepsie: { od: Date; do_: Date } | null = null;
  let ids: string[] = [];
  for (const v of vozidla) {
    const o = oknoStahovania(v.jazdyDo, teraz);
    if (!o) continue;
    if (!najlepsie || o.od.getTime() < najlepsie.od.getTime()) {
      najlepsie = o;
      ids = [v.id];
    } else if (
      o.od.getTime() === najlepsie.od.getTime() &&
      o.do_.getTime() === najlepsie.do_.getTime()
    ) {
      ids.push(v.id);
    }
  }
  return najlepsie ? { okno: najlepsie, ids } : null;
}

/** Patrí pripojenie do tohto behu cronu? */
export function trebaSynchronizovat(
  p: { aktivne: boolean; auto_sync: boolean; neuplne: boolean; posledna_sync_at: string | null },
  teraz: Date,
): boolean {
  if (!p.aktivne || !p.auto_sync) return false;
  if (!p.posledna_sync_at || p.neuplne) return true;
  // Raz za noc: po polnoci UTC a do 05:00 UTC, ak dnes ešte nebežalo.
  const polnoc = Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth(), teraz.getUTCDate());
  return teraz.getUTCHours() < 5 && new Date(p.posledna_sync_at).getTime() < polnoc;
}

export type TripRiadok = {
  company_id: string;
  vehicle_id: string;
  trip_date: string;
  driver_name: string | null;
  start_location: string | null;
  end_location: string | null;
  purpose: string | null;
  classification: "business" | "private";
  start_odometer: number;
  end_odometer: number;
  distance_km: number;
  fuel_consumption: number | null;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  average_speed_kmh: number | null;
  note: string;
  external_source: string;
  external_id: string;
  imported_at: string;
  raw_provider_data: unknown;
};

/**
 * Jazda z GPS → riadok `trips`. Vráti dôvod, keď jazda do knihy nepatrí
 * (nulová vzdialenosť, nezmyselný tachometer, zlé časy).
 */
export function jazdaNaTrip(
  j: GpsJazda,
  ctx: {
    companyId: string;
    vehicleId: string;
    poskytovatel: string;
    nazovPoskytovatela: string;
    pripojenieId: string;
    teraz?: Date;
  },
): { riadok: TripRiadok } | { preskoc: "nulova" | "neplatna" } {
  const z = new Date(j.zaciatok);
  const k = new Date(j.koniec);
  if (!Number.isFinite(z.getTime()) || !Number.isFinite(k.getTime()) || k < z)
    return { preskoc: "neplatna" };
  const km = Number(j.km);
  if (!Number.isFinite(km) || km < 0) return { preskoc: "neplatna" };
  // Naštartovanie a zhasnutie na mieste nie je jazda.
  if (km < 0.05) return { preskoc: "nulova" };

  let start = j.tachometerZaciatok ?? null;
  let end = j.tachometerKoniec ?? null;
  if (start == null && end != null) start = Math.max(0, end - km);
  if (start == null) start = 0;
  if (end == null || end < start) end = start + km;
  start = Math.round(start * 10) / 10;
  end = Math.round(end * 10) / 10;
  if (end < start) end = start;

  const trvanie = Math.max(0, Math.round((k.getTime() - z.getTime()) / 1000));
  const sukromna = j.sukromna === true;
  const ucel = (j.ucel ?? "").trim();

  return {
    riadok: {
      company_id: ctx.companyId,
      vehicle_id: ctx.vehicleId,
      // Deň podľa Bratislavy — jazda o 00:30 by v UTC padla na predošlý deň (a mesiac).
      trip_date: dnesBratislava(z),
      driver_name: (j.vodic ?? "").trim() || null,
      start_location: (j.odAdresa ?? "").trim() || null,
      end_location: (j.doAdresa ?? "").trim() || null,
      purpose: ucel || (sukromna ? "Súkromná jazda" : "Služobná cesta"),
      classification: sukromna ? "private" : "business",
      start_odometer: start,
      end_odometer: end,
      distance_km: Math.round(km * 100) / 100,
      fuel_consumption: uveritelnaSpotreba(j.spotrebaL, km),
      start_time: z.toISOString(),
      end_time: k.toISOString(),
      duration_seconds: trvanie,
      average_speed_kmh: trvanie > 0 ? Math.round((km / (trvanie / 3600)) * 10) / 10 : null,
      note: `Automatický import z ${ctx.nazovPoskytovatela}`,
      external_source: ctx.poskytovatel,
      external_id: j.externeId,
      imported_at: (ctx.teraz ?? new Date()).toISOString(),
      raw_provider_data: {
        pripojenie_id: ctx.pripojenieId,
        // Súradnice pre doplnenie adries (jazdy-doplnenie), keď ich poskytovateľ nemá.
        suradnice: {
          odLat: j.odLat ?? null,
          odLng: j.odLng ?? null,
          doLat: j.doLat ?? null,
          doLng: j.doLng ?? null,
        },
        data: j.surove ?? null,
      },
    },
  };
}

/**
 * Spotreba jazdy v litroch, len ak dáva zmysel. GPS Dozor bez merania z CAN
 * posiela vo `FuelConsumed` číslo rovné kilometrom (100 l/100 km, DEMO účet)
 * a v dokumentácii 0,12 l na 118 km — také číslo by v knihe jázd nafúklo alebo
 * vynulovalo náklady na palivo. Vtedy radšej nič.
 */
export function uveritelnaSpotreba(litre: number | null | undefined, km: number): number | null {
  if (litre == null || !Number.isFinite(litre) || litre < 0) return null;
  const naSto = km > 0 ? (litre / km) * 100 : Infinity;
  // Krátka jazda (štart, státie) môže mať vysokú spotrebu na 100 km.
  if (km >= 5 ? naSto < 1 || naSto > 80 : naSto > 150) return null;
  return Math.round(litre * 100) / 100;
}

export type TankovanieRiadok = {
  company_id: string;
  vehicle_id: string;
  fuel_date: string;
  liters: number;
  price_per_liter: number;
  total_amount: number;
  station_name: string | null;
  receipt_number: string | null;
  external_source: string;
  external_id: string;
  imported_at: string;
  raw_provider_data: unknown;
};

export function tankovanieNaRiadok(
  t: GpsTankovanie,
  ctx: {
    companyId: string;
    vehicleId: string;
    poskytovatel: string;
    pripojenieId: string;
    teraz?: Date;
  },
): TankovanieRiadok | null {
  const cas = new Date(t.cas);
  const litre = Number(t.litre);
  if (!Number.isFinite(cas.getTime()) || !Number.isFinite(litre) || litre <= 0) return null;
  const suma = t.suma != null && Number.isFinite(Number(t.suma)) ? Number(t.suma) : 0;
  return {
    company_id: ctx.companyId,
    vehicle_id: ctx.vehicleId,
    fuel_date: dnesBratislava(cas),
    liters: Math.round(litre * 100) / 100,
    price_per_liter: suma > 0 ? Math.round((suma / litre) * 1000) / 1000 : 0,
    total_amount: Math.round(suma * 100) / 100,
    station_name: (t.miesto ?? "").trim() || null,
    receipt_number: null,
    external_source: ctx.poskytovatel,
    external_id: t.externeId,
    imported_at: (ctx.teraz ?? new Date()).toISOString(),
    raw_provider_data: {
      pripojenie_id: ctx.pripojenieId,
      mena: t.mena ?? null,
      palivo: t.palivo ?? null,
      tachometer_km: t.tachometerKm ?? null,
      data: t.surove ?? null,
    },
  };
}

/** Rozdelí prihlasovacie údaje na tajné (šifrujú sa) a verejné (ukážu sa vo formulári). */
export function rozdelPrihlasenie(
  polia: GpsPole[],
  hodnoty: Record<string, string>,
): { vsetko: Record<string, string>; verejne: Record<string, string> } {
  const vsetko: Record<string, string> = {};
  const verejne: Record<string, string> = {};
  for (const p of polia) {
    const v = (hodnoty[p.kluc] ?? "").trim();
    if (!v) continue;
    vsetko[p.kluc] = v;
    if (p.typ !== "heslo") verejne[p.kluc] = v;
  }
  return { vsetko, verejne };
}

/**
 * Doplní prázdne polia novej verzie údajov z uložených (heslo sa po uložení
 * ukazuje len ako „••••“ a prázdne znamená „nemeniť“).
 */
export function zlucPrihlasenie(
  polia: GpsPole[],
  nove: Record<string, string>,
  ulozene: Record<string, string>,
): Record<string, string> {
  // Zmenená adresa servera (Traccar, Wialon) = uložené heslo/token sa nepoužije.
  // Inak by sa dalo uložené tajomstvo poslať na ľubovoľný server len prepísaním adresy.
  const inaAdresa = polia.some(
    (p) =>
      p.typ === "url" &&
      (nove[p.kluc] ?? "").trim() !== "" &&
      (nove[p.kluc] ?? "").trim() !== (ulozene[p.kluc] ?? "").trim(),
  );
  const out: Record<string, string> = {};
  for (const p of polia) {
    const v = (nove[p.kluc] ?? "").trim();
    const zUlozenych = p.typ === "heslo" && inaAdresa ? "" : ulozene[p.kluc] || "";
    out[p.kluc] = v || zUlozenych;
  }
  return out;
}

/** Chýbajúce povinné polia. */
export function chybajucePolia(polia: GpsPole[], hodnoty: Record<string, string>): string[] {
  return polia.filter((p) => p.povinne && !(hodnoty[p.kluc] ?? "").trim()).map((p) => p.nazov);
}

/** Správa chyby bez tajomstiev (ak ju poskytovateľ náhodou zopakoval). */
export function bezTajomstiev(
  sprava: string,
  prihlasenie: Record<string, string>,
  polia: GpsPole[],
): string {
  let s = sprava;
  for (const p of polia) {
    if (p.typ !== "heslo") continue;
    const v = prihlasenie[p.kluc];
    if (v && v.length >= 4) s = s.split(v).join("••••");
  }
  return s.slice(0, 500);
}
