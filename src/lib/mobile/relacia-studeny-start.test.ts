import { describe, it, expect, beforeEach, vi } from "vitest";

/*
  Studený štart appky.

  `nacitajUlozenuRelaciu()` nečíta Keychain, ale pamäť, ktorú napĺňa
  `pripravUlozisko()`. Kým sa nedočíta, platná relácia vyzerá ako žiadna — a
  appka na to reagovala prihlasovacou obrazovkou. Test drží to, že prázdna
  pamäť **pred** prípravou a plná **po** nej dávajú rôzny výsledok, takže sa
  otázka oplatí položiť druhýkrát.
*/
import { vycistiPamat, klucePamate } from "./trvale-ulozisko";
import { nacitajUlozenuRelaciu } from "./relacia";

const KLUC = "sb-sywcjxydnljkzoepfcaz-auth-token";
const RELACIA = JSON.stringify({
  currentSession: { user: { id: "3f1c9a4e-0000-4000-8000-000000000001", email: "p@faktero.sk" } },
});

beforeEach(() => {
  vycistiPamat();
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", {
    length: 0,
    key: () => null,
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
});

describe("relácia pri studenom štarte", () => {
  it("prázdna pamäť vyzerá ako odhlásený — to je tá pasca", () => {
    expect(klucePamate()).toHaveLength(0);
    expect(nacitajUlozenuRelaciu()).toBeNull();
  });

  it("po naplnení pamäte sa tá istá relácia nájde", async () => {
    const { zapis } = await import("./trvale-ulozisko");
    zapis(KLUC, RELACIA);
    const r = nacitajUlozenuRelaciu();
    expect(r?.user?.email).toBe("p@faktero.sk");
  });

  it("poškodený obsah nezhodí appku ani nevydá za prihlásenie", async () => {
    const { zapis } = await import("./trvale-ulozisko");
    zapis(KLUC, "{toto nie je json");
    expect(nacitajUlozenuRelaciu()).toBeNull();
  });

  it("relácia bez používateľa sa neberie", async () => {
    const { zapis } = await import("./trvale-ulozisko");
    zapis(KLUC, JSON.stringify({ currentSession: { access_token: "x" } }));
    expect(nacitajUlozenuRelaciu()).toBeNull();
  });
});
