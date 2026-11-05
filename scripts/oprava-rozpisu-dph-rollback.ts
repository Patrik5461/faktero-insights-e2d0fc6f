/*
  Vrátenie behu opravy rozpisu DPH (scripts/oprava-rozpisu-dph.ts).

    JITI_ALIAS='{"@/":"'$PWD'/src/"}' npx jiti scripts/oprava-rozpisu-dph-rollback.ts --run-id <id>            # nanečisto
    ... --run-id <id> --apply             # naozaj vráti pôvodné hodnoty z oprava_rozpisu_dph_audit
    ... --run-id <id> --apply --vynutit   # vráti aj zmeny, ktoré niekto po behu prepísal (POZOR)
    ... --env <cesta>                     # súbor s SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY (predvolene ./.env)

  Vracia od poslednej zmeny po prvú. Zmena, ktorej hodnota sa od behu zmenila
  (človek doklad medzitým opravil), sa bez --vynutit nevráti — vypíše sa ako
  konflikt. Aj vrátenie sa zapíše do auditu (akcia rollback, run_id
  „rollback:<id>“). Doklady v uzavretom období odmietne spúšťač v DB.
*/

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1] : undefined;
};

function env(cesta: string) {
  const out: Record<string, string> = {};
  try {
    for (const r of readFileSync(cesta, "utf8").split("\n")) {
      const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* bez súboru stačí prostredie */
  }
  return out;
}

async function main() {
  const runId = arg("--run-id");
  if (!runId) {
    console.error("Chýba --run-id <id behu>.");
    process.exit(1);
  }
  const e = { ...env(arg("--env") ?? ".env"), ...process.env } as Record<string, string>;
  const url = e.SUPABASE_URL || e.VITE_SUPABASE_URL;
  if (!url || !e.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Chýba SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const sb = createClient(url, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { vratBeh } = await import("../src/lib/faktero/oprava-rozpisu-dph.server");
  const zapisat = process.argv.includes("--apply");
  const v = await vratBeh(sb, runId, { zapisat, vynutit: process.argv.includes("--vynutit") });
  console.error(
    `${zapisat ? "Vrátené" : "Nanečisto — na vrátenie"}: ${zapisat ? v.vratene : v.naVratenie} zmien` +
      `, konflikty ${v.konflikty.length}, chyby ${v.chyby.length}.`,
  );
  for (const k of v.konflikty) console.error(`  konflikt ${k.tabulka}/${k.id} (${k.pole})`);
  for (const c of v.chyby) console.error(`  chyba ${c}`);
  if (!zapisat) console.error("Zápis: --apply");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
