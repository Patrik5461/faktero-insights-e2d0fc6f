/*
  Oprava rozpisu DPH vyťažených dokladov (2026-11-05).

  Prejde prijaté faktúry, bločky/doklady a Nespracované vo všetkých firmách,
  overí uložený rozpis DPH (súčty, daň riadku, povolené sadzby 0/5/19/23 %,
  kategória 0 % riadkov), nájde podozrivé (19 % od 2025 bez 19 % na doklade,
  jedna sadzba pri viacerých, chýbajúca 0 %/5 %, efektívna sadzba mimo
  povolených) a chybné/podozrivé:
    - opraví z uloženého výsledku AI (bez volania AI), alebo
    - znova vyťaží zo súboru v Storage (AI; stojí peniaze), alebo
    - označí na kontrolu (`na_kontrolu_at` + `na_kontrolu_dovod`), alebo
    - preskočí (zmazané, odovzdané do účtovníctva, zamknuté, uzavreté obdobie,
      obdobie po termíne priznania, zálohové) — len log.
  Ručne upravené doklady (príznak `rucne_upravene_at`, história, rozdiel od
  `ai_raw`) sa nikdy neprepisujú, len označia. Celková suma sa nemení nikdy.

  POUŽITIE (z koreňa repa):
    JITI_ALIAS='{"@/":"'$PWD'/src/"}' npx jiti scripts/oprava-rozpisu-dph.ts            # nanečisto (predvolené) — nič nezapíše, AI nevolá
    ... --apply                       # ostrý zápis (potrebuje migráciu 20261105134823_oprava_rozpisu_dph)
    ... --apply --limit-ai 20         # ostrý zápis, najviac 20 nových vyťažení cez AI
    ... --vytazit-vzorku 5            # nanečisto, ale 5 dokladov naozaj znova vyťaží (AI, nič nezapíše)
    ... --firma <uuid>                # len jedna firma
    ... --tabulka purchase_invoices   # len jedna agenda (purchase_invoices | expense_documents | nespracovane_doklady)
    ... --aj-po-termine               # meniť aj obdobia po termíne priznania (nie uzavreté)
    ... --oznacit-preskocene          # pri --apply označiť na kontrolu aj preskočené
    ... --bez-textu                   # nečítať súbory (rýchlejšie, menej podozrení sa dá overiť)
    ... --vsetky                      # do CSV aj doklady v poriadku
    ... --env <cesta>                 # súbor s SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY (predvolene ./.env)

  Výstup: /home/patrik/oprava-rozpisu-dph/<run_id>.csv, .log a .json (súhrn).
  Vrátenie behu: scripts/oprava-rozpisu-dph-rollback.ts --run-id <run_id>.
*/

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const ma = (n: string) => process.argv.includes(n);

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

const VYSTUP = "/home/patrik/oprava-rozpisu-dph";

async function main() {
  // Prostredie pred importom servera — AI aj meranie čítajú process.env.
  const e = env(arg("--env") ?? ".env");
  for (const [k, v] of Object.entries(e)) if (!process.env[k]) process.env[k] = v;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const kluc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !kluc) {
    console.error("Chýba SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const zapisat = ma("--apply");
  const runId = `dph-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "")}${zapisat ? "" : "-nanecisto"}`;
  mkdirSync(VYSTUP, { recursive: true });
  const logSubor = `${VYSTUP}/${runId}.log`;
  const log = (s: string) => {
    console.error(s);
    appendFileSync(logSubor, s + "\n");
  };

  const sb = createClient(url, kluc, { auth: { persistSession: false } });
  const { spustiOpravu } = await import("../src/lib/faktero/oprava-rozpisu-dph.server");
  const tabulka = arg("--tabulka");
  log(`Beh ${runId} — ${zapisat ? "OSTRÝ ZÁPIS" : "nanečisto (nič sa nezapíše)"}`);
  const suhrn = await spustiOpravu(
    sb,
    {
      runId,
      zapisat,
      firma: arg("--firma") ?? null,
      tabulky: tabulka ? [tabulka as any] : undefined,
      ajPoTermine: ma("--aj-po-termine"),
      bezTextu: ma("--bez-textu"),
      oznacitPreskocene: ma("--oznacit-preskocene"),
      vytazitVzorku: Number(arg("--vytazit-vzorku") ?? 0) || 0,
      limitAi: arg("--limit-ai") != null ? Number(arg("--limit-ai")) : undefined,
    },
    { log },
  );

  const riadky = ma("--vsetky") ? suhrn.riadky : suhrn.riadky.filter((r) => r.vysledok !== "ok");
  const stlpce = [
    "tabulka",
    "id",
    "firma",
    "cislo",
    "dodavatel",
    "datum_dph",
    "zdroj",
    "bez_dph",
    "dph",
    "spolu",
    "stav",
    "vysledok",
    "dovod",
    "chyby",
    "podozrenia",
    "ochrany",
    "rucne",
    "ulozeny_rozpis",
    "novy_rozpis",
    "ai_volanie",
  ] as const;
  const bunka = (v: unknown) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Bodkočiarka a BOM — Excel v slovenskom prostredí otvorí CSV rovno.
  const csv =
    "﻿" +
    [stlpce.join(";"), ...riadky.map((r) => stlpce.map((k) => bunka(r[k])).join(";"))].join("\n");
  writeFileSync(`${VYSTUP}/${runId}.csv`, csv);
  const { riadky: _r, ...bezRiadkov } = suhrn;
  writeFileSync(`${VYSTUP}/${runId}.json`, JSON.stringify(bezRiadkov, null, 2));

  log("");
  log(`Skontrolované: ${suhrn.skontrolovane}`);
  for (const [k, v] of Object.entries(suhrn.podlaVysledku)) if (v) log(`  ${k}: ${v}`);
  log("Podľa agendy:");
  for (const [t, p] of Object.entries(suhrn.podlaTabulky))
    log(
      `  ${t}: ${Object.entries(p)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ")}`,
    );
  log("Nájdené chyby a podozrenia (počet dokladov, mimo ok):");
  for (const [k, v] of Object.entries(suhrn.podlaChyby).sort((a, b) => b[1] - a[1]))
    log(`  ${k}: ${v}`);
  log("Ochrany (mimo ok):");
  for (const [k, v] of Object.entries(suhrn.podlaOchrany).sort((a, b) => b[1] - a[1]))
    log(`  ${k}: ${v}`);
  if (!zapisat)
    log(
      `Odhad AI volaní pri ostrom behu: ${suhrn.odhadAiVolani} (+ ${suhrn.sXml} so strojovým XML bez AI)`,
    );
  log(`CSV: ${VYSTUP}/${runId}.csv`);
  if (zapisat) log(`Vrátenie: scripts/oprava-rozpisu-dph-rollback.ts --run-id ${runId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
