import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { OdoslanieEfaktury } from "./OdoslanieEfaktury";

const firmaId = "11111111-1111-1111-1111-111111111111";
const f = (status: string, type: string) => ({
  id: "22222222-2222-2222-2222-222222222222",
  invoice_number: "FA20260001",
  status,
  type,
});

describe("tlačidlo Odoslať eFaktúru v appke", () => {
  it("vystavená faktúra má tlačidlo", () => {
    const html = renderToString(
      <OdoslanieEfaktury firmaId={firmaId} faktura={f("issued", "regular")} />,
    );
    expect(html).toContain("Odoslať eFaktúru");
  });

  it("zálohová povie, prečo nie", () => {
    const html = renderToString(
      <OdoslanieEfaktury firmaId={firmaId} faktura={f("issued", "proforma")} />,
    );
    expect(html).toContain("nie je daňový doklad");
    expect(html).not.toContain("<button");
  });

  it("koncept povie, že ho treba vystaviť", () => {
    const html = renderToString(
      <OdoslanieEfaktury firmaId={firmaId} faktura={f("draft", "regular")} />,
    );
    expect(html).toContain("najprv faktúru vystavte");
  });

  it("stornovaná nemá nič", () => {
    expect(
      renderToString(<OdoslanieEfaktury firmaId={firmaId} faktura={f("cancelled", "regular")} />),
    ).toBe("");
  });
});
