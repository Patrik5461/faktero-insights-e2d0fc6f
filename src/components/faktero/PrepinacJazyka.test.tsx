import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrepinacJazyka } from "./PrepinacJazyka";
import { JazykProvider } from "@/lib/i18n/useT";
import type { Jazyk } from "@/lib/i18n/jazyk";

const html = (jazyk: Jazyk) =>
  renderToStaticMarkup(
    <JazykProvider jazyk={jazyk}>
      <PrepinacJazyka />
    </JazykProvider>,
  );

describe("PrepinacJazyka", () => {
  it("je jedno tlačidlo rozbaľovacej ponuky, nie tri tlačidlá vedľa seba", () => {
    const h = html("sk");
    expect(h.match(/<button/g)).toHaveLength(1);
    expect(h).toContain('aria-haspopup="menu"');
    expect(h).not.toContain("aria-pressed");
    expect(h).not.toContain("<select");
  });

  it.each([
    ["sk", "SK", "Jazyk: Slovenčina"],
    ["cs", "CZ", "Jazyk: Čeština"],
    ["de", "DE", "Sprache: Deutsch"],
  ] as const)("ukazuje aktuálny jazyk %s", (jazyk, skratka, popis) => {
    const h = html(jazyk);
    expect(h).toContain(`>${skratka}</span>`);
    expect(h).toContain(`aria-label="${popis}"`);
  });

  it("tlačidlo má pevnú šírku, aby zmena jazyka neposunula hlavičku", () => {
    expect(html("de")).toMatch(/w-\[3\.25rem\]/);
  });
});
