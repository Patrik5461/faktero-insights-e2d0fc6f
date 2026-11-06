import { describe, expect, it } from "vitest";
import { OKNO_UDALOSTI_MS, UDALOSTI_Z_KLIENTA, prekazkaUdalosti } from "./webhook-udalost-klienta";

const TERAZ = Date.parse("2026-11-06T12:00:00Z");
const pred = (ms: number) => new Date(TERAZ - ms).toISOString();

describe("udalosti webhooku z prehliadača", () => {
  it("úhradu ani storno klient vyvolať nesmie", () => {
    expect(UDALOSTI_Z_KLIENTA).not.toContain("invoice.paid" as any);
    expect(UDALOSTI_Z_KLIENTA).not.toContain("invoice.cancelled" as any);
  });
  it("invoice.created len čerstvo vytvorená a nezmazaná", () => {
    expect(prekazkaUdalosti("invoice.created", { created_at: pred(5_000) }, TERAZ)).toBeNull();
    expect(prekazkaUdalosti("invoice.created", { created_at: pred(OKNO_UDALOSTI_MS + 1) }, TERAZ)).toBeTruthy();
    expect(prekazkaUdalosti("invoice.created", { created_at: pred(5_000), deleted_at: "x" }, TERAZ)).toBeTruthy();
    expect(prekazkaUdalosti("invoice.created", null, TERAZ)).toBeTruthy();
  });
  it("invoice.sent len pri odoslanej faktúre", () => {
    expect(prekazkaUdalosti("invoice.sent", { status: "sent", sent_at: pred(1000) }, TERAZ)).toBeNull();
    expect(prekazkaUdalosti("invoice.sent", { status: "issued", sent_at: pred(1000) }, TERAZ)).toBeTruthy();
    expect(prekazkaUdalosti("invoice.sent", { status: "sent", sent_at: null }, TERAZ)).toBeTruthy();
    expect(prekazkaUdalosti("invoice.sent", { status: "sent", sent_at: pred(OKNO_UDALOSTI_MS * 4) }, TERAZ)).toBeTruthy();
  });
  it("customer.created len čerstvý kontakt", () => {
    expect(prekazkaUdalosti("customer.created", { created_at: pred(1000) }, TERAZ)).toBeNull();
    expect(prekazkaUdalosti("customer.created", { created_at: "2025-01-01T00:00:00Z" }, TERAZ)).toBeTruthy();
  });
});
