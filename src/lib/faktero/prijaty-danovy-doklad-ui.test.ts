import { describe, expect, it } from "vitest";
import {
  filterTypuPrijatych,
  nazovPrijatehoDokladu,
  obsadzujeZalohu,
  typZoznamuPrijatych,
  zalohaVolnaPreDanovy,
} from "./prijaty-danovy-doklad";
import { nezaplateneZoznamu, typPrijatejFaktury } from "./uhrady-prijatej";

describe("Prijaté daňové doklady — zoznam a detail", () => {
  it("parameter type=danove v každom tvare, inak bežné faktúry", () => {
    expect(filterTypuPrijatych("danove")).toBe("danove");
    expect(filterTypuPrijatych(" Danove ")).toBe("danove");
    expect(filterTypuPrijatych("credit")).toBeUndefined();
    expect(filterTypuPrijatych(undefined)).toBeUndefined();
    expect(typZoznamuPrijatych(filterTypuPrijatych("danove"))).toBe("advance_payment");
    expect(typZoznamuPrijatych(filterTypuPrijatych(""))).toBe("regular");
  });

  it("nadpis a typ dokladu", () => {
    expect(nazovPrijatehoDokladu({ type: "advance_payment" })).toBe("Daňový doklad k prijatej platbe");
    expect(nazovPrijatehoDokladu({ type: "proforma" })).toBe("Prijatá zálohová faktúra");
    expect(nazovPrijatehoDokladu({ type: "regular", amount_total: -5 })).toBe("Prijatý dobropis");
    expect(typPrijatejFaktury({ type: "advance_payment", supplier_country: "SK" })).toBe(
      "Daňový doklad k prijatej platbe – tuzemský",
    );
    expect(typPrijatejFaktury({ type: "advance_payment", supplier_country: "CZ" })).toBe(
      "Daňový doklad k prijatej platbe – zahraničný",
    );
  });

  it("daňový doklad nie je nezaplatený záväzok ani keby nemal stav paid", () => {
    const r = nezaplateneZoznamu(
      [
        { id: "d", type: "advance_payment", status: "received", amount_total: 123, due_date: "2020-01-01" },
        { id: "f", type: "regular", status: "received", amount_total: 50, due_date: "2020-01-01" },
      ],
      {},
      {},
      "2026-11-16",
    );
    expect(r.nezaplatene).toBe(50);
    expect(r.poSplatnosti).toBe(1);
  });

  it("daňový doklad neobsadzuje zálohu pre vyúčtovaciu faktúru; druhý daňový doklad áno", () => {
    expect(obsadzujeZalohu({ type: "advance_payment" })).toBe(false);
    expect(obsadzujeZalohu({ type: "regular" })).toBe(true);
    const doklady = [
      { id: "f", type: "regular", advance_invoice_id: "z1" },
      { id: "d", type: "advance_payment", advance_invoice_id: "z2" },
    ];
    expect(zalohaVolnaPreDanovy("z1", doklady)).toBe(true);
    expect(zalohaVolnaPreDanovy("z2", doklady)).toBe(false);
    expect(zalohaVolnaPreDanovy("z2", doklady, "d")).toBe(true);
  });
});
