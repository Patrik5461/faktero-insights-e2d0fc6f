/**
 * Preview režim webu s demo dátami — LEN na lokálnu ukážku (redizajn).
 *
 * Spúšťa sa výhradne cez `scripts/preview-redizajn.sh`. Produkčný build ani
 * `npm run dev` tento súbor nepoužívajú; všetko demo (preview/**) sa do
 * produkčného balíka nedostane, lebo naň nič v `src/` neodkazuje.
 *
 * Čo robí navyše oproti `vite.config.ts`:
 * - celý Supabase (REST, Auth, Storage, Functions) nahradí demo vrstvou
 *   v pamäti tohto servera na `/__demo/*` (preview/server),
 * - serverové funkcie a `/api` bežia naozaj, ale proti demo databáze a so
 *   zamknutou sieťou — von sa nedostane nič (preview/server/siet.ts),
 * - prehliadaču pošle CSP, ktorá povolí len vlastný pôvod, a pridá demo
 *   panel (účet, rola, dizajn) + strážcu siete (preview/klient),
 * - server počúva len na 127.0.0.1.
 */
import { mergeConfig, type Plugin, type UserConfig } from "vite";
import { resolve } from "node:path";
import { realpathSync } from "node:fs";
import { defineConfig as lovableKonfiguracia } from "@lovable.dev/vite-tanstack-config";

const KOREN = resolve(import.meta.dirname);
const PORT = Number(process.env.PREVIEW_PORT || 4317);
const DEMO_ORIGIN = `http://127.0.0.1:${PORT}`;

/*
 * Prostredie servera — nastaví sa ešte pred načítaním čohokoľvek z `src/`.
 * Všetky tajomstvá sa zmažú, aby ich žiadna serverová funkcia nenašla, ani
 * keby boli v prostredí shellu.
 */
for (const k of Object.keys(process.env)) {
  if (
    /KEY|SECRET|TOKEN|PASSWORD|PASS$|SMTP|RESEND|GOPAY|TATRA|GEMINI|OPENAI|ANTHROPIC|SUPABASE|DATABASE_URL|WEBHOOK|EPOSTAK|TURNSTILE|FIREBASE|APPLE|GOOGLE|REVOLUT|WISE|TELEGRAM|WHATSAPP|ORS_/i.test(
      k,
    )
  ) {
    delete process.env[k];
  }
}
process.env.SUPABASE_URL = `${DEMO_ORIGIN}/__demo`;
process.env.SUPABASE_PUBLISHABLE_KEY = "demo-publishable-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "demo-service-role-key";
process.env.FAKTERO_PREVIEW_DEMO = "1";
/*
 * Vymyslené (neplatné) hodnoty, aby pracovné postupy došli až po odoslanie.
 * Samotné volanie von zastaví zámok siete: e-mail cez Resend dostane
 * predstieranú odpoveď (preview/server/siet.ts), ostatné skončia chybou
 * „Demo – nič sa neodoslalo“.
 */
process.env.RESEND_API_KEY = "demo-neplatny-kluc";
process.env.EPOSTAK_ENV = "production";

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ws://127.0.0.1:${PORT} ws://localhost:${PORT}`,
  "media-src 'self' data: blob:",
  "frame-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "object-src 'self' data: blob:",
  "form-action 'self'",
  "base-uri 'self'",
].join("; ");

const SUPABASE_URL_V_KODE = `(typeof window !== "undefined" ? window.location.origin + "/__demo" : process.env.SUPABASE_URL)`;

function demoPlugin(): Plugin {
  const klient = resolve(import.meta.dirname, "preview/klient/index.ts");
  return {
    name: "faktero-preview-demo",
    enforce: "pre",
    async configureServer(server) {
      const { zamkniSiet, kontextSiete } = await import("./preview/server/siet");
      zamkniSiet();
      /*
       * Demo vrstva sa načítava cez SSR graf Vite: po úprave súboru v
       * `preview/server` alebo `preview/data` sa sama znova načíta (dáta sa
       * pritom vrátia do pôvodného stavu) — server netreba reštartovať.
       */
      type Obsluha = typeof import("./preview/server/obsluha");
      const nacitajObsluhu = () =>
        server.ssrLoadModule("/preview/server/obsluha.ts") as Promise<Obsluha>;
      server.middlewares.use((req, res, next) => {
        const stav = { blokovane: [] as string[], zapisy: 0 };
        // Hlavičky sa doplnia tesne pred odoslaním — vtedy už vieme, čo
        // serverová funkcia počas požiadavky skúsila poslať von alebo zapísať.
        const writeHead = res.writeHead.bind(res);
        (res as any).writeHead = (...args: any[]) => {
          try {
            if (stav.blokovane.length)
              res.setHeader("x-demo-simulovane", encodeURIComponent(stav.blokovane.join(", ")));
            if (stav.zapisy) res.setHeader("x-demo-zapisy", String(stav.zapisy));
            const typ = String(res.getHeader("content-type") ?? "");
            if (!typ || typ.includes("text/html")) res.setHeader("content-security-policy", CSP);
          } catch {
            /* hlavičky už odišli */
          }
          return (writeHead as (...a: any[]) => typeof res)(...args);
        };
        kontextSiete.run(stav, () => {
          if (!req.url?.startsWith("/__demo/")) return next();
          nacitajObsluhu()
            .then((m) => m.obsluzDemo(req, res))
            .then((obsluzene) => {
              if (!obsluzene) next();
            })
            .catch(next);
        });
      });
    },
    transform(code, id) {
      const subor = id.split("?")[0];
      if (!subor.startsWith(KOREN + "/src/")) return null;
      let out = code;
      if (out.includes("import.meta.env.VITE_SUPABASE_URL")) {
        out = out.replaceAll("import.meta.env.VITE_SUPABASE_URL", SUPABASE_URL_V_KODE);
      }
      if (out.includes("import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY")) {
        out = out.replaceAll(
          "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY",
          JSON.stringify("demo-publishable-key"),
        );
      }
      // Pevné adresy produkčného projektu (videá, Android) → demo úložisko.
      out = out.replaceAll("https://sywcjxydnljkzoepfcaz.supabase.co", "/__demo");
      // Google Tag Manager sa v preview vôbec nenačíta.
      if (subor.endsWith("/src/lib/faktero/gtm.ts")) {
        out = out.replace("j.async=true;j.src=", "return;j.src=");
      }
      // Demo panel a strážca siete — prvý import routera (beží skôr než appka).
      if (subor.endsWith("/src/router.tsx")) {
        out = `import ${JSON.stringify(klient)};\n` + out;
      }
      return out === code ? null : { code: out, map: null };
    },
  };
}

/*
 * Rovnaké nastavenie TanStack Start ako `vite.config.ts` (serverový vstup
 * `src/server.ts`), bez Nitra (preview sa nikdy nestavia na nasadenie) a bez
 * `serverFnErrorLogger` — jeho vložený kód pri chybe serverovej funkcie padá
 * na `request.method` a skutočnú chybu zakryje.
 */
const zakladnaKonfiguracia = lovableKonfiguracia({
  tanstackStart: { server: { entry: "server" } },
  nitro: false,
  serverFnErrorLogger: false,
  vite: {
    define: { __FAKTERO_VYDANIE__: JSON.stringify("preview-demo") },
  },
} as Parameters<typeof lovableKonfiguracia>[0]);

export default async (env: { command: "build" | "serve"; mode: string }) => {
  const zaklad = await (zakladnaKonfiguracia as unknown as (e: typeof env) => Promise<UserConfig>)(
    env,
  );
  return mergeConfig(zaklad, {
    plugins: [demoPlugin()],
    define: {
      "import.meta.env.VITE_PREVIEW_DEMO": JSON.stringify("1"),
    },
    server: {
      host: "127.0.0.1",
      port: PORT,
      strictPort: true,
      hmr: { host: "127.0.0.1", port: PORT },
      // node_modules je v worktree odkaz na hlavné repo — čítať z neho treba.
      fs: { allow: [KOREN, realpathSync(resolve(KOREN, "node_modules"))] },
    },
    preview: { host: "127.0.0.1", port: PORT, strictPort: true },
    cacheDir: resolve(import.meta.dirname, "preview/.cache/vite"),
  } satisfies UserConfig);
};
