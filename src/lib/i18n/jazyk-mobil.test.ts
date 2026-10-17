import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  `jazyk.ts` (a `useT`) importujú aj obrazovky mobilnej appky, ktorá sa stavia
  čistým Vite bez servera. Import TanStack Start by jej build zhodil — appka
  1.6.5 kvôli tomu prvýkrát v Xcode Cloude nepostavila.
*/
describe("preklady použiteľné v mobilnej appke", () => {
  it.each(["src/lib/i18n/jazyk.ts", "src/lib/i18n/useT.tsx", "src/lib/i18n/dobropis-de.ts"])(
    "%s neimportuje TanStack Start",
    (subor) => {
      expect(readFileSync(subor, "utf8")).not.toMatch(/@tanstack\/react-start/);
    },
  );
});
