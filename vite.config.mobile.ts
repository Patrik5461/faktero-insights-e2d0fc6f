/**
 * Zostavenie mobilnej aplikácie do balíčka pre telefón.
 *
 * Web beží na TanStack Start so serverovým vykresľovaním; appka takto stavaná
 * byť nemôže, lebo bez signálu by nemala čo zobraziť. Toto je preto samostatný
 * klientský build tých istých obrazoviek — dáta chodia priamo zo Supabase.
 *
 * Výstup ide do `dist-mobile`, odkiaľ si ho berie Capacitor (`webDir`).
 */
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

/**
 * Verejné údaje projektu Supabase.
 *
 * `.env` do gitu nepatrí (sú v ňom tajomstvá), takže build na inom počítači by
 * bez tohto vyrobil appku bez adresy databázy — a tá potom pri štarte spadne na
 * „Missing Supabase environment variable(s)". Tieto dve hodnoty sú pritom
 * verejné: publikovateľný kľúč je v každej stránke webu a chráni ho RLS, nie
 * utajenie. Keď sú v `.env`, majú prednosť.
 */
const VEREJNE = {
  url: "https://sywcjxydnljkzoepfcaz.supabase.co",
  kluc: "sb_publishable_l36QTanH1P7EhYZCCZknaQ_kP748KFt",
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "");
  return {
    plugins: [react(), tailwindcss()],
    // Appka sa sama neaktualizuje, takže musí byť na prvý pohľad jasné, ktorý
    // balíček v telefóne beží — inak sa nedá rozlíšiť neúspešná oprava od
    // starého buildu.
    define: {
      __PECIATKA__: JSON.stringify(new Date().toISOString().slice(0, 16).replace("T", " ")),
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(env.VITE_SUPABASE_URL || VEREJNE.url),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        env.VITE_SUPABASE_PUBLISHABLE_KEY || VEREJNE.kluc,
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
      rollupOptions: {
        input: resolve(import.meta.dirname, "index.mobile.html"),
        output: {
          /*
           * Knižnice zvlášť od nášho kódu.
           *
           * Nie kvôli medzipamäti prehliadača — appka je v telefóne, nič sa
           * nesťahuje. Ide o štart: prehliadaču stačí najprv spracovať to, čo
           * treba na prvú obrazovku, a zvyšok si vezme, keď naň príde rad.
           */
          manualChunks(id: string) {
            if (!id.includes("node_modules")) return undefined;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
            if (id.includes("@supabase")) return "supabase";
            if (id.includes("lucide-react")) return "ikony";
            return undefined;
          },
        },
      },
      target: "es2020",
    },
  };
});
