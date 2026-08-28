/**
 * Zostavenie samostatnej appky Kniha jázd do balíčka pre telefón.
 *
 * Je to ten istý build ako pre Faktero (`vite.config.mobile.ts`) — rovnaké
 * aliasy mostíka, rovnaké verejné údaje Supabase, rovnaké delenie balíkov.
 * Líši sa vstupný súbor a výstupný priečinok, nič viac; kopírovať celý súbor
 * by znamenalo, že prvá oprava v jednom sa do druhého nikdy nedostane.
 */
import { defineConfig, type UserConfig, type UserConfigFnObject } from "vite";
import { resolve } from "node:path";
import mobilny from "./vite.config.mobile";

export default defineConfig(async (env) => {
  const zaklad = (await (mobilny as UserConfigFnObject)(env)) as UserConfig;
  return {
    ...zaklad,
    build: {
      ...zaklad.build,
      outDir: "dist-jazdy",
      rollupOptions: {
        ...zaklad.build?.rollupOptions,
        input: resolve(import.meta.dirname, "index.jazdy.html"),
      },
    },
  };
});
