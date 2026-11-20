import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { STLPCE } from "./datum-vystavenia.server";

/** Stĺpce `invoices` z vygenerovaných typov (Row). */
function stlpceFaktur(): Set<string> {
  const typy = readFileSync(
    path.resolve(__dirname, "../../integrations/supabase/types.ts"),
    "utf8",
  );
  const zaciatok = typy.indexOf("\n      invoices: {");
  const row = typy.indexOf("Row: {", zaciatok);
  const koniec = typy.indexOf("\n        }", row);
  const telo = typy.slice(row, koniec);
  return new Set([...telo.matchAll(/^\s{10}(\w+)\??:/gm)].map((m) => m[1]));
}

describe("kontrola pred odoslaním — stĺpce faktúry", () => {
  it("vyberá len stĺpce, ktoré tabuľka invoices má (inak padá každé odoslanie)", () => {
    const existuju = stlpceFaktur();
    expect(existuju.has("paid_at")).toBe(true);
    const zdroje = STLPCE.split(",").map((s) => {
      const x = s.trim();
      return x.includes(":") ? x.split(":")[1] : x;
    });
    const chybaju = zdroje.filter((c) => !existuju.has(c));
    expect(chybaju).toEqual([]);
  });

  it("deň úhrady daňového dokladu k platbe ide z paid_at pod menom payment_date", () => {
    expect(STLPCE).toMatch(/\bpayment_date:paid_at\b/);
  });
});
