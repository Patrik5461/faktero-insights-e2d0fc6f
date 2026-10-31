import { describe, expect, it } from "vitest";
import {
  bezPredponMailu,
  cisloZMenaSuboru,
  cisloZPredmetu,
  vyzeraAkoPredmetMailu,
} from "./predmet-mailu";
import { varovanieCislaZMailu } from "./pohoda-kontrola";

describe("predmet mailu ako číslo faktúry", () => {
  it("zhodí predpony preposlania aj opakované", () => {
    expect(bezPredponMailu("Fwd: FW: Re: Faktúra 12")).toBe("Faktúra 12");
    expect(bezPredponMailu("Faktúra 12")).toBe("Faktúra 12");
    expect(vyzeraAkoPredmetMailu("Fwd: FW: Dožiadanie_MaxiTicket s.r.o.")).toBe(true);
    expect(vyzeraAkoPredmetMailu("FV2026001")).toBe(false);
    expect(vyzeraAkoPredmetMailu("RE2026001")).toBe(false);
  });

  it("z predmetu vyberie len číslo dokladu", () => {
    expect(cisloZPredmetu("Faktúra 2026123")).toBe("2026123");
    expect(cisloZPredmetu("Fwd: Faktura c. FV-2026/0042")).toBe("FV-2026/0042");
    expect(cisloZPredmetu("FA č. 26/0042")).toBe("26/0042");
    expect(cisloZPredmetu("Invoice INV-10077 from Hetzner")).toBe("INV-10077");
    expect(cisloZPredmetu("2026123")).toBe("2026123");
  });

  it("dátum, obdobie a text bez čísla číslom nie sú", () => {
    expect(cisloZPredmetu("Fwd: Elektronická faktúra za obdobie 1.7.2026 - 31.7.2026")).toBeNull();
    expect(cisloZPredmetu("Fwd: D&C faktúra za obdobie 08/2026")).toBeNull();
    expect(cisloZPredmetu("Fwd: FW: Dožiadanie_MaxiTicket s.r.o.")).toBeNull();
    expect(cisloZPredmetu("Objednávka 4471 potvrdená")).toBeNull();
    expect(cisloZPredmetu(null)).toBeNull();
  });

  it("meno súboru len s číslom", () => {
    expect(cisloZMenaSuboru("FA-2026123.pdf")).toBe("FA-2026123");
    expect(cisloZMenaSuboru("faktura.pdf")).toBeNull();
    expect(cisloZMenaSuboru("Fwd  FW  Dožiadanie_MaxiTicket s.r.o..pdf")).toBeNull();
  });

  it("kontrola pred exportom upozorní na číslo z predmetu mailu", () => {
    const d = {
      _typPohody: "receivedInvoice",
      _povodneCislo: "Fwd: FW: Dožiadanie_MaxiTicket s.r.o.",
    };
    expect(varovanieCislaZMailu(d)).toContain("predmet e-mailu");
    expect(
      varovanieCislaZMailu({ _typPohody: "receivedInvoice", _povodneCislo: "bez čísla" }),
    ).toContain("nemá číslo");
    expect(
      varovanieCislaZMailu({ _typPohody: "receivedInvoice", _povodneCislo: "FV2026001" }),
    ).toBeNull();
    // Bloček sa nekontroluje.
    expect(varovanieCislaZMailu({ _povodneCislo: "Fwd: x" })).toBeNull();
  });
});
