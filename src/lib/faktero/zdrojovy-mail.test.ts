import { describe, expect, it } from "vitest";
import { MAX_TEXT_MAILU, htmlNaText, textMailu } from "./zdrojovy-mail";

describe("text zdrojového mailu", () => {
  it("uprednostní čistý text a zlúči prázdne riadky", () => {
    expect(textMailu("Dobrý deň,\r\n\r\n\r\n\r\nto je za september.  \n", "<p>iné</p>")).toBe(
      "Dobrý deň,\n\nto je za september.",
    );
  });

  it("bez textu prepíše HTML aj s odsekmi a entitami", () => {
    const t = textMailu(
      "",
      "<html><head><style>p{}</style></head><body><p>Faktúra&nbsp;za&nbsp;9/2026</p><div>Zákazka &amp; Novák<br>Ďakujem</div><script>x()</script></body></html>",
    );
    expect(t).toBe("Faktúra za 9/2026\nZákazka & Novák\nĎakujem");
    expect(htmlNaText("<ul><li>a</li><li>b</li></ul>")).toContain("• a");
  });

  it("prázdny mail je null a dlhý sa skráti", () => {
    expect(textMailu("  ", "<p> </p>")).toBeNull();
    expect(textMailu(null, null)).toBeNull();
    const dlhy = textMailu("x".repeat(MAX_TEXT_MAILU + 50), null)!;
    expect(dlhy.length).toBe(MAX_TEXT_MAILU + 2);
    expect(dlhy.endsWith("…")).toBe(true);
  });
});
