/**
 * Preklad manuálov v Pomoci (`src/routes/pomoc*.tsx`).
 *
 * Každá stránka sa vykreslí v nemčine a zapíše sa každý text, ktorý sa pri
 * tom hľadal v slovníku. Test overí, že preklady odsekov majú tie isté
 * značky `<n>…</n>` ako slovenský kľúč (inak by sa odsek zobrazil po
 * slovensky), a vypíše, koľko textov ešte prekladu nemá.
 *
 *   PREKLAD_VYPIS=1 npx vitest run src/lib/i18n/pomoc-preklad.test.tsx
 *
 * zapíše chýbajúce kľúče po stránkach do `/tmp/pomoc-chyba/<stranka>.json`.
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const zapisane = vi.hoisted(() => ({ kluce: new Set<string>() }));

vi.mock("@/lib/i18n/jazyk", async (povodny) => {
  const m = await povodny<typeof import("@/lib/i18n/jazyk")>();
  return {
    ...m,
    preloz: (
      j: Parameters<typeof m.preloz>[0],
      text: string,
      p?: Record<string, string | number>,
    ) => {
      zapisane.kluce.add(text);
      return m.preloz(j, text, p);
    },
  };
});
vi.mock("@tanstack/react-router", async (povodny) => {
  const m = await povodny<typeof import("@tanstack/react-router")>();
  return {
    ...m,
    Link: ({ to, children }: { to?: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  };
});
vi.mock("@/components/faktero/MarketingShell", () => ({
  MarketingShell: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

const { JazykProvider } = await import("./useT");
const DE: Record<string, string> = Object.assign(
  {},
  ...Object.values(
    import.meta.glob<Record<string, string>>("./de/*.ts", { eager: true, import: "default" }),
  ),
);

const ZNACKY = /<\/?\d+\/?>/g;
const znacky = (s: string) => (s.match(ZNACKY) ?? []).sort().join(" ");

const PRIECINOK = path.resolve(import.meta.dirname, "../../routes");
const stranky = readdirSync(PRIECINOK)
  .filter((f) => /^pomoc\..*\.tsx$/.test(f))
  .sort();

describe("preklad Pomoci do nemčiny", () => {
  const chyba: Record<string, string[]> = {};
  for (const subor of stranky) {
    it(
      subor,
      async () => {
        zapisane.kluce.clear();
        const { Route } = await import(/* @vite-ignore */ path.join(PRIECINOK, subor));
        const opt = Route.options as {
          head?: (a: unknown) => unknown;
          component: { preload?: () => Promise<void> } & ((p: object) => ReactNode);
        };
        opt.head?.({ match: { context: { jazyk: "de" } }, matches: [], params: {} });
        await opt.component.preload?.();
        const Page = opt.component;
        renderToString(
          <JazykProvider jazyk="de">
            <Page />
          </JazykProvider>,
        );
        const kluce = [...zapisane.kluce];
        expect(kluce.length).toBeGreaterThan(0);
        const zle = kluce.filter((k) => DE[k] !== undefined && znacky(DE[k]) !== znacky(k));
        expect(zle.map((k) => `${k}\n  → ${DE[k]}`)).toEqual([]);
        chyba[subor] = kluce.filter((k) => DE[k] === undefined);
      },
      60_000,
    );
  }
  it("súhrn", () => {
    const spolu = Object.values(chyba).reduce((a, k) => a + k.length, 0);
    if (spolu) console.log(`Pomoc: ${spolu} textov bez nemeckého prekladu`);
    if (process.env.PREKLAD_VYPIS) {
      mkdirSync("/tmp/pomoc-chyba", { recursive: true });
      for (const [s, k] of Object.entries(chyba))
        if (k.length)
          writeFileSync(
            `/tmp/pomoc-chyba/${s.replace(/^pomoc\.|\.tsx$/g, "")}.json`,
            JSON.stringify(Object.fromEntries(k.map((x) => [x, ""])), null, 1),
          );
    }
  });
});
