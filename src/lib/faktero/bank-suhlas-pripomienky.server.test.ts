import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

const { zostavUpozornenia, textUpozorneniaSuhlasu } =
  await import("./bank-suhlas-pripomienky.server");

const teraz = new Date("2026-10-31T10:00:00Z");
const F = "f0000000-0000-4000-8000-000000000001";

const pripojenie = (o: Partial<any> = {}) => ({
  id: "c0000000-0000-4000-8000-000000000001",
  company_id: F,
  provider: "tatrabanka",
  status: "connected",
  token_expires_at: "2026-11-10T12:00:00Z",
  ...o,
});
const ucet = (o: Partial<any> = {}) => ({
  id: "a0000000-0000-4000-8000-000000000001",
  company_id: F,
  iban: "SK2909000000005220542779",
  account_name: null,
  pohyby_ok_at: "2026-10-01T07:26:07Z",
  pohyby_chyba: "Súhlas banky na čítanie pohybov vypršal — obnovte ho (Obnoviť súhlas).",
  unavailable_since: null,
  ...o,
});

describe("upozornenia na súhlas banky", () => {
  it("súhlas, ktorý vyprší do 14 dní, dostane jedno upozornenie s dňom konca", () => {
    const u = zostavUpozornenia([pripojenie()], [], teraz);
    expect(u).toHaveLength(1);
    expect(u[0]).toMatchObject({ druh: "suhlas_14", termin: "2026-11-10", company_id: F });
    expect(u[0].popis).toContain("10. 11. 2026");
  });

  it("platný súhlas, odpojené pripojenie a iné banky nič nehlásia", () => {
    expect(
      zostavUpozornenia(
        [
          pripojenie({ token_expires_at: "2027-02-03T19:35:07Z" }),
          pripojenie({ status: "disconnected" }),
          pripojenie({ provider: "revolut", token_expires_at: "2026-10-31T10:30:00Z" }),
        ],
        [],
        teraz,
      ),
    ).toEqual([]);
  });

  it("účet, z ktorého sa pre vypršaný súhlas nesťahujú pohyby, sa ohlási", () => {
    const u = zostavUpozornenia([], [ucet()], teraz);
    expect(u).toEqual([
      expect.objectContaining({ druh: "pohyby", termin: "2026-10-01", ref_id: ucet().id }),
    ]);
    expect(u[0].popis).toContain("od 1. 10. 2026");
  });

  it("výpadok banky (5xx), čerstvá chyba a nedostupný účet e-mail nespustia", () => {
    expect(
      zostavUpozornenia(
        [],
        [
          ucet({ pohyby_chyba: "Banka je dočasne nedostupná — pohyby sa skúsia stiahnuť znova." }),
          ucet({ pohyby_ok_at: "2026-10-30T09:20:00Z" }),
          ucet({ unavailable_since: "2026-10-30T09:20:00Z" }),
        ],
        teraz,
      ),
    ).toEqual([]);
  });

  it("e-mail má tlačidlo Obnoviť súhlas a meno firmy je escapované", () => {
    const { html, text } = textUpozorneniaSuhlasu(
      "<b>Firma</b>",
      zostavUpozornenia([pripojenie()], [], teraz),
    );
    expect(html).toContain("Obnoviť súhlas");
    expect(html).toContain("https://www.faktero.sk/bankove-ucty");
    expect(html).not.toContain("<b>Firma</b>");
    expect(text).toContain("nezmažú");
  });
});
