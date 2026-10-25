import { describe, expect, it } from "vitest";
import { intNoteSEfakturou, prveOdoslanie } from "./efaktura-odoslana";

describe("eFaktúra už odoslaná — poznámka pre Pohodu", () => {
  it("veta ide pred internú poznámku, bez odoslania sa nič nemení", () => {
    expect(intNoteSEfakturou("zákazka 12", "2026-10-24T18:00:00Z")).toBe(
      "Odoslané ako eFaktúra z Faktera 24. 10. 2026 — cez Peppol znova neposielať. zákazka 12",
    );
    expect(intNoteSEfakturou("zákazka 12", null)).toBe("zákazka 12");
  });
  it("prvé neodmietnuté odoslanie; zlyhané sa nerátajú", () => {
    const r = prveOdoslanie(
      [
        { id: "d1", invoice_id: "f1" },
        { id: "d2", invoice_id: "f2" },
      ],
      [
        { document_id: "d1", status: "failed", created_at: "2026-10-20T10:00:00Z" },
        { document_id: "d1", status: "sent", created_at: "2026-10-21T10:00:00Z" },
        { document_id: "d2", status: "rejected", created_at: "2026-10-22T10:00:00Z" },
      ],
    );
    expect(r).toEqual({ f1: "2026-10-21T10:00:00Z" });
  });
});

describe("množstvo pre Pohodu", async () => {
  const { mnozstvoPohody } = await import("./export.server");
  it("najviac štyri desatinné miesta", () => {
    expect(mnozstvoPohody(1.234567)).toBe(1.2346);
    expect(mnozstvoPohody(2)).toBe(2);
    expect(mnozstvoPohody(-0.00001)).toBe(0);
  });
});
