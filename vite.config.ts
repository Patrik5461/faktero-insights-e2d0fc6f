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
  /*
   * Statické súbory sa zbalia už pri builde (gzip aj brotli) a server pošle
   * zbalenú verziu, keď ju prehliadač prijme. Nginx pred appkou baliť nevie
   * (chýba mu `gzip_proxied`), takže hlavný skript išiel nezbalený — 4 MB
   * pri každom novom vydaní namiesto ~1 MB.
   */
  nitro: { compressPublicAssets: { gzip: true, brotli: true } },
  vite: {
    define: { __FAKTERO_VYDANIE__: JSON.stringify(vydanie) },
    preview: {
      allowedHosts: ["faktero.sk", "www.faktero.sk"],
    },
  },
});
