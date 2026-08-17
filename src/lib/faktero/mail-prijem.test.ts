import { describe, expect, it } from "vitest";
import {
  slugFirmy,
  zostavLocalPart,
  celaAdresa,
  vyberLocalPart,
  jePrilohaDoklad,
  cislo,
  datum,
  zostavPrijatuFakturu,
  podomenaDokladov,
  overVlastnyLocalPart,
  polozkyDokladu,
} from "./mail-prijem";

describe("adresa na príjem dokladov", () => {
  it("zo názvu firmy spraví čitateľný slug bez diakritiky a právnej formy", () => {
    expect(slugFirmy("MaxiTicket s.r.o.")).toBe("maxiticket");
    expect(slugFirmy("PALIERA s.r.o.")).toBe("paliera");
    expect(slugFirmy("Modular Green Energy, SE")).toBe("modular-green-energy");
    expect(slugFirmy("Žltý kôň a.s.")).toBe("zlty-kon");
  });

  it("firmu bez použiteľného názvu nenechá bez slugu", () => {
    expect(slugFirmy("")).toBe("firma");
    expect(slugFirmy("s.r.o.")).toBe("firma");
  });

  it("chvost je predvídateľný, keď mu podstrčíme náhodu", () => {
    const local = zostavLocalPart("MaxiTicket s.r.o.", () => 0);
    expect(local).toBe("maxiticket-aaaaaa");
    expect(celaAdresa(local)).toBe("maxiticket-aaaaaa@doklady.faktero.sk");
  });
});

describe("výber adresáta z prijatého mailu", () => {
  it("nájde našu adresu aj keď nie je prvá a je v tvare Meno <adresa>", () => {
    expect(
      vyberLocalPart([
        "Patrik <patrik@tobify.sk>",
        "Účtovníčka <uctovnicka@firma.sk>",
        "MaxiTicket <maxiticket-k7f2p9@doklady.faktero.sk>",
      ]),
    ).toBe("maxiticket-k7f2p9");
  });

  it("plusovú časť zahodí a veľké písmená neprekážajú", () => {
    expect(vyberLocalPart(["MaxiTicket-K7F2P9+august@Doklady.Faktero.SK"])).toBe(
      "maxiticket-k7f2p9",
    );
  });

  it("mail pre inú doménu ignoruje", () => {
    expect(vyberLocalPart(["podpora@faktero.sk", "nieco@example.com"])).toBeNull();
    expect(vyberLocalPart([])).toBeNull();
    expect(vyberLocalPart([null, undefined, ""])).toBeNull();
  });
});

describe("výber príloh", () => {
  it("berie PDF a fotky", () => {
    expect(jePrilohaDoklad("application/pdf", "faktura.pdf")).toBe(true);
    expect(jePrilohaDoklad("image/jpeg", "IMG_1.jpg")).toBe(true);
  });

  it("PDF poslané ako octet-stream pozná podľa prípony", () => {
    expect(jePrilohaDoklad("application/octet-stream", "faktura_2026_08.PDF")).toBe(true);
  });

  it("podpisy a tabuľky neberie", () => {
    expect(jePrilohaDoklad("image/gif", "podpis.gif")).toBe(false);
    expect(jePrilohaDoklad("application/vnd.ms-excel", "prehlad.xls")).toBe(false);
    expect(jePrilohaDoklad(null, null)).toBe(false);
  });
});

describe("čísla a dátumy z dokladu", () => {
  it("prečíta slovenský aj anglický zápis sumy", () => {
    expect(cislo("1 234,56 €")).toBe(1234.56);
    expect(cislo("1.234,56")).toBe(1234.56);
    expect(cislo("1,234.56")).toBe(1234.56);
    expect(cislo(99.9)).toBe(99.9);
    expect(cislo("—")).toBeNull();
  });

  it("dátum prevedie na tvar databázy a prázdny nechá ako null", () => {
    expect(datum("2026-08-13")).toBe("2026-08-13");
    expect(datum("13.8.2026")).toBe("2026-08-13");
    expect(datum("13. 08. 2026")).toBe("2026-08-13");
    // Prázdny reťazec do date stĺpca je opakujúca sa chyba — musí byť null.
    expect(datum("")).toBeNull();
    expect(datum("  ")).toBeNull();
    expect(datum("neviem")).toBeNull();
  });
});

describe("zostavenie prijatej faktúry z mailu", () => {
  const zaklad = {
    odosielatel: "fakturacia@dodavatel.sk",
    predmet: "Faktúra 2026123",
    nazovSuboru: "faktura.pdf",
    dnes: "2026-08-13",
  };

  it("prepíše prečítané údaje a IBAN dá bez medzier", () => {
    const f = zostavPrijatuFakturu({
      ...zaklad,
      ai: {
        supplier_name: "Dodávateľ s.r.o.",
        supplier_ico: "12345678",
        supplier_iban: "SK31 1200 0000 1987 4263 7541",
        invoice_number: "2026123",
        issue_date: "1.8.2026",
        due_date: "15.8.2026",
        amount_without_vat: "100,00",
        vat_amount: "23,00",
        amount_total: "123,00",
        currency: "eur",
      },
    });
    expect(f.supplier_iban).toBe("SK3112000000198742637541");
    expect(f.invoice_number).toBe("2026123");
    expect(f.issue_date).toBe("2026-08-01");
    expect(f.due_date).toBe("2026-08-15");
    expect(f.amount_total).toBe(123);
    expect(f.currency).toBe("EUR");
    expect(f.status).toBe("draft");
    expect(f.note).toContain("fakturacia@dodavatel.sk");
  });

  it("dopočíta chýbajúci člen trojice súm", () => {
    const f = zostavPrijatuFakturu({
      ...zaklad,
      ai: { amount_without_vat: 100, vat_amount: 23 },
    });
    expect(f.amount_total).toBe(123);

    const g = zostavPrijatuFakturu({
      ...zaklad,
      ai: { amount_total: 123, vat_amount: 23 },
    });
    expect(g.amount_without_vat).toBe(100);
  });

  it("keď AI neprečíta nič, doklad aj tak vznikne s povinnými poľami", () => {
    const f = zostavPrijatuFakturu({ ...zaklad, ai: null });
    expect(f.supplier_name).toBe("Neurčený dodávateľ");
    // Číslo dokladu zoberie z predmetu mailu, nech sa dá nájsť.
    expect(f.invoice_number).toBe("Faktúra 2026123");
    expect(f.issue_date).toBe("2026-08-13");
    expect(f.due_date).toBe("2026-08-13");
    expect(f.amount_total).toBe(0);
  });

  it("bez predmetu siahne po názve súboru", () => {
    const f = zostavPrijatuFakturu({ ...zaklad, predmet: null, ai: {} });
    expect(f.invoice_number).toBe("faktura");
  });
});

describe("doména sa dá prepnúť nastavením", () => {
  it("bez nastavenia platí vlastná poddoména", () => {
    expect(podomenaDokladov(undefined)).toBe("doklady.faktero.sk");
    expect(podomenaDokladov("")).toBe("doklady.faktero.sk");
  });

  it("nastavenie prebije predvolenú doménu a znesie aj zavináč navyše", () => {
    expect(podomenaDokladov("abc123.resend.app")).toBe("abc123.resend.app");
    expect(podomenaDokladov("@ABC123.Resend.App ")).toBe("abc123.resend.app");
  });

  it("adresát sa hľadá na nastavenej doméne, nie na predvolenej", () => {
    const podomena = podomenaDokladov("abc123.resend.app");
    expect(vyberLocalPart(["maxiticket-k7f2p9@abc123.resend.app"], podomena)).toBe(
      "maxiticket-k7f2p9",
    );
    // Na starú doménu už mail nepatrí.
    expect(vyberLocalPart(["maxiticket-k7f2p9@doklady.faktero.sk"], podomena)).toBeNull();
  });
});

describe("vlastná adresa na doklady", () => {
  it("z ľudského zápisu spraví použiteľnú adresu", () => {
    expect(overVlastnyLocalPart("Píla 2026")).toEqual({ ok: true, hodnota: "pila-2026" });
    expect(overVlastnyLocalPart("  DOKLADY__2026  ")).toEqual({
      ok: true,
      hodnota: "doklady-2026",
    });
    expect(overVlastnyLocalPart("-nakup-")).toEqual({ ok: true, hodnota: "nakup" });
  });

  it("odmietne prikrátku, pridlhú a prázdnu", () => {
    expect(overVlastnyLocalPart("ab").ok).toBe(false);
    expect(overVlastnyLocalPart("!!!").ok).toBe(false);
    expect(overVlastnyLocalPart("a".repeat(41)).ok).toBe(false);
  });

  it("nepustí vyhradené mená", () => {
    for (const m of ["postmaster", "ADMIN", "Info", "faktero"]) {
      expect(overVlastnyLocalPart(m).ok).toBe(false);
    }
  });

  it("výsledok je vždy platná ľavá časť adresy", () => {
    for (const vstup of ["Ľuboš & Co.", "firma---2026", "ŠTÚDIO 1"]) {
      const o = overVlastnyLocalPart(vstup);
      expect(o.ok).toBe(true);
      if (o.ok) expect(o.hodnota).toMatch(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
    }
  });
});

describe("položky prečítané z dokladu", () => {
  it("prevezme riadky a doplní chýbajúce hodnoty ako null", () => {
    expect(
      polozkyDokladu([
        { name: "Kancelársky papier A4", quantity: 10, unit: "bal.", unit_price: 4.5, total: 45 },
        { name: "Tonery" },
      ]),
    ).toEqual([
      {
        name: "Kancelársky papier A4",
        quantity: 10,
        unit: "bal.",
        unit_price: 4.5,
        vat_rate: null,
        total: 45,
      },
      { name: "Tonery", quantity: null, unit: null, unit_price: null, vat_rate: null, total: null },
    ]);
  });

  it("súčtové riadky medzi položky nepustí", () => {
    const v = polozkyDokladu([
      { name: "Tovar" },
      { name: "Spolu k úhrade" },
      { name: "DPH 23 %" },
      { name: "Zaokrúhlenie" },
    ]);
    expect(v?.map((p) => p.name)).toEqual(["Tovar"]);
  });

  it("z prázdneho alebo nezmyselného vstupu vráti null", () => {
    expect(polozkyDokladu([])).toBeNull();
    expect(polozkyDokladu(null)).toBeNull();
    expect(polozkyDokladu("nič")).toBeNull();
    expect(polozkyDokladu([{ quantity: 2 }])).toBeNull();
  });

  it("zostavená faktúra položky prenesie", () => {
    const f = zostavPrijatuFakturu({
      ai: { supplier_name: "Lipa", items: [{ name: "Papier", quantity: 2 }] },
      odosielatel: null,
      predmet: null,
      nazovSuboru: null,
      dnes: "2026-08-17",
    });
    expect(f.items?.[0]?.name).toBe("Papier");
  });
});
