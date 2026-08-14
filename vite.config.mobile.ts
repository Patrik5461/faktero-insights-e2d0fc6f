/**
 * Zostavenie mobilnej aplikácie do balíčka pre telefón.
 *
 * Web beží na TanStack Start so serverovým vykresľovaním; appka takto stavaná
 * byť nemôže, lebo bez signálu by nemala čo zobraziť. Toto je preto samostatný
 * klientský build tých istých obrazoviek — dáta chodia priamo zo Supabase.
 *
 * Výstup ide do `dist-mobile`, odkiaľ si ho berie Capacitor (`webDir`).
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Appka sa sama neaktualizuje, takže musí byť na prvý pohľad jasné, ktorý
  // balíček v telefóne beží — inak sa nedá rozlíšiť neúspešná oprava od
  // starého buildu.
  define: {
    __PECIATKA__: JSON.stringify(
      new Date().toISOString().slice(0, 16).replace("T", " "),
    ),
  },
  resolve: {
    // Poradie je dôležité — konkrétne cesty musia byť pred všeobecným "@".
    // Takto sa do balíčka dostane most cez endpointy a nie serverové funkcie.
    alias: [
      {
        find: /^@\/lib\/mobile\/server-most-volanie$/,
        replacement: resolve(import.meta.dirname, "src/lib/mobile/server-most-volanie.mobile.ts"),
      },
      {
        find: /^@\/lib\/mobile\/server-most$/,
        replacement: resolve(import.meta.dirname, "src/lib/mobile/server-most.mobile.ts"),
      },
      { find: /^@\//, replacement: resolve(import.meta.dirname, "src") + "/" },
    ],
  },
  // Balíček sa načítava z lokálneho pôvodu (capacitor://), nie z koreňa webu.
  base: "./",
  build: {
    outDir: "dist-mobile",
    emptyOutDir: true,
    rollupOptions: { input: resolve(import.meta.dirname, "index.mobile.html") },
    target: "es2020",
  },
});
