import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PanelNahladu } from "./PanelNahladu";

function triedy(html: string, vyber: RegExp) {
  return html.match(vyber)?.[1]?.split(/\s+/) ?? [];
}

describe("PanelNahladu", () => {
  const html = renderToStaticMarkup(
    <PanelNahladu
      className="lg:sticky"
      obsahClassName="bg-muted/20"
      toolbar={<span id="t">nástroje</span>}
      paticka={<span id="p">pätička</span>}
      aria-label="Náhľad"
    >
      <span id="o">dokument</span>
    </PanelNahladu>,
  );

  it("obal je stĺpec na celú výšku rodiča", () => {
    const k = triedy(html, /^<div[^>]*class="([^"]+)"/);
    expect(k).toEqual(
      expect.arrayContaining(["flex", "flex-col", "min-h-0", "h-full", "lg:sticky"]),
    );
    expect(html).toContain('aria-label="Náhľad"');
  });

  it("nástroje a pätička sa nezmršťujú, obsah je jediný scroll", () => {
    expect(html).toMatch(/<div class="shrink-0"><span id="t">/);
    expect(html).toMatch(/<div class="shrink-0"><span id="p">/);
    const obsah = triedy(html, /class="([^"]+)"><span id="o">/);
    expect(obsah).toEqual(
      expect.arrayContaining(["flex-1", "min-h-0", "overflow-auto", "bg-muted/20"]),
    );
    expect(html.match(/overflow-auto/g)).toHaveLength(1);
    expect(html).not.toMatch(/max-h-/);
  });

  it("bez nástrojov a pätičky ostane len obsah", () => {
    const h = renderToStaticMarkup(<PanelNahladu>x</PanelNahladu>);
    expect(h.match(/shrink-0/g)).toBeNull();
  });
});
