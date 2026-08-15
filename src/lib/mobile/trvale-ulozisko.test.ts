import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  citaj,
  klucePamate,
  vycistiPamat,
  zabudniPrihlasenie,
  zapis,
  zmaz,
} from "./trvale-ulozisko";

// Testy bežia v Node bez prehliadača. Natívne úložisko tu nie je, takže sa
// overuje tá časť, ktorá rozhoduje o offline: pamäť a prehliadačová záloha.
beforeAll(() => {
  const data = new Map<string, string>();
  (globalThis as any).localStorage = {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
});

describe("trvalé úložisko", () => {
  beforeEach(() => {
    localStorage.clear();
    vycistiPamat();
  });

  it("zapísané sa dá prečítať", () => {
    zapis("faktero.active_company", "abc");
    expect(citaj("faktero.active_company")).toBe("abc");
  });

  it("prežije vyprázdnenie prehliadačového úložiska", () => {
    // Presne toto sa v telefóne dialo pri zatvorení appky: localStorage bol
    // prázdny a s ním aj prihlásenie. Pamäť plnená natívne to má prežiť.
    zapis("faktero.active_company", "abc");
    localStorage.clear();
    expect(citaj("faktero.active_company")).toBe("abc");
  });

  it("zmazané zmizne z oboch miest", () => {
    zapis("faktero.active_company", "abc");
    zmaz("faktero.active_company");
    expect(citaj("faktero.active_company")).toBeNull();
    expect(localStorage.getItem("faktero.active_company")).toBeNull();
  });

  it("neznámy kľúč je null, nie výnimka", () => {
    expect(citaj("faktero.nic")).toBeNull();
  });

  it("odhlásenie zabudne reláciu aj vybranú firmu", () => {
    // Bez signálu `signOut()` zlyhá; relácia nesmie v telefóne ostať.
    zapis("sb-projekt-auth-token", '{"user":{"id":"1"}}');
    zapis("faktero.active_company", "abc");
    zapis("faktero.vozidlo.abc", "auto");

    zabudniPrihlasenie();

    expect(citaj("sb-projekt-auth-token")).toBeNull();
    expect(citaj("faktero.active_company")).toBeNull();
    // Voľba auta k účtu neviaže nič citlivé a po prihlásení sa hodí.
    expect(citaj("faktero.vozidlo.abc")).toBe("auto");
    expect(klucePamate()).not.toContain("sb-projekt-auth-token");
  });
});

describe("plugin sa nesmie vrátiť z asynchrónnej funkcie priamo", () => {
  it("objekt s vlastnosťou then sa pri await zavolá, nie vráti", async () => {
    // Presne toto robí proxy Capacitora: každý prístup k vlastnosti — vrátane
    // `then` — považuje za natívnu metódu. Preto sa plugin musí zabaliť.
    let zavolaneThen = false;
    const akoPlugin = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === "then") {
            zavolaneThen = true;
            return () => {
              throw new Error(`"Preferences.then()" is not implemented`);
            };
          }
          return () => Promise.resolve(null);
        },
      },
    );

    async function zle() {
      return akoPlugin;
    }
    await expect(zle()).rejects.toThrow("not implemented");
    expect(zavolaneThen).toBe(true);

    // Obal je obyčajný objekt — `await` ho vráti tak, ako je.
    async function spravne() {
      return { get: () => Promise.resolve("hodnota") };
    }
    const obal = await spravne();
    expect(await obal.get()).toBe("hodnota");
  });
});
