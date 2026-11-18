/*
  Skúška naostro: demo doklad (bez údajov klientov) prečíta Claude cez celú
  cestu `precitajDoklad` → `aiVision` (vyťažovanie) → Claude Opus. Gemini ani
  OpenAI sa nevolajú (kľúče sa v teste zmažú). Beží len na požiadanie, kľúč
  sa nikdy nevypisuje:

    CLAUDE_NAOSTRO=1 CLAUDE_NAOSTRO_VYSTUP=/tmp/claude-naostro.json npx vitest run src/lib/faktero/claude.naostro.test.ts

  Kľúč berie z `ANTHROPIC_API_KEY`, inak z `~/ecosystem.config.cjs` (apps[0].env).
*/
import { appendFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const zaznamy: { model: string; vstup?: number | null; vystup?: number | null; ms: number }[] = [];

vi.mock("./ai-merac.server", async (povodny) => {
  const m = await povodny<typeof import("./ai-merac.server")>();
  return {
    ...m,
    zmeraj: async (meta: { model: string }, volanie: (o: (t: any) => void) => Promise<unknown>) => {
      const t0 = Date.now();
      let tokeny: { vstup?: number | null; vystup?: number | null } = {};
      try {
        return await volanie((t) => (tokeny = t));
      } finally {
        zaznamy.push({ model: meta.model, ...tokeny, ms: Date.now() - t0 });
      }
    },
  };
});

function kluc(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return process.env.ANTHROPIC_API_KEY;
  try {
    const cfg = createRequire(import.meta.url)("/home/patrik/ecosystem.config.cjs");
    return cfg?.apps?.[0]?.env?.ANTHROPIC_API_KEY;
  } catch {
    return undefined;
  }
}

describe.skipIf(!process.env.CLAUDE_NAOSTRO)("Claude naostro", () => {
  for (const [subor, mime] of [
    ["preview/assets/demo-doklad.pdf", "application/pdf"],
    ["preview/assets/demo-blocek.png", "image/png"],
  ] as const) {
    it(`${subor} cez Claude Opus`, { timeout: 180_000 }, async () => {
      const k = kluc();
      expect(k, "chýba ANTHROPIC_API_KEY").toBeTruthy();
      process.env.ANTHROPIC_API_KEY = k;
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      vi.resetModules();
      zaznamy.length = 0;

      const { precitajDoklad } = await import("./mail-prijem.server");
      const b64 = readFileSync(subor).toString("base64");
      const t0 = Date.now();
      const ai = await precitajDoklad(b64, mime, null, { ucel: "meranie" });
      const ms = Date.now() - t0;
      const vyber = ai
        ? Object.fromEntries(
            [
              "document_type",
              "supplier_name",
              "supplier_ico",
              "supplier_ic_dph",
              "invoice_number",
              "issue_date",
              "tax_date",
              "due_date",
              "variable_symbol",
              "currency",
              "net_amount",
              "vat_amount",
              "total_amount",
              "vat_rate",
              "vat_breakdown",
            ]
              .filter((p) => p in ai)
              .map((p) => [p, ai[p]]),
          )
        : null;
      // Výstup testov je stlmený — výsledok ide do súboru, keď je zadaný.
      const vystup = JSON.stringify(
        { subor, celkomMs: ms, volania: zaznamy, polia: vyber },
        null,
        2,
      );
      if (process.env.CLAUDE_NAOSTRO_VYSTUP)
        appendFileSync(process.env.CLAUDE_NAOSTRO_VYSTUP, vystup + "\n");
      expect(ai).toBeTruthy();
      expect(zaznamy.at(-1)?.model).toBe("claude-opus-5-5");
    });
  }
});
