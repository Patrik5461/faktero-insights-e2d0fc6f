/*
  Spätné overenie platiteľstva DPH všetkých firiem v registroch
  (zoznamy Finančnej správy SR, Registr plátců DPH).

    npx jiti scripts/platitel-dph-spatne.ts              # nanečisto — nič nezapíše
    npx jiti scripts/platitel-dph-spatne.ts --json       # nanečisto, výstup ako JSON
    npx jiti scripts/platitel-dph-spatne.ts --zapisat    # zapíše

  Nanečisto vypíše pre každú firmu: čo má nastavené, čo hovorí register a čo
  by sa doplnilo. Zápis robí to isté ako denný cron (`overFirmu`): doplní len
  prázdny režim DPH (a prázdne IČ DPH), vyplnený nikdy neprepíše — nesúlad
  zapíše do `dph_overenia` a ukáže ho v nastaveniach firmy a vo zvončeku.
  Zápis potrebuje migráciu `platitel_dph_overenie`.

  Kľúč berie zo SUPABASE_SERVICE_ROLE_KEY (prostredie alebo ecosystem.config.cjs).
*/
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import { navrhSpatnehoDoplnenia, overFirmu } from "../src/lib/faktero/platitel-dph.server";

function prostredie() {
  let eco: Record<string, string> = {};
  try {
    eco = createRequire(import.meta.url)("/home/patrik/ecosystem.config.cjs").apps[0].env ?? {};
  } catch {
    /* mimo servera stačí prostredie */
  }
  const z = (k: string) => process.env[k] || eco[k] || "";
  return {
    url: z("SUPABASE_URL") || z("VITE_SUPABASE_URL"),
    sluzba: z("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

async function main() {
  const zapisat = process.argv.includes("--zapisat");
  const { url, sluzba } = prostredie();
  if (!url || !sluzba) {
    console.error("Chýba SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const sb = createClient(url, sluzba, { auth: { persistSession: false } });

  const navrh = await navrhSpatnehoDoplnenia(sb);
  if (process.argv.includes("--json")) console.log(JSON.stringify(navrh, null, 1));
  else
    for (const n of navrh) {
      const r = n.register;
      const co = n.doplnit
        ? `DOPLNIŤ ${JSON.stringify(n.doplnit)}`
        : n.nesulad
          ? "NESÚLAD (neprepíše sa, upozornenie)"
          : r.stav === "chyba"
            ? `CHYBA ${r.chyba}`
            : "sedí";
      console.log(
        [
          n.firma,
          n.ico ?? "—",
          `vo Faktere: ${n.nastavene.vat_scheme ?? "—"}${n.nastavene.ic_dph ? ` ${n.nastavene.ic_dph}` : ""}`,
          `register (${r.zdroj}${r.zoznam_k ? ` k ${r.zoznam_k}` : ""}): ${r.schema ?? "—"}${r.ic_dph ? ` ${r.ic_dph}` : ""}${r.platne_od ? ` od ${r.platne_od}` : ""}`,
          co,
        ].join(" | "),
      );
    }
  if (!zapisat) {
    console.error(`\nNanečisto: ${navrh.length} firiem, nič sa nezapísalo. Zápis: --zapisat`);
    return;
  }
  let ok = 0;
  for (const n of navrh) {
    try {
      await overFirmu(sb, n.id, { sposob: "spatne" });
      ok++;
    } catch (e) {
      console.error(n.firma, String((e as Error)?.message ?? e));
    }
  }
  console.error(`\nZapísané: ${ok} z ${navrh.length}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
