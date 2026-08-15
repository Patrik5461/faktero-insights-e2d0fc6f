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
