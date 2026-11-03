import { describe, expect, it } from "vitest";
import {
  casUdalosti,
  ktoKedyDokladu,
  nahranieDokladu,
  prenosNahratia,
  textKto,
  zauctovanieDokladu,
} from "./kto-kedy";

const mena = { u1: "Jana Nováková", u2: "Peter Kováč" };

describe("nahranieDokladu", () => {
  it("človek: created_by a nahrane_at (pred created_at)", () => {
    expect(
      nahranieDokladu(
        { created_by: "u1", nahrane_at: "2026-11-02T08:14:00Z", created_at: "2026-11-02T09:00:00Z", source: "nahrate" },
        "prijata",
      ),
    ).toEqual({ kto: { typ: "clovek", id: "u1" }, kedy: "2026-11-02T08:14:00Z" });
  });
  it("starý doklad bez nahrane_at → created_at", () => {
    expect(nahranieDokladu({ created_by: "u1", created_at: "2026-01-05T10:00:00Z" }, "doklad")?.kedy).toBe(
      "2026-01-05T10:00:00Z",
    );
  });
  it("e-mail: odosielateľ, nie majiteľ adresy v created_by", () => {
    const u = nahranieDokladu({ created_by: "u1", source: "mail", odosielatel_mailu: "fa@dodavatel.sk" }, "prijata");
    expect(u?.kto).toEqual({ typ: "mail", adresa: "fa@dodavatel.sk" });
    // Bloček z mailu má source upload — prezradí ho odosielateľ alebo väzba na mail.
    expect(nahranieDokladu({ created_by: "u1", source: "upload", inbox_message_id: "m1" }, "doklad")?.kto).toEqual({
      typ: "mail",
      adresa: null,
    });
    expect(nahranieDokladu({ zdroj: "mail", created_by: "u1" }, "nespracovany")?.kto.typ).toBe("mail");
  });
  it("API, import, eFaktúra", () => {
    expect(nahranieDokladu({ source: "api" }, "prijata")?.kto.typ).toBe("api");
    expect(nahranieDokladu({ source: "import", created_at: "x" }, "doklad")?.kto.typ).toBe("import");
    expect(nahranieDokladu({ source: "efaktura" }, "prijata")?.kto.typ).toBe("efaktura");
    expect(nahranieDokladu({ import_source: "superfaktura", created_by: "u1" }, "faktura")?.kto.typ).toBe("import");
  });
  it("bez údajov null", () => {
    expect(nahranieDokladu({}, "prijata")).toBeNull();
    expect(nahranieDokladu(null, "prijata")).toBeNull();
  });
});

describe("zauctovanieDokladu", () => {
  it("posledné zaúčtovanie má prednosť pred prvým", () => {
    expect(
      zauctovanieDokladu(
        {
          zauctoval: "u1",
          zauctovane_at: "2026-11-01T10:00:00Z",
          naposledy_zauctoval: "u2",
          naposledy_zauctovane_at: "2026-11-02T09:02:00Z",
        },
        "prijata",
      ),
    ).toEqual({ kto: { typ: "clovek", id: "u2" }, kedy: "2026-11-02T09:02:00Z" });
  });
  it("starší doklad: zauctoval / zauctovane_at", () => {
    expect(zauctovanieDokladu({ zauctoval: "u1", zauctovane_at: "2026-10-01T10:00:00Z" }, "doklad")?.kto).toEqual({
      typ: "clovek",
      id: "u1",
    });
  });
  it("automat: bez človeka so zdrojom pravidlo/zvyk/ai", () => {
    const r = { zauctovane_at: "2026-11-02T09:00:00Z", zauctovanie_zdroj: "pravidlo" };
    expect(zauctovanieDokladu(r, "prijata")?.kto).toEqual({ typ: "automat", zdroj: "pravidlo" });
    expect(zauctovanieDokladu({ ...r, zauctovanie_zdroj: "ai" }, "faktura")?.kto).toEqual({ typ: "automat", zdroj: "ai" });
    // Človek, ktorý potom zmenil kódy, prebije automat (zdroj sa prepne na manual).
    expect(
      zauctovanieDokladu(
        { ...r, zauctovanie_zdroj: "manual", naposledy_zauctoval: "u2", naposledy_zauctovane_at: "2026-11-02T10:00:00Z" },
        "prijata",
      )?.kto,
    ).toEqual({ typ: "clovek", id: "u2" });
  });
  it("nezaúčtovaný a ostatný doklad null", () => {
    expect(zauctovanieDokladu({ zauctoval: "u1" }, "prijata")).toBeNull();
    expect(zauctovanieDokladu({ zauctovane_at: "x" }, "ostatny")).toBeNull();
  });
});

describe("ktoKedyDokladu", () => {
  it("uloženie sa ukáže vždy — aj keď ho ten istý človek hneď zaúčtoval", () => {
    const k = ktoKedyDokladu(
      {
        created_by: "u1",
        nahrane_at: "2026-11-02T08:14:00Z",
        spracoval: "u2",
        spracovane_at: "2026-11-02T09:02:00Z",
        zauctoval: "u2",
        zauctovane_at: "2026-11-02T09:02:01Z",
      },
      "prijata",
    );
    expect(k.ulozene).toEqual({ kto: { typ: "clovek", id: "u2" }, kedy: "2026-11-02T09:02:00Z" });
    expect(k.nahrane?.kto).toEqual({ typ: "clovek", id: "u1" });
    expect(k.zauctovane?.kto).toEqual({ typ: "clovek", id: "u2" });
  });
  it("uloženie ostane, keď zaúčtoval niekto iný alebo neskôr", () => {
    const k = ktoKedyDokladu(
      {
        created_by: "u1",
        processed_by: "u1",
        processed_at: "2026-11-02T09:00:00Z",
        nahrane_at: "2026-11-01T08:00:00Z",
        zauctoval: "u2",
        zauctovane_at: "2026-11-03T09:00:00Z",
      },
      "doklad",
    );
    expect(k.ulozene).toEqual({ kto: { typ: "clovek", id: "u1" }, kedy: "2026-11-02T09:00:00Z" });
  });
  it("ručne zapísaný a hneď spracovaný bloček — uloženie sa ukáže tiež", () => {
    const k = ktoKedyDokladu(
      { created_by: "u1", created_at: "2026-11-02T09:00:00Z", processed_by: "u1", processed_at: "2026-11-02T09:00:00Z" },
      "doklad",
    );
    expect(k.ulozene?.kto).toEqual({ typ: "clovek", id: "u1" });
  });
});

describe("uloženie ručne zapísaného dokladu", () => {
  it("prijatá faktúra zadaná ručne: Uložené = kto ju vytvoril a kedy", () => {
    const k = ktoKedyDokladu(
      {
        created_by: "u1",
        created_at: "2026-11-03T10:15:00Z",
        nahrane_at: "2026-11-03T10:15:00Z",
        source: "manual",
        zauctoval: "u1",
        zauctovane_at: "2026-11-03T10:15:01Z",
      },
      "prijata",
    );
    expect(k.ulozene).toEqual({ kto: { typ: "clovek", id: "u1" }, kedy: "2026-11-03T10:15:00Z" });
    expect(k.ulozeneVytvorenim).toBe(true);
  });
  it("bloček a ostatný doklad bez processed_* tiež", () => {
    expect(ktoKedyDokladu({ created_by: "u2", created_at: "2026-11-03T08:00:00Z" }, "doklad").ulozene?.kto).toEqual({
      typ: "clovek",
      id: "u2",
    });
    expect(ktoKedyDokladu({ created_by: "u2", created_at: "2026-11-03T08:00:00Z" }, "ostatny").ulozene?.kedy).toBe(
      "2026-11-03T08:00:00Z",
    );
  });
  it("starý doklad bez autora ukáže aspoň čas", () => {
    expect(ktoKedyDokladu({ created_at: "2025-01-01T08:00:00Z" }, "prijata").ulozene).toEqual({
      kto: { typ: "clovek", id: null },
      kedy: "2025-01-01T08:00:00Z",
    });
  });
  it("doklad z mailu bez spracovania uložil server, API ostane API", () => {
    expect(
      ktoKedyDokladu({ created_by: "u1", created_at: "2026-11-03T08:00:00Z", source: "mail" }, "prijata").ulozene?.kto,
    ).toEqual({ typ: "system" });
    expect(ktoKedyDokladu({ created_at: "2026-11-03T08:00:00Z", source: "api" }, "prijata").ulozene?.kto.typ).toBe("api");
  });
  it("výslovné uloženie (z Nespracovaných) má prednosť a nie je odvodené", () => {
    const k = ktoKedyDokladu(
      { created_by: "u1", created_at: "2026-11-03T09:00:00Z", spracoval: "u2", spracovane_at: "2026-11-03T09:00:00Z" },
      "prijata",
    );
    expect(k.ulozene?.kto).toEqual({ typ: "clovek", id: "u2" });
    expect(k.ulozeneVytvorenim).toBeUndefined();
  });
  it("vystavená faktúra má Vytvorené, Uložené nie", () => {
    expect(ktoKedyDokladu({ created_by: "u1", created_at: "2026-11-03T09:00:00Z" }, "faktura").ulozene).toBeNull();
  });
});

describe("prenos z Nespracovaných", () => {
  it("vytvorený doklad dostane pôvodného nahrávajúceho a čas nahratia", () => {
    expect(prenosNahratia({ created_by: "u1", created_at: "2026-11-02T08:14:00Z" }, "u2")).toEqual({
      created_by: "u1",
      nahrane_at: "2026-11-02T08:14:00Z",
    });
  });
  it("bez nahrávajúceho ten, kto klikol Vytvoriť; čas rozhodne databáza", () => {
    expect(prenosNahratia({ created_by: null }, "u2")).toEqual({ created_by: "u2", nahrane_at: null });
  });
  it("vytvorený doklad potom ukáže čas nahratia, nie čas vytvorenia", () => {
    const p = prenosNahratia({ created_by: "u1", created_at: "2026-11-02T08:14:00Z" }, "u2");
    const riadok = { ...p, created_at: "2026-11-02T09:02:00Z", spracoval: "u2", spracovane_at: "2026-11-02T09:02:00Z" };
    const k = ktoKedyDokladu(riadok, "prijata");
    expect(k.nahrane).toEqual({ kto: { typ: "clovek", id: "u1" }, kedy: "2026-11-02T08:14:00Z" });
    expect(k.ulozene).toEqual({ kto: { typ: "clovek", id: "u2" }, kedy: "2026-11-02T09:02:00Z" });
  });
});

describe("textKto a casUdalosti", () => {
  it("texty", () => {
    expect(textKto({ typ: "clovek", id: "u1" }, mena)).toEqual({ kluc: "", meno: "Jana Nováková" });
    expect(textKto({ typ: "clovek", id: "u9" }, mena)).toEqual({ kluc: "kolega" });
    expect(textKto({ typ: "mail", adresa: "a@b.sk" }, mena)).toEqual({
      kluc: "e-mailom z {adresa}",
      premenne: { adresa: "a@b.sk" },
    });
    expect(textKto({ typ: "mail", adresa: null }, mena).kluc).toBe("e-mailom");
    expect(textKto({ typ: "automat", zdroj: "pravidlo" }, mena).kluc).toBe("automaticky (pravidlo)");
    expect(textKto({ typ: "automat", zdroj: "ai" }, mena).kluc).toBe("automaticky (AI)");
  });
  it("čas po slovensky v bratislavskom čase", () => {
    expect(casUdalosti("2026-11-02T08:14:00Z", "sk-SK")).toBe("2. 11. 2026 9:14");
    expect(casUdalosti(null, "sk-SK")).toBeNull();
    expect(casUdalosti("nezmysel", "sk-SK")).toBeNull();
  });
});
