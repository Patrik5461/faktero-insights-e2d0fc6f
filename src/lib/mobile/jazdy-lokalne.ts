/**
 * Kniha jázd v telefóne.
 *
 * Appka má rozhranie v sebe, ale dáta chodia zo Supabase — bez signálu by teda
 * kniha jázd ostala prázdna presne vtedy, keď ju človek potrebuje: v aute.
 * Preto sa posledný známy stav drží lokálne a nová jazda sa dá zapísať aj bez
 * pripojenia; odošle sa, keď sa vráti.
 *
 * Prečo IndexedDB a nie `localStorage`: jázd bývajú tisíce a `localStorage` má
 * strop okolo 5 MB pre celý pôvod — pretiekol by a zhodil by aj doklady.
 */

const DB = "faktero-jazdy";
const VERZIA = 1;
const VOZIDLA = "vozidla";
const JAZDY = "jazdy";

export type LokalneVozidlo = {
  id: string;
  company_id: string;
  name: string;
  license_plate: string | null;
};

export type LokalnaJazda = {
  id: string;
  company_id: string;
  vehicle_id: string;
  trip_date: string;
  driver_name?: string | null;
  start_location?: string | null;
  end_location?: string | null;
  purpose?: string | null;
  distance_km: number;
  duration_seconds?: number | null;
  average_speed_kmh?: number | null;
  classification?: string | null;
  external_source?: string | null;
  route?: string | null;
  /** Riadok, ktorý ešte nie je v databáze — vznikol bez pripojenia. */
  caka?: boolean;
  /** Čo sa má zapísať pri odoslaní; drží sa oddelene od zobrazenia. */
  zapis?: Record<string, unknown>;
  chyba?: string | null;
};

function otvor(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB nie je dostupná."));
      return;
    }
    const req = indexedDB.open(DB, VERZIA);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VOZIDLA)) {
        db.createObjectStore(VOZIDLA, { keyPath: "id" }).createIndex("firma", "company_id");
      }
      if (!db.objectStoreNames.contains(JAZDY)) {
        db.createObjectStore(JAZDY, { keyPath: "id" }).createIndex("firma", "company_id");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Lokálnu knihu jázd sa nepodarilo otvoriť."));
  });
}

async function transakcia<T>(
  store: string,
  rezim: IDBTransactionMode,
  praca: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await otvor();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, rezim);
    const req = praca(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error ?? new Error("Zápis zlyhal."));
    tx.oncomplete = () => db.close();
  });
}

async function vsetky<T>(store: string, companyId: string): Promise<T[]> {
  try {
    const zoznam = await transakcia<T[]>(store, "readonly", (s) => s.getAll());
    return (zoznam ?? []).filter((z: any) => z.company_id === companyId);
  } catch {
    // Bez IndexedDB appka funguje ďalej, len bez pamäte — preto prázdno, nie chyba.
    return [];
  }
}

/* ── vozidlá ─────────────────────────────────────────────────────────────── */

export async function ulozVozidla(companyId: string, vozidla: LokalneVozidlo[]): Promise<void> {
  try {
    const db = await otvor();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(VOZIDLA, "readwrite");
      const s = tx.objectStore(VOZIDLA);
      // Zmazané auto nesmie v telefóne prežiť, preto sa zoznam firmy prepisuje celý.
      const req = s.getAll();
      req.onsuccess = () => {
        for (const stare of (req.result ?? []) as LokalneVozidlo[]) {
          if (stare.company_id === companyId) s.delete(stare.id);
        }
        for (const v of vozidla) s.put({ ...v, company_id: companyId });
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* pamäť je pohodlie, nie podmienka */
  }
}

export function vozidlaZPamate(companyId: string): Promise<LokalneVozidlo[]> {
  return vsetky<LokalneVozidlo>(VOZIDLA, companyId);
}

/* ── jazdy ───────────────────────────────────────────────────────────────── */

/** Uloží načítané jazdy. Čakajúce sa nikdy neprepisujú — tie v databáze nie sú. */
export async function ulozJazdy(companyId: string, jazdy: LokalnaJazda[]): Promise<void> {
  try {
    const db = await otvor();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(JAZDY, "readwrite");
      const s = tx.objectStore(JAZDY);
      const req = s.getAll();
      req.onsuccess = () => {
        for (const stara of (req.result ?? []) as LokalnaJazda[]) {
          if (stara.company_id === companyId && !stara.caka) s.delete(stara.id);
        }
        for (const j of jazdy) s.put({ ...j, company_id: companyId, caka: false });
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* bez pamäte sa zoznam proste nezobrazí offline */
  }
}

export function jazdyZPamate(companyId: string): Promise<LokalnaJazda[]> {
  return vsetky<LokalnaJazda>(JAZDY, companyId);
}

/** Jazda zapísaná bez pripojenia. Ostáva označená, kým sa neodošle. */
export async function pridajCakajucuJazdu(jazda: LokalnaJazda): Promise<LokalnaJazda> {
  const zaznam: LokalnaJazda = { ...jazda, caka: true };
  await transakcia(JAZDY, "readwrite", (s) => s.put(zaznam));
  return zaznam;
}

export async function zmazJazdu(id: string): Promise<void> {
  try {
    await transakcia(JAZDY, "readwrite", (s) => s.delete(id));
  } catch {
    /* nič — pri ďalšom načítaní sa zoznam prepíše */
  }
}

export async function cakajuceJazdy(companyId: string): Promise<LokalnaJazda[]> {
  return (await jazdyZPamate(companyId)).filter((j) => j.caka);
}

/**
 * Zoradenie a zlúčenie pre obrazovku: čakajúce hore, potom podľa dátumu.
 * Čakajúca jazda musí byť vidieť hneď — inak to vyzerá, že sa stratila.
 */
export function zoradJazdy(jazdy: LokalnaJazda[]): LokalnaJazda[] {
  return [...jazdy].sort((a, b) => {
    if (!!a.caka !== !!b.caka) return a.caka ? -1 : 1;
    return (b.trip_date ?? "").localeCompare(a.trip_date ?? "");
  });
}

/**
 * Odošle jazdy zapísané bez pripojenia. Vracia, koľko ich prešlo — appka to
 * môže povedať človeku, nech nemusí hádať, či sa jeho jazda niekam dostala.
 */
export async function odosliCakajuceZapisy(companyId: string): Promise<number> {
  const cakajuce = await cakajuceJazdy(companyId);
  if (cakajuce.length === 0) return 0;

  const { supabase } = await import("@/integrations/supabase/client");
  let odoslane = 0;

  for (const jazda of cakajuce) {
    const zapis = jazda.zapis ?? {};
    const { data, error } = await supabase
      .from("trips")
      .insert(zapis as never)
      .select("id")
      .single();

    if (error) {
      // 23505 = jazda tam už je z predošlého pokusu; taká sa má z fronty vyhodiť.
      if ((error as any).code === "23505") await zmazJazdu(jazda.id);
      continue;
    }
    await zmazJazdu(jazda.id);
    if (data?.id) odoslane++;
  }
  return odoslane;
}
