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

export async function pridajDoFronty(
  doklad: Omit<CakajuciDoklad, "id" | "ts">,
): Promise<CakajuciDoklad> {
  const zaznam: CakajuciDoklad = { ...doklad, id: crypto.randomUUID(), ts: Date.now() };
  await transakcia("readwrite", (s) => s.put(zaznam));
  return zaznam;
}

export async function fronta(companyId?: string): Promise<CakajuciDoklad[]> {
  try {
    const vsetko = await transakcia<CakajuciDoklad[]>("readonly", (s) => s.getAll());
    const zoznam = companyId ? vsetko.filter((d) => d.company_id === companyId) : vsetko;
    return zoznam.sort((a, b) => b.ts - a.ts);
  } catch {
    // Bez IndexedDB (súkromné okno, starý WebView) appka funguje ďalej, len
    // bez odkladania — preto prázdna fronta a nie chyba.
    return [];
  }
}

export async function zmazZFronty(id: string): Promise<void> {
  await transakcia("readwrite", (s) => s.delete(id));
}

export async function zapisChybu(id: string, chyba: string): Promise<void> {
  const doklad = await transakcia<CakajuciDoklad | undefined>("readonly", (s) => s.get(id));
  if (!doklad) return;
  await transakcia("readwrite", (s) => s.put({ ...doklad, chyba: chyba.slice(0, 200) }));
}

export async function pocetVoFronte(companyId?: string): Promise<number> {
  return (await fronta(companyId)).length;
}
