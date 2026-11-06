/*
  Backfill: zápis v obchodnom/živnostenskom registri (`companies.registracia_text`
  + `register_sud/oddiel/vlozka`) pre firmy s IČO a prázdnym zápisom.

    JITI_ALIAS='{"@/":"<repo>/src/"}' npx jiti scripts/doplnit-zapis-v-registri.ts          # nanečisto — len vypíše
    JITI_ALIAS='{"@/":"<repo>/src/"}' npx jiti scripts/doplnit-zapis-v-registri.ts --apply  # zapíše
      --firma <uuid>   len jedna firma
      --env <cesta>    súbor s SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY (predvolene ./.env)

  Zdroje (len čítanie): `company_cache.raw.RegisterNumberText` (FinStat, ak ho už
  appka kedy stiahla — skript FinStat nevolá, aby nemíňal kvótu), inak RPO
  (api.statistics.sk) pre SK, ARES veřejný rejstřík pre CZ. DE firmy sa
  preskakujú (majú Handelsregister). Vyplnený zápis sa NIKDY neprepisuje.
*/

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { nazvySedia, textZapisuVRegistri, zapisZFinstatTextu, type ZapisZRegistra } from "../src/lib/faktero/zapis-v-registri";
import {
  jeCeskaKrajina,
  zapisZAresPodlaIco,
  zapisZRpoPodlaIco,
} from "../src/lib/faktero/zapis-v-registri-zdroje";

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const APPLY = process.argv.includes("--apply");
const FIRMA = arg("--firma");

function env(cesta: string) {
  const out: Record<string, string> = {};
  for (const r of readFileSync(cesta, "utf8").split("\n")) {
    const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const e = { ...env(arg("--env") ?? ".env"), ...process.env } as Record<string, string>;
const sb = createClient(e.SUPABASE_URL || e.VITE_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function vsetky<T>(q: (od: number, po: number) => PromiseLike<{ data: T[] | null; error: any }>) {
  const out: T[] = [];
  for (let od = 0; ; od += 1000) {
    const { data, error } = await q(od, od + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

const pauza = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // `*`: nanečisto beží aj pred migráciou — chýbajúci stĺpec = prázdny zápis.
  const firmy = await vsetky<any>((od, po) => {
    let q = sb.from("companies").select("*").order("name").range(od, po);
    if (FIRMA) q = q.eq("id", FIRMA);
    return q;
  });
  const maStlpec = firmy.length > 0 && "registracia_text" in firmy[0];
  if (APPLY && !maStlpec) throw new Error("Stĺpec companies.registracia_text neexistuje — najprv migrácia 20261106120000_zapis_v_registri.sql.");

  const doplnit: { f: any; zapis: ZapisZRegistra; zdroj: string }[] = [];
  const nie: { f: any; dovod: string }[] = [];
  let uzMaju = 0;

  for (const f of firmy) {
    const ico = String(f.ico ?? "").replace(/\s+/g, "");
    const krajina = String(f.country ?? "").toUpperCase();
    if (krajina === "DE" || krajina === "DEU") {
      nie.push({ f, dovod: "DE firma (Handelsregister)" });
      continue;
    }
    if (textZapisuVRegistri(f)) {
      uzMaju++;
      continue;
    }
    if (!/^\d{6,8}$/.test(ico)) {
      nie.push({ f, dovod: ico ? `neplatné IČO „${ico}“` : "bez IČO" });
      continue;
    }
    const ico8 = ico.padStart(8, "0");
    const cz = jeCeskaKrajina(f.country);

    let zapis: ZapisZRegistra | null = null;
    let zdroj = "";
    let nazovRegistra: string | null = null;
    if (!cz) {
      const { data: c } = await sb
        .from("company_cache")
        .select("raw")
        .eq("ico", ico8)
        .eq("status", "ok")
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const z = zapisZFinstatTextu((c as any)?.raw?.RegisterNumberText);
      if (z?.text) {
        zapis = z;
        zdroj = "finstat-cache";
        nazovRegistra = (c as any)?.raw?.Name ?? null;
      }
    }
    if (!zapis) {
      const zisti = () => (cz ? zapisZAresPodlaIco(ico8) : zapisZRpoPodlaIco(ico8));
      let r = await zisti();
      // Verejné API občas nestihne odpovedať — jeden ďalší pokus.
      if (r.stav === "chyba") {
        await pauza(2000);
        r = await zisti();
      }
      await pauza(300); // šetrne k verejným API
      if (r.stav === "ok") {
        zapis = r.zapis;
        zdroj = r.zdroj;
        nazovRegistra = r.nazov ?? null;
      } else {
        nie.push({ f, dovod: r.dovod });
        continue;
      }
    }
    // Vymyslené alebo cudzie IČO: zápis by patril inej firme.
    if (nazovRegistra && !nazvySedia(f.name, nazovRegistra)) {
      nie.push({ f, dovod: `názov v registri nesedí („${nazovRegistra}“) — ${zapis.text}` });
      continue;
    }
    doplnit.push({ f, zapis, zdroj });
  }

  console.log(`Firiem spolu: ${firmy.length}; zápis už majú: ${uzMaju}; stĺpec v DB: ${maStlpec ? "áno" : "NIE (pred migráciou)"}`);
  console.log(`\n${APPLY ? "DOPĹŇAM" : "Doplnilo by sa"} (${doplnit.length}):`);
  for (const { f, zapis, zdroj } of doplnit)
    console.log(`  ${f.ico} | ${f.name} | [${zdroj}, ${zapis.druh}] ${zapis.text}`);
  console.log(`\nNedoplní sa (${nie.length}):`);
  for (const { f, dovod } of nie) console.log(`  ${f.ico ?? "—"} | ${f.name} | ${dovod}`);

  if (!APPLY) {
    console.log("\nNanečisto — nič sa nezapísalo. Zápis: --apply");
    return;
  }
  let ok = 0;
  for (const { f, zapis } of doplnit) {
    // Podmienka `is null` chráni pred prepisom, keby ho medzitým niekto vyplnil.
    const { data, error } = await sb
      .from("companies")
      .update({
        registracia_text: zapis.text,
        register_sud: f.register_sud ?? zapis.sud,
        register_oddiel: f.register_oddiel ?? zapis.oddiel,
        register_vlozka: f.register_vlozka ?? zapis.vlozka,
      } as never)
      .eq("id", f.id)
      .is("registracia_text", null)
      .select("id");
    if (error) console.error(`  CHYBA ${f.name}: ${error.message}`);
    else if (data?.length) ok++;
  }
  console.log(`\nZapísané: ${ok} z ${doplnit.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
