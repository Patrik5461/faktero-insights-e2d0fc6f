import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ZoznamVytiek } from "./ZoznamVytiek";
import { JazykProvider } from "@/lib/i18n/useT";

const vytky = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ doklad: `F${i + 1}`, text: "Chýba DIČ." }));

describe("ZoznamVytiek (B-20)", () => {
  it("nad 20 výtok ukáže prvých 20 a „a ďalších n“", () => {
    const h = renderToStaticMarkup(
      <JazykProvider jazyk="sk">
        <ZoznamVytiek vytky={vytky(23)} nadpis="Pred podaním (23)" />
      </JazykProvider>,
    );
    expect(h.match(/<li>/g)).toHaveLength(20);
    expect(h).toContain("a ďalších 3");
    expect(h).toContain("F20");
    expect(h).not.toContain("F21");
  });
  it("do 20 bez tlačidla, prázdne nič", () => {
    const h = renderToStaticMarkup(
      <JazykProvider jazyk="sk">
        <ZoznamVytiek vytky={vytky(2)} nadpis="x" />
      </JazykProvider>,
    );
    expect(h.match(/<li>/g)).toHaveLength(2);
    expect(h).not.toContain("ďalších");
    expect(renderToStaticMarkup(<ZoznamVytiek vytky={[]} nadpis="x" />)).toBe("");
  });
});
