import type { BlocekVysledok } from "@/lib/faktero/blocek.functions";

/**
 * Fronta dokladov, ktoré čakajú na signál.
 *
 * Bloček sa skenuje tam, kde sa nakupuje — v obchode, v pivnici, na stavbe.
 * Bez tejto fronty sa doklad bez signálu jednoducho neuloží a je preč, lebo
 * čítanie z Finančnej správy aj samotný zápis idú cez server.
 *
 * Prečo IndexedDB a nie `localStorage`: fotka dokladu má bežne 1–3 MB a
 * `localStorage` má strop okolo 5 MB pre celú doménu — druhý doklad by ho
 * pretiekol a zhodil by aj to, čo tam už je.
 *
 * Vo fronte je zámerne **vstup, nie hotový záznam**: bez signálu sa doklad
 * nedá prečítať, takže sa odloží QR kód a fotka a prečíta sa to až pri
 * odosielaní. Inak by z každého offline bločku ostal prázdny výdavok.
 */

export type CakajuciDoklad = {
  id: string;
  company_id: string;
  /** Surový QR kód z bločku, ak sa ho podarilo nasnímať. */
  qr_raw?: string | null;
  /** Fotka alebo PDF ako data URL — priloží sa k dokladu po odoslaní. */
  obrazok?: string | null;
  uhrada: "hotovost" | "karta" | "prevod";
  /** Keď sa doklad stihol prečítať ešte online, netreba ho čítať znova. */
  vysledok?: BlocekVysledok | null;
  ts: number;
  /** Prečo posledný pokus zlyhal — nech sa to nemusí hádať. */
  chyba?: string | null;
};

const DB = "faktero";
const STORE = "doklady-fronta";

function otvor(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB nie je dostupná."));
      return;
    }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB sa nedá otvoriť."));
  });
}

async function transakcia<T>(
  rezim: IDBTransactionMode,
  praca: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await otvor();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, rezim);
    const req = praca(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Zápis do fronty zlyhal."));
    tx.oncomplete = () => db.close();
  });
}

/**
 * Súbory v telefóne — jediné miesto, o ktorom vieme, že zatvorenie appky
 * prežije.
 *
 * IndexedDB vo WebView zdieľa osud ostatných prehliadačových úložísk: po
 * znovuotvorení appky môže byť prázdna. Pri zozname faktúr je to nepríjemnosť,
 * pri fronte dokladov je to **strata práce** — bloček zo stavby už druhýkrát
 * nenaskenujete. Preto sa v telefóne každý čakajúci doklad ukladá aj ako súbor.
 *
 * Na webe žiadny súborový systém nie je a IndexedDB stačí.
 */
const PRIECINOK = "doklady-fronta";

async function subory() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    return { Filesystem, Directory, Encoding };
  } catch {
    return null;
  }
}

async function zapisSubor(zaznam: CakajuciDoklad): Promise<void> {
  const f = await subory();
  if (!f) return;
  try {
    await f.Filesystem.mkdir({
      path: PRIECINOK,
      directory: f.Directory.Data,
      recursive: true,
    }).catch(() => {
      /* priečinok už existuje */
    });
    await f.Filesystem.writeFile({
      path: `${PRIECINOK}/${zaznam.id}.json`,
      data: JSON.stringify(zaznam),
      directory: f.Directory.Data,
      encoding: f.Encoding.UTF8,
    });
  } catch {
    /* zlyhaný zápis súboru neruší IndexedDB — doklad ostáva aspoň tam */
  }
}

async function zmazSubor(id: string): Promise<void> {
  const f = await subory();
  if (!f) return;
  try {
    await f.Filesystem.deleteFile({
      path: `${PRIECINOK}/${id}.json`,
      directory: f.Directory.Data,
    });
  } catch {
    /* súbor tam nemusí byť */
  }
}

async function zoSuborov(): Promise<CakajuciDoklad[]> {
  const f = await subory();
  if (!f) return [];
  try {
    const { files } = await f.Filesystem.readdir({
      path: PRIECINOK,
      directory: f.Directory.Data,
    });
    const von: CakajuciDoklad[] = [];
    for (const s of files) {
      const nazov = typeof s === "string" ? s : s.name;
      if (!nazov.endsWith(".json")) continue;
      try {
        const { data } = await f.Filesystem.readFile({
          path: `${PRIECINOK}/${nazov}`,
          directory: f.Directory.Data,
          encoding: f.Encoding.UTF8,
        });
        von.push(JSON.parse(String(data)) as CakajuciDoklad);
      } catch {
        /* jeden poškodený súbor neruší zvyšok fronty */
      }
    }
    return von;
  } catch {
    return [];
  }
}

export async function pridajDoFronty(
  doklad: Omit<CakajuciDoklad, "id" | "ts">,
): Promise<CakajuciDoklad> {
  const zaznam: CakajuciDoklad = { ...doklad, id: crypto.randomUUID(), ts: Date.now() };
  await zapisSubor(zaznam);
  try {
    await transakcia("readwrite", (s) => s.put(zaznam));
  } catch {
    // Keď IndexedDB nie je, doklad ostáva v súbore — to je to, na čom záleží.
  }
  return zaznam;
}

export async function fronta(companyId?: string): Promise<CakajuciDoklad[]> {
  const podlaId = new Map<string, CakajuciDoklad>();
  // Súbory prvé: sú zdrojom pravdy, IndexedDB len dopĺňa, čo v nich chýba.
  for (const d of await zoSuborov()) podlaId.set(d.id, d);
  try {
    const vsetko = await transakcia<CakajuciDoklad[]>("readonly", (s) => s.getAll());
    for (const d of vsetko) if (!podlaId.has(d.id)) podlaId.set(d.id, d);
  } catch {
    // Bez IndexedDB (súkromné okno, starý WebView) appka funguje ďalej, len
    // bez odkladania — preto prázdna fronta a nie chyba.
  }
  const zoznam = [...podlaId.values()].filter((d) => !companyId || d.company_id === companyId);
  return zoznam.sort((a, b) => b.ts - a.ts);
}

export async function zmazZFronty(id: string): Promise<void> {
  await zmazSubor(id);
  try {
    await transakcia("readwrite", (s) => s.delete(id));
  } catch {
    /* stačí, že je preč zo súborov */
  }
}

export async function zapisChybu(id: string, chyba: string): Promise<void> {
  const doklad = (await fronta()).find((d) => d.id === id);
  if (!doklad) return;
  const upraveny = { ...doklad, chyba: chyba.slice(0, 200) };
  await zapisSubor(upraveny);
  try {
    await transakcia("readwrite", (s) => s.put(upraveny));
  } catch {
    /* nič */
  }
}

export async function pocetVoFronte(companyId?: string): Promise<number> {
  return (await fronta(companyId)).length;
}
