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
