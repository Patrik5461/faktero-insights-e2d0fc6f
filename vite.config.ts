import { execSync } from "node:child_process";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/*
 * Identifikátor vydania — rovnaký v prehliadači aj na serveri. Karta otvorená
 * pred nasadením podľa neho spozná, že beží staré vydanie, a obnoví sa
 * (`sledujNoveVydanie` v `stara-verzia.ts`).
 */
const vydanie = (() => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim() + "-" + Date.now().toString(36);
  } catch {
    return Date.now().toString(36);
  }
})();

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    define: { __FAKTERO_VYDANIE__: JSON.stringify(vydanie) },
    preview: {
      allowedHosts: ["faktero.sk", "www.faktero.sk"],
    },
  },
});
