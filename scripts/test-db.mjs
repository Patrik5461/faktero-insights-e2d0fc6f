/**
 * Testy, ktoré potrebujú skutočnú databázu (`*.db.test.ts`).
 *
 * Servisný kľúč sa berie z prostredia; na serveri ho drží pm2 konfigurácia
 * `~/ecosystem.config.cjs`, tak sa načíta odtiaľ, keď v prostredí nie je.
 * Bez kľúča sa testy preskočia — `npm test` tým ostáva zelený všade.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const KLUCE = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PUBLISHABLE_KEY"];

if (KLUCE.some((k) => !process.env[k])) {
  const cesta = join(homedir(), "ecosystem.config.cjs");
  if (existsSync(cesta)) {
    const apps = require(cesta)?.apps ?? [];
    for (const app of apps) {
      for (const k of KLUCE) {
        if (!process.env[k] && app?.env?.[k]) process.env[k] = app.env[k];
      }
    }
  }
}

const chyba = KLUCE.filter((k) => !process.env[k]);
if (chyba.length) {
  console.error(`Chýba ${chyba.join(", ")} — testy proti databáze sa nedajú spustiť.`);
  process.exit(1);
}

const r = spawnSync("npx", ["vitest", "run", "--testTimeout=30000", "ciselne-rady.db"], {
  stdio: "inherit",
  /* Bez tohto sa testy preskočia — do ostrej databázy sa zapisuje len na požiadanie. */
  env: { ...process.env, FAKTERO_DB_TESTY: "1" },
});
process.exit(r.status ?? 1);
