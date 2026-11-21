import { describe, expect, it } from "vitest";
import { podmienkaUhrady, pouziFiltrePrijatych } from "./prijate-filtre-zoznamu";

function zaznam() {
  const volania: string[] = [];
  const q: any = {
    not: (s: string, op: string, v: unknown) => (volania.push(`not ${s} ${op} ${v}`), q),
    is: (s: string, v: unknown) => (volania.push(`is ${s} ${v}`), q),
    or: (p: string) => (volania.push(`or ${p}`), q),
  };
  return { q, volania };
}

describe("filtre prijatých faktúr", () => {
  it("zaúčtovanie podľa zauctovane_at", () => {
    const a = zaznam();
    pouziFiltrePrijatych(a.q, { zauct: "ano" });
    expect(a.volania).toEqual(["not zauctovane_at is null"]);
    const b = zaznam();
    pouziFiltrePrijatych(b.q, { zauct: "nie" });
    expect(b.volania).toEqual(["is zauctovane_at null"]);
  });

  it("úhrada mapuje slovenské aj anglické kódy, prevod aj prázdny", () => {
    expect(podmienkaUhrady("hotovost")).toBe("payment_method.in.(hotovost,cash)");
    expect(podmienkaUhrady("karta")).toBe("payment_method.in.(karta,card,credit_card)");
    expect(podmienkaUhrady("prevod")).toBe(
      "payment_method.is.null,payment_method.in.(prevod,bank_transfer,transfer)",
    );
  });

  it("neznáma hodnota nefiltruje", () => {
    const a = zaznam();
    pouziFiltrePrijatych(a.q, { zauct: "x", uhrada: "bitcoin" });
    expect(a.volania).toEqual([]);
  });
});
