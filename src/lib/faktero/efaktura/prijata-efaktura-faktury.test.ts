import { describe, expect, it } from "vitest";
import {
  VYBER_EFAKTURY_K_PRIJATEJ,
  jeZPrijatejEfaktury,
  maChybyKontroly,
  nalezyNaZobrazenie,
  prijataEfakturaZVyberu,
} from "./prijata-efaktura-faktury";

const riadok = {
  id: "r1",
  channel: "peppol",
  sender_name: " Dodávateľ s.r.o. ",
  sender_participant_id: "0245:2020123456",
  received_at: "2026-10-30T10:00:00Z",
  processed_at: "2026-10-30T10:01:00Z",
  kontrola_chyby: 0,
  kontrola_varovania: 2,
  skontrolovane_at: "2026-10-30T10:00:10Z",
};

describe("prijatá faktúra z eFaktúry", () => {
  it("vnorený výber ide cez väzbu a nenesie XML ani celý výsledok kontroly", () => {
    expect(VYBER_EFAKTURY_K_PRIJATEJ.startsWith("efaktura_received_documents(")).toBe(true);
    expect(VYBER_EFAKTURY_K_PRIJATEJ).not.toContain("xml_payload");
    expect(VYBER_EFAKTURY_K_PRIJATEJ).not.toContain("kontrola_vysledok");
  });

  it("bez väzby a bez zdroja eFaktúra nie je", () => {
    expect(prijataEfakturaZVyberu([], "manual")).toBeNull();
    expect(prijataEfakturaZVyberu(null, null)).toBeNull();
    expect(jeZPrijatejEfaktury(prijataEfakturaZVyberu([], "email"))).toBe(false);
  });

  it("zdroj efaktura bez riadku (zmazaný) — odznak áno, podrobnosti nie", () => {
    const p = prijataEfakturaZVyberu([], "efaktura");
    expect(p).not.toBeNull();
    expect(p?.efaktura).toBeNull();
    expect(p?.kontrola).toBeNull();
    expect(jeZPrijatejEfaktury(p)).toBe(true);
  });

  it("pripojená eFaktúra pri faktúre z iného zdroja sa ráta", () => {
    const p = prijataEfakturaZVyberu([riadok], "email");
    expect(p?.odosielatel).toBe("Dodávateľ s.r.o.");
    expect(p?.peppolId).toBe("0245:2020123456");
    expect(p?.kanal).toBe("peppol");
    expect(p?.prisla).toBe(riadok.received_at);
    expect(p?.zaevidovana).toBe(riadok.processed_at);
    expect(p?.kontrola).toEqual({ chyby: 0, varovania: 2 });
    expect(maChybyKontroly(p)).toBe(false);
  });

  it("objekt namiesto poľa a viac eFaktúr — rozhoduje posledná prijatá", () => {
    expect(prijataEfakturaZVyberu(riadok, "efaktura")?.efaktura?.id).toBe("r1");
    const p = prijataEfakturaZVyberu(
      [{ ...riadok, id: "nova", received_at: "2026-10-31T08:00:00Z", kontrola_chyby: 3 }, riadok],
      "efaktura",
    );
    expect(p?.efaktura?.id).toBe("nova");
    expect(maChybyKontroly(p)).toBe(true);
  });

  it("kontrola, ktorá nebežala, nie je „bez chýb“", () => {
    const p = prijataEfakturaZVyberu(
      [{ ...riadok, kontrola_chyby: null, kontrola_varovania: null, skontrolovane_at: null }],
      "efaktura",
    );
    expect(p?.kontrola).toBeNull();
  });

  it("nálezy — chyby prvé, doplnené parametre, strop", () => {
    const n = nalezyNaZobrazenie([
      { kod: "W1", zavaznost: "varovanie", popis: "Varovanie {x}", parametre: { x: 1 } },
      {
        kod: "BR-CO-15",
        zavaznost: "chyba",
        popis: "Súčet {a} ≠ {b}",
        parametre: { a: 10, b: 12 },
      },
      { kod: "K", zavaznost: "chyba", popis: "Kategória {kat}", parametre: {}, kategoria: "S" },
      { nic: true },
    ]);
    expect(n.map((x) => x.kod)).toEqual(["BR-CO-15", "K", "W1"]);
    expect(n[0]).toEqual({ kod: "BR-CO-15", chyba: true, text: "Súčet 10 ≠ 12" });
    expect(n[1].text).toBe("Kategória S");
    expect(nalezyNaZobrazenie(null)).toEqual([]);
    expect(nalezyNaZobrazenie(Array(9).fill({ kod: "X", zavaznost: "chyba" }), 5)).toHaveLength(5);
  });
});
