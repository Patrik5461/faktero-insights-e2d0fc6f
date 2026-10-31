import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { stavEfaktury } from "@/lib/faktero/efaktura/stav-efaktury";
import { OdznakEfaktury, SekciaEfaktury } from "./EfakturaStav";
import { prejdeFiltrom } from "./VystaveneFaktury";

/* Vykreslenie bez prehliadača — efekty (dopyt na server) sa nespúšťajú. */
const zlyhala = stavEfaktury([
  {
    status: "failed",
    channel: "peppol",
    created_at: "2026-10-30T10:00:00Z",
    sent_at: "2026-10-30T10:00:00Z",
    updated_at: "2026-10-30T10:05:00Z",
    zlyhanie: { code: "participant_not_found" },
  },
]);
const dorucena = stavEfaktury([
  {
    status: "delivered",
    channel: "peppol",
    created_at: "2026-10-30T10:00:00Z",
    sent_at: "2026-10-30T10:00:00Z",
    delivered_at: "2026-10-30T10:00:05Z",
  },
]);

describe("stav eFaktúry v appke — vykreslenie", () => {
  it("odznak len pri eFaktúre", () => {
    expect(renderToString(<OdznakEfaktury stav={null} />)).toBe("");
    const html = renderToString(<OdznakEfaktury stav={zlyhala} />);
    expect(html).toContain("Odoslanie eFaktúry zlyhalo");
    expect(html).toContain('data-efaktura-stav="zlyhala"');
  });

  it("sekcia so stavom, dôvodom, časom a kanálom", () => {
    const html = renderToString(<SekciaEfaktury fakturaId="x" typ="regular" stav={zlyhala} />);
    expect(html).toContain("Odoslanie eFaktúry zlyhalo");
    expect(html).toContain("nie je zaregistrovaný v sieti Peppol");
    expect(html).toContain("Peppol");
    expect(html).toContain("Zlyhala");
    const ok = renderToString(<SekciaEfaktury fakturaId="x" typ="regular" stav={dorucena} />);
    expect(ok).toContain("eFaktúra doručená");
    expect(ok).toContain("Doručená");
  });

  it("bez eFaktúry a pri zálohovej", () => {
    expect(renderToString(<SekciaEfaktury fakturaId="x" typ="regular" stav={null} />)).toContain(
      "zatiaľ neodišla eFaktúrou",
    );
    expect(renderToString(<SekciaEfaktury fakturaId="x" typ="proforma" stav={null} />)).toContain(
      "eFaktúrou sa neposiela",
    );
  });

  it("filter zoznamu podľa eFaktúry", () => {
    const f = (efaktura: unknown) =>
      ({ status: "issued", type: "regular", due_date: "2099-01-01", efaktura }) as any;
    expect(prejdeFiltrom(f(dorucena), "efOdoslane")).toBe(true);
    expect(prejdeFiltrom(f(dorucena), "efChyba")).toBe(false);
    expect(prejdeFiltrom(f(zlyhala), "efChyba")).toBe(true);
    expect(prejdeFiltrom(f(null), "efOdoslane")).toBe(false);
    expect(prejdeFiltrom(f(undefined), "vsetky")).toBe(true);
  });
});
