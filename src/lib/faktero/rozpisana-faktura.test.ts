import { beforeEach, describe, expect, it } from "vitest";
import {
  bezDatumov,
  maObsah,
  nacitajRozpisanu,
  odlozRozpisanu,
  zahodRozpisanu,
} from "./rozpisana-faktura";

// Node nemá `window.localStorage` — stačí jednoduchá náhrada v pamäti.
const pamat = new Map<string, string>();
const localStorage = {
  getItem: (k: string) => pamat.get(k) ?? null,
  setItem: (k: string, v: string) => void pamat.set(k, v),
  removeItem: (k: string) => void pamat.delete(k),
  clear: () => pamat.clear(),
};
(globalThis as any).window = { localStorage };

describe("rozpísaná faktúra", () => {
  beforeEach(() => localStorage.clear());

  it("odloží a vráti formulár firmy a druhu dokladu", () => {
    odlozRozpisanu("f1", "regular", { customer_id: "c1", notes: "x" }, [
      { name: "Práca", unit_price: 10 },
    ]);
    const d = nacitajRozpisanu<any, any>("f1", "regular");
    expect(d?.form.customer_id).toBe("c1");
    expect(d?.items[0].name).toBe("Práca");
    expect(nacitajRozpisanu("f2", "regular")).toBeNull();
    expect(nacitajRozpisanu("f1", "proforma")).toBeNull();
  });

  it("prázdny formulár staršiu rozpísanú neprepíše", () => {
    odlozRozpisanu("f1", "regular", { customer_id: "c1" }, []);
    odlozRozpisanu("f1", "regular", { customer_id: "" }, [{ name: "  " }]);
    expect(nacitajRozpisanu<any, any>("f1", "regular")?.form.customer_id).toBe("c1");
    expect(maObsah({ customer_id: "" }, [{ name: "" }])).toBe(false);
  });

  it("po týždni ani po vystavení sa neponúka", () => {
    odlozRozpisanu("f1", "regular", { customer_id: "c1" }, []);
    expect(nacitajRozpisanu("f1", "regular", Date.now() + 8 * 86_400_000)).toBeNull();
    zahodRozpisanu("f1", "regular");
    expect(nacitajRozpisanu("f1", "regular")).toBeNull();
  });

  it("dátumy sa pri obnovení nepreberajú", () => {
    expect(bezDatumov({ issue_date: "a", due_date: "b", delivery_date: "c", notes: "n" })).toEqual({
      notes: "n",
    });
  });
});
