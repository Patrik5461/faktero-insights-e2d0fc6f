import { describe, expect, it } from "vitest";
import { csvHodnota, naCsv, nazovSuboru, rozdelPodlaKosa, sprievodnyText } from "./export-firmy";

describe("CSV", () => {
  it("bodkočiarka, úvodzovky a zlom riadka sa zabalia", () => {
    expect(csvHodnota("a;b")).toBe('"a;b"');
    expect(csvHodnota('povedal "ahoj"')).toBe('"povedal ""ahoj"""');
    expect(csvHodnota("prvý\ndruhý")).toBe('"prvý\ndruhý"');
    expect(csvHodnota(null)).toBe("");
  });

  it("objekt sa uloží ako JSON, nie ako [object Object]", () => {
    // Zabalené do úvodzoviek, inak by bodkočiarky v JSON rozbili riadok.
    expect(csvHodnota({ a: 1, b: "x;y" })).toBe('"{""a"":1,""b"":""x;y""}"');
  });

  it("hlavička pokryje všetky stĺpce zo všetkých riadkov", () => {
    const csv = naCsv([{ a: 1 }, { b: 2 }]);
    const [hlavicka, prvy] = csv.replace(/^﻿/, "").split("\r\n");
    expect(hlavicka).toBe("a;b");
    expect(prvy).toBe("1;");
  });

  it("súbor začína BOM, inak Excel zje diakritiku", () => {
    expect(naCsv([{ mesto: "Žilina" }]).startsWith("﻿")).toBe(true);
  });
});

describe("názvy v balíku", () => {
  it("diakritika a lomky sa nahradia", () => {
    expect(nazovSuboru("2026/001 Faktúra", "pdf")).toBe("2026-001-Faktura.pdf");
  });

  it("prázdny názov nezhodí balík", () => {
    expect(nazovSuboru("", "pdf")).toBe("subor.pdf");
  });
});

describe("sprievodný text", () => {
  it("povie, čo je v balíku, a pripomenie desať rokov", () => {
    const t = sprievodnyText("Firma s.r.o.", "24. 9. 2026");
    expect(t).toContain("Firma s.r.o.");
    expect(t).toContain("faktury.csv");
    expect(t).toContain("desať rokov");
  });
});

describe("export firmy bez tajných stĺpcov", () => {
  it("vynechá tokeny a šifrované hodnoty", () => {
    const csv = naCsv([
      {
        cislo: "1",
        public_token: "x",
        pdf_token: "y",
        approval_token: "z",
        smtp_heslo_sifrovane: "q",
      },
    ]);
    const hlavicka = csv.replace("﻿", "").split("\r\n")[0];
    expect(hlavicka).toBe("cislo");
  });
});

describe("kôš v exporte", () => {
  it("riadky s deleted_at idú bokom, ostatné ostanú", () => {
    const { zive, vKosi } = rozdelPodlaKosa([
      { id: 1, deleted_at: null },
      { id: 2, deleted_at: "2026-10-01T10:00:00Z" },
      { id: 3 },
    ]);
    expect(zive.map((r) => r.id)).toEqual([1, 3]);
    expect(vKosi.map((r) => r.id)).toEqual([2]);
  });

  it("sprievodný text vysvetlí priečinok koša", () => {
    expect(sprievodnyText("F", "dnes")).toContain("kos/");
  });
});
