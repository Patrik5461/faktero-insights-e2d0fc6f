import { describe, expect, it } from "vitest";
import {
  datumBratislava,
  mailyDoCsv,
  rozsahObdobia,
  suhrnMailov,
  typDokladuDruhu,
  vObdobi,
  vytazenieStrazcu,
  type OdoslanyMail,
} from "./odoslane-maily";

const mail = (o: Partial<OdoslanyMail>): OdoslanyMail => ({
  id: Math.random().toString(36).slice(2),
  cas: "2026-11-02T10:00:00Z",
  druh: "faktura",
  adresati: ["a@x.example"],
  pocet: 1,
  stav: "odoslane",
  predmet: "Faktúra 2026001",
  chyba: null,
  cez: "resend",
  doklad: null,
  odberatel: null,
  kto: null,
  zdroj: "evidencia",
  ...o,
});

describe("súhrn odoslaných e-mailov", () => {
  it("ráta e-maily, adresátov, chyby a zastavené zvlášť", () => {
    const s = suhrnMailov([
      mail({ adresati: ["a@x.example", "b@x.example"], pocet: 2, odberatel: "Alfa" }),
      mail({ druh: "upomienka", cas: "2026-11-03T08:00:00Z", odberatel: "Alfa s.r.o." }),
      mail({ druh: "ponuka", adresati: ["c@y.example"], stav: "zlyhalo", chyba: "550" }),
      mail({ druh: "faktura", adresati: [], pocet: 40, stav: "zastavene" }),
      mail({ druh: "podklady", adresati: ["uctovnik@z.example"], cez: "smtp", kto: "Jana" }),
    ]);
    expect(s.emailov).toBe(3);
    expect(s.adresatov).toBe(4);
    expect(s.roznychAdresatov).toBe(3);
    expect(s.zlyhalo).toBe(1);
    expect(s.zastavene).toBe(1);
    expect(s.cezSmtp).toBe(1);
    expect(s.poDruhoch.map((d) => [d.druh, d.emailov, d.chyby])).toEqual([
      ["faktura", 1, 1],
      ["upomienka", 1, 0],
      ["ponuka", 0, 1],
      ["podklady", 1, 0],
    ]);
    const a = s.poAdresatoch[0];
    expect(a.adresa).toBe("a@x.example");
    expect(a.emailov).toBe(2);
    // Odberateľ a posledné odoslanie z najnovšieho e-mailu.
    expect(a.posledne).toBe("2026-11-03T08:00:00Z");
    expect(a.odberatel).toBe("Alfa s.r.o.");
    expect(a.druhy).toEqual(["faktura", "upomienka"]);
    const c = s.poAdresatoch.find((x) => x.adresa === "c@y.example")!;
    expect([c.emailov, c.chyby]).toEqual([0, 1]);
    expect(s.poOdosielateloch).toEqual([
      { kto: null, emailov: 2 },
      { kto: "Jana", emailov: 1 },
    ]);
  });

  it("prázdny zoznam", () => {
    const s = suhrnMailov([]);
    expect([s.emailov, s.adresatov, s.poDruhoch.length, s.poAdresatoch.length]).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it("doklad podľa druhu e-mailu", () => {
    expect(typDokladuDruhu("upomienka")).toBe("faktura");
    expect(typDokladuDruhu("ponuka")).toBe("ponuka");
    expect(typDokladuDruhu("samofaktura")).toBe("prijata");
    expect(typDokladuDruhu("pozvanka")).toBeNull();
  });
});

describe("obdobie", () => {
  it("tento a minulý mesiac, rok, vlastné", () => {
    expect(rozsahObdobia("mesiac", "2026-11-03")).toEqual({ od: "2026-11-01", do: "2026-11-03" });
    expect(rozsahObdobia("minuly", "2026-11-03")).toEqual({ od: "2026-10-01", do: "2026-10-31" });
    expect(rozsahObdobia("minuly", "2026-01-15")).toEqual({ od: "2025-12-01", do: "2025-12-31" });
    expect(rozsahObdobia("minuly", "2026-03-10")).toEqual({ od: "2026-02-01", do: "2026-02-28" });
    expect(rozsahObdobia("rok", "2026-11-03")).toEqual({ od: "2026-01-01", do: "2026-11-03" });
    expect(rozsahObdobia("vlastne", "2026-11-03", { od: "2026-10-20", do: "2026-10-01" })).toEqual(
      { od: "2026-10-01", do: "2026-10-20" },
    );
  });

  it("deň sa ráta v bratislavskom čase", () => {
    // 31. 10. 23:30 UTC je v Bratislave už 1. 11. (zimný čas +1).
    expect(datumBratislava("2026-10-31T23:30:00Z")).toBe("2026-11-01");
    expect(vObdobi("2026-10-31T23:30:00Z", { od: "2026-11-01", do: "2026-11-30" })).toBe(true);
    expect(vObdobi("2026-10-31T22:59:00Z", { od: "2026-11-01", do: "2026-11-30" })).toBe(false);
  });
});

describe("strážca", () => {
  it("rôzni adresáti za 24 h a adresáti za hodinu, bez zlyhaných", () => {
    const teraz = Date.parse("2026-11-03T12:00:00Z");
    const v = vytazenieStrazcu(
      [
        { cas: "2026-11-03T11:30:00Z", adresati: ["a@x", "B@x"], pocet: 2, stav: "odoslane" },
        { cas: "2026-11-03T09:00:00Z", adresati: ["a@x"], pocet: 1, stav: "odoslane" },
        { cas: "2026-11-03T11:50:00Z", adresati: ["c@x"], pocet: 1, stav: "zlyhalo" },
        { cas: "2026-11-02T11:00:00Z", adresati: ["d@x"], pocet: 1, stav: "odoslane" },
      ],
      teraz,
    );
    expect(v).toEqual({ zaDen: 2, zaHodinu: 2 });
  });
});

describe("CSV", () => {
  it("hlavička, stav a doklad; bodkočiarka v predmete v úvodzovkách", () => {
    const csv = mailyDoCsv([
      mail({
        cas: "2026-11-02T10:05:00Z",
        predmet: "Faktúra; november",
        doklad: { typ: "faktura", id: "1", cislo: "2026001" },
        odberatel: "Alfa",
        stav: "zlyhalo",
        chyba: "Mailbox full",
      }),
    ]);
    const [hlavicka, riadok] = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(hlavicka.split(";")[0]).toBe("Dátum a čas");
    expect(riadok).toContain("2026-11-02 11:05");
    expect(riadok).toContain('"Faktúra; november"');
    expect(riadok).toContain("2026001");
    expect(riadok).toContain("Chyba");
    expect(riadok).toContain("Mailbox full");
    expect(riadok).toContain("Automaticky");
  });
});
