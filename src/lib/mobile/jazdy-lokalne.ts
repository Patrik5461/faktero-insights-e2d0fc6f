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
const VERZIA = 2;
const VOZIDLA = "vozidla";
const JAZDY = "jazdy";
const PAMAT = "pamat";

export type LokalneVozidlo = {
  id: string;
  company_id: string;
  name: string;
  license_plate: string | null;
  consumption_l_100km?: number | null;
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
      // Odkladacia polica na čokoľvek, čo sa oplatí ukázať aj bez siete —
      // zoznam faktúr, autá pripojené na Commander a podobne.
      if (!db.objectStoreNames.contains(PAMAT)) {
        db.createObjectStore(PAMAT, { keyPath: "kluc" });
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
  // Zoznam áut je krátky, tak ide aj do jednoduchého úložiska — vo WebView je
  // istejšie než IndexedDB a práve vozidlá sú to, bez čoho sa jazda nezapíše.
  void ulozDoPamate(`vozidla:${companyId}`, vozidla);
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

export async function vozidlaZPamate(companyId: string): Promise<LokalneVozidlo[]> {
  const zoznam = await vsetky<LokalneVozidlo>(VOZIDLA, companyId);
  if (zoznam.length) return zoznam;
  const zalozne = await zPamate<LokalneVozidlo[]>(`vozidla:${companyId}`);
  return zalozne?.hodnota ?? [];
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

/**
 * Jazdy z telefónu: posledné načítané z IndexedDB a k nim čakajúce zo zálohy.
 * Čakajúca jazda tak ostane vidieť aj vtedy, keď WebView po reštarte appky
 * IndexedDB vyprázdni.
 */
export async function jazdyZPamate(companyId: string): Promise<LokalnaJazda[]> {
  const zIdb = await vsetky<LokalnaJazda>(JAZDY, companyId);
  const ids = new Set(zIdb.map((j) => j.id));
  const zalozne = (await zalohaCakajucich(companyId)).filter((j) => !ids.has(j.id));
  return [...zIdb, ...zalozne];
}

/*
  Záloha čakajúcich jázd v trvalom úložisku (v telefóne Preferences).

  IndexedDB vo WebView reštart appky nemusí prežiť — po zabití appky je
  prázdna, hoci tvrdí, že funguje. Pre zoznam jázd je to nepríjemnosť, pre
  jazdu zapísanú bez signálu je to **strata záznamu**: kilometre z cesty sa
  druhýkrát nenamerajú. Fronta dokladov sa preto ukladá aj do súborov a
  faktúry do trvalého úložiska; jazdy sem.
*/
const kluceZalohy = (companyId: string) => `cakajuce-jazdy:${companyId}`;

async function zalohaCakajucich(companyId: string): Promise<LokalnaJazda[]> {
  try {
    const z = await zPamate<LokalnaJazda[]>(kluceZalohy(companyId));
    return Array.isArray(z?.hodnota) ? z.hodnota.map((j) => ({ ...j, caka: true })) : [];
  } catch {
    return [];
  }
}

/** Jazda zapísaná bez pripojenia. Ostáva označená, kým sa neodošle. */
export async function pridajCakajucuJazdu(jazda: LokalnaJazda): Promise<LokalnaJazda> {
  const zaznam: LokalnaJazda = { ...jazda, caka: true };
  // Trvalé úložisko prvé — to je to, čo prežije zatvorenie appky.
  const zaloha = (await zalohaCakajucich(zaznam.company_id)).filter((j) => j.id !== zaznam.id);
  await ulozDoPamate(kluceZalohy(zaznam.company_id), [...zaloha, zaznam]);
  try {
    await transakcia(JAZDY, "readwrite", (s) => s.put(zaznam));
  } catch {
    /* bez IndexedDB ostáva jazda v zálohe — a z nej sa aj odošle */
  }
  return zaznam;
}

export async function zmazJazdu(id: string, companyId?: string): Promise<void> {
  try {
    await transakcia(JAZDY, "readwrite", (s) => s.delete(id));
  } catch {
    /* nič — pri ďalšom načítaní sa zoznam prepíše */
  }
  if (!companyId) return;
  const zaloha = await zalohaCakajucich(companyId);
  if (zaloha.some((j) => j.id === id)) {
    await ulozDoPamate(
      kluceZalohy(companyId),
      zaloha.filter((j) => j.id !== id),
    );
  }
}

export async function cakajuceJazdy(companyId: string): Promise<LokalnaJazda[]> {
  return (await jazdyZPamate(companyId)).filter((j) => j.caka);
}

/**
 * Riadok pre `trips` z čakajúcej jazdy. Nesie `id` jazdy z telefónu: keď
 * zápis prejde, ale odpoveď sa cestou stratí, ďalší pokus skončí na
 * duplicitnom kľúči (23505) a jazda sa z fronty vyhodí — namiesto toho, aby
 * v knihe jázd bola dvakrát. Staršie záznamy vo fronte `id` v zápise nemajú,
 * preto sa dopĺňa tu a nie len pri vzniku.
 */
export function zapisCakajucejJazdy(jazda: LokalnaJazda): Record<string, unknown> {
  return { ...(jazda.zapis ?? {}), id: jazda.id };
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
export function odosliCakajuceZapisy(companyId: string): Promise<number> {
  /*
    Frontu vyprázdňuje obrazovka Jazda aj poslucháč návratu signálu. Keby sa
    stretli, obaja by poslali tú istú jazdu — kľúč `id` druhý zápis síce
    odmietne, ale netreba ho vôbec skúšať.
  */
  const beziaci = odosielanieJazd.get(companyId);
  if (beziaci) return beziaci;
  const p = odosliCakajuceZapisyRaz(companyId).finally(() => odosielanieJazd.delete(companyId));
  odosielanieJazd.set(companyId, p);
  return p;
}

const odosielanieJazd = new Map<string, Promise<number>>();

async function odosliCakajuceZapisyRaz(companyId: string): Promise<number> {
  const cakajuce = await cakajuceJazdy(companyId);
  if (cakajuce.length === 0) return 0;

  const { supabase } = await import("@/integrations/supabase/client");
  let odoslane = 0;

  for (const jazda of cakajuce) {
    // Bez siete zápis vyhodí; jazda vtedy ostáva vo fronte na ďalší pokus.
    const { data, error } = await supabase
      .from("trips")
      .insert(zapisCakajucejJazdy(jazda) as never)
      .select("id")
      .single()
      .then(
        (r) => r,
        (e) => ({ data: null, error: e as any }),
      );

    if (error) {
      // 23505 = jazda tam už je z predošlého pokusu; taká sa má z fronty vyhodiť.
      if ((error as any).code === "23505") await zmazJazdu(jazda.id, companyId);
      continue;
    }
    await zmazJazdu(jazda.id, companyId);
    if (data?.id) odoslane++;
  }
  return odoslane;
}

/* ── odkladacia polica ───────────────────────────────────────────────────── */

/**
 * Uloží čokoľvek pod kľúčom, nech sa to dá ukázať aj bez pripojenia.
 * Zámerne bez schémy — sú to len posledné videné dáta, nie zdroj pravdy.
 *
 * Píše sa na dve miesta. IndexedDB unesie aj tisíce jázd, ale vo WebView sa
 * občas nedá otvoriť a zlyhá potichu; jednoduché úložisko je istota (drží sa
 * v ňom aj prihlásenie), len má strop okolo 5 MB — preto sa doň veľké veci
 * neukladajú. Čítanie berie to, čo nájde skôr.
 */
const STROP_JEDNODUCHEHO = 512 * 1024;

function jednoduchyKluc(kluc: string): string {
  return `faktero.pamat.${kluc}`;
}

/**
 * Natívne úložisko telefónu (Preferences). Prehliadačové úložiská vo WebView
 * reštart appky neprežili — po znovuotvorení bola pamäť prázdna, hoci sa do nej
 * pred chvíľou zapísalo. Toto je to isté miesto, kam si ukladajú nastavenia
 * skutočné appky, a prežije všetko okrem odinštalovania.
 */
async function natívne() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const { Preferences } = await import("@capacitor/preferences");
    // Plugin sa nesmie vrátiť priamo: Capacitor ho podáva ako proxy, ktorá aj
    // `then` považuje za natívnu metódu. `await` naň potom zavolá
    // `Preferences.then()`, tá v telefóne neexistuje, funkcia skončí v `catch`
    // a natívne úložisko sa tvárilo, že nie je — hoci bolo. Preto obal.
    return {
      get: (o: { key: string }) => Preferences.get(o),
      set: (o: { key: string; value: string }) => Preferences.set(o),
      remove: (o: { key: string }) => Preferences.remove(o),
    };
  } catch {
    return null;
  }
}

export async function ulozDoPamate(kluc: string, hodnota: unknown): Promise<void> {
  const zaznam = { hodnota, kedy: Date.now() };
  let text = "";
  try {
    text = JSON.stringify(zaznam);
  } catch {
    return;
  }

  const p = await natívne();
  if (p) {
    try {
      await p.set({ key: jednoduchyKluc(kluc), value: text });
    } catch {
      /* aj natívne úložisko môže byť plné — nižšie sú náhrady */
    }
  }

  try {
    if (typeof localStorage !== "undefined" && text.length <= STROP_JEDNODUCHEHO) {
      localStorage.setItem(jednoduchyKluc(kluc), text);
    }
  } catch {
    /* plné alebo nedostupné úložisko — ostáva IndexedDB */
  }
  try {
    await transakcia(PAMAT, "readwrite", (s) => s.put({ kluc, ...zaznam }));
  } catch {
    /* pamäť je pohodlie, nie podmienka */
  }
}

export async function zPamate<T>(kluc: string): Promise<{ hodnota: T; kedy: number } | null> {
  // Najprv natívne — jediné, o ktorom vieme, že reštart appky prežije.
  const p = await natívne();
  if (p) {
    try {
      const { value } = await p.get({ key: jednoduchyKluc(kluc) });
      if (value) return JSON.parse(value) as { hodnota: T; kedy: number };
    } catch {
      /* skúsime nižšie */
    }
  }
  try {
    if (typeof localStorage !== "undefined") {
      const text = localStorage.getItem(jednoduchyKluc(kluc));
      if (text) return JSON.parse(text) as { hodnota: T; kedy: number };
    }
  } catch {
    /* poškodený obsah nie je dôvod appku zhodiť */
  }
  try {
    const z = await transakcia<any>(PAMAT, "readonly", (s) => s.get(kluc));
    return z ? { hodnota: z.hodnota as T, kedy: z.kedy as number } : null;
  } catch {
    return null;
  }
}
