import { describe, expect, it } from "vitest";
import {
  nazovVyuctovania,
  polozkaZBlocku,
  polozkaZPrijatej,
  suhrnVyuctovania,
} from "./vyuctovanie-vydavkov";
import { pripravPlatby } from "./hromadny-prikaz";

const b1 = polozkaZBlocku({
  id: "b1",
  issue_date: "2026-10-02",
  supplier_name: "Slovnaft",
  total_amount: 61.5,
  vat_amount: 11.5,
  currency: "EUR",
});
const p1 = polozkaZPrijatej({
  id: "p1",
  issue_date: "2026-10-05",
  supplier_name: "Hotel",
  amount_without_vat: 100,
  vat_amount: 5,
  amount_total: 105,
  currency: "EUR",
});
const cz = polozkaZBlocku({ id: "b2", total_amount: 300, vat_amount: 0, currency: "CZK" });

describe("vyúčtovanie výdavkov", () => {
  it("vlastné zdroje: firma doplatí celú sumu", () => {
    const s = suhrnVyuctovania([b1, p1], "vlastne", 999);
    expect(s.spolu).toBe(166.5);
    expect(s.dph).toBe(16.5);
    expect(s.zaklad).toBe(150);
    expect(s.zaloha).toBe(0);
    expect(s.rozdiel).toBe(166.5);
    expect(s.vysledok).toBe("Firma doplatí zamestnancovi 166,50 EUR.");
  });

  it("záloha: preplatok vráti zamestnanec, nedoplatok doplatí firma", () => {
    expect(suhrnVyuctovania([b1, p1], "zaloha", 200).vysledok).toBe(
      "Zamestnanec vráti firme 33,50 EUR.",
    );
    expect(suhrnVyuctovania([b1], "zaloha", 50).rozdiel).toBe(11.5);
    expect(suhrnVyuctovania([b1], "zaloha", 61.5).vysledok).toMatch(/Vyrovnané/);
  });

  it("firemná karta nič nedopláca; doklad v inej mene sa nesčíta", () => {
    const s = suhrnVyuctovania([b1, cz], "karta", 100);
    expect(s.rozdiel).toBe(0);
    expect(s.spolu).toBe(61.5);
    expect(s.inaMena).toBe(1);
    expect(s.vysledok).toMatch(/firemnou kartou/);
  });

  it("navrhnutý názov podľa mena a obdobia", () => {
    expect(nazovVyuctovania("Ján Novák", "2026-10-01", "2026-10-31")).toBe(
      "Vyúčtovanie výdavkov – Ján Novák – 10/2026",
    );
    expect(nazovVyuctovania("", "2026-09-01", "2026-10-31")).toBe(
      "Vyúčtovanie výdavkov – 09/2026–10/2026",
    );
    expect(nazovVyuctovania(null)).toBe("Vyúčtovanie výdavkov");
  });

  it("prijatá faktúra vo vyúčtovaní sa neplatí hromadným príkazom", () => {
    const { platby, preskocene } = pripravPlatby([
      {
        id: "f1",
        invoice_number: "1",
        supplier_name: "Hotel",
        supplier_iban: "SK3112000000198742637541",
        amount_total: 105,
        currency: "EUR",
        due_date: "2026-10-20",
        status: "received",
        vyuctovanie_id: "v1",
      },
    ]);
    expect(platby).toHaveLength(0);
    expect(preskocene[0].dovod).toMatch(/zamestnanec/);
  });
});
