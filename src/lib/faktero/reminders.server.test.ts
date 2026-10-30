import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { buildReminderContent } from "./reminders.server";

/*
  Okno upomienky dostávalo celý text aj s platobnými údajmi a podpisom a pri
  odoslaní sa pripojili znova — upomienka NK20260021 (QA, 30. 10. 2026) ich
  mala dvakrát. Okno teraz dostáva len `sprava`.
*/
describe("text upomienky", () => {
  const invoice = {
    invoice_number: "NK20260021",
    total: 23.01,
    currency: "EUR",
    due_date: "2026-09-30",
    variable_symbol: "260184",
  };
  const company = { name: "Test", country: "SK", iban: "SK3112000000198742637541" };

  it("upravená správa z okna nesie platobné údaje len raz", () => {
    const nahlad = buildReminderContent({ invoice, company, reminderNumber: 1 });
    const odoslana = buildReminderContent({
      invoice,
      company,
      reminderNumber: 1,
      overrideMessage: nahlad.sprava,
    });
    expect(odoslana.plain.split("Platobné údaje:").length - 1).toBe(1);
    expect(odoslana.plain.split("IBAN:").length - 1).toBe(1);
    expect(odoslana.plain).toBe(nahlad.plain);
    // Dátum ako na doklade, nie ISO.
    expect(odoslana.plain).toContain("30. 9. 2026");
    expect(odoslana.plain).not.toContain("2026-09-30");
  });
});

describe("upomienka českej firmy", () => {
  it("je po česky s dátumom ako na doklade (QA Česká, 30. 10. 2026)", () => {
    const r = buildReminderContent({
      invoice: {
        invoice_number: "20260011",
        total: 60.5,
        currency: "CZK",
        due_date: "2026-09-30",
        variable_symbol: "20260011",
      },
      company: { name: "QA Česká s.r.o.", country: "CZ", dic: "CZ25097563", ic_dph: "CZ25097563", iban: "CZ6508000000192000145399" },
      reminderNumber: 2,
    });
    expect(r.subject).toBe("2. upomínka: Faktura 20260011 je po splatnosti");
    expect(r.plain).toContain("toto je druhá upomínka k faktuře 20260011");
    expect(r.plain).toContain("Platební údaje:");
    expect(r.plain).toContain("Původní splatnost: 30. 9. 2026");
    expect(r.plain).not.toMatch(/Platobné|Pôvodná|dovoľujeme/);
    // DIČ a IČ DPH sú v Česku to isté číslo — v podpise len raz.
    expect(r.plain.split("CZ25097563").length - 1).toBe(1);
  });

  it("slovenská faktúra v češtine dostane českú upomienku, slovenská ostáva slovenská", () => {
    const sk = { name: "Test", country: "SK" };
    const inv = { invoice_number: "1", total: 1, currency: "EUR", due_date: "2026-09-30" };
    expect(buildReminderContent({ invoice: { ...inv, language: "cs" }, company: sk, reminderNumber: 1 }).subject).toMatch(/^Upomínka/);
    expect(buildReminderContent({ invoice: inv, company: sk, reminderNumber: 1 }).subject).toMatch(/^Upomienka/);
  });
});
