/*
  Backfill: chýbajúce členenie DPH a KV DPH (voliteľne aj predkontácia) na
  existujúcich vystavených dokladoch — tou istou logikou ako pri vystavení
  (`resolveVatClassification`, src/lib/faktero/clenenie-vystavenej.ts).

    JITI_ALIAS='{"@/":"<repo>/src/"}' npx jiti scripts/backfill-clenenie-vystavenych.ts            # len počty (nič nezapíše)
    JITI_ALIAS='{"@/":"<repo>/src/"}' npx jiti scripts/backfill-clenenie-vystavenych.ts --apply    # zapíše
      --predkontacia       doplní aj chýbajúcu predkontáciu (bez neho len členenie a KV)
      --firma <uuid>       len jedna firma
      --env <cesta>        súbor s SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY (predvolene ./.env)

  Čo sa NIKDY nemení: doklad odovzdaný do Pohody / účtovníctva (`exported_at`),
  zmazaný doklad, zálohová faktúra (proforma), doklady neplatiteľov DPH a
  hodnota, ktorá na doklade už je (dopĺňajú sa len prázdne polia). Zapisuje
  servisným kľúčom, zámok odovzdaných dokladov tým neobchádza — odovzdané sa
  vôbec nevyberú.
*/

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  nacitajKontextClenenia,
  vyriesClenenieRiadku,
  zmenaClenenia,
  type KontextFirmyClenenia,
} from "../src/lib/faktero/clenenie-vystavenej.server";
import { rezimFirmy } from "../src/lib/faktero/dph-rezim";

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const APPLY = process.argv.includes("--apply");
const AJ_PK = process.argv.includes("--predkontacia");
/** Vynechá doklady, ktorým by automatika dala UNoslob (0 % bez prenesenia) — posúdi účtovník. */
const BEZ_OSLOBODENYCH = process.argv.includes("--bez-oslobodenych");
let vynechaneOslobodene = 0;
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

/** Celé dáta po 1000 (strop PostgREST). */
async function vsetky<T>(q: (od: number, po: number) => PromiseLike<{ data: T[] | null; error: any }>) {
  const out: T[] = [];
  for (let od = 0; ; od += 1000) {
    const { data, error } = await q(od, od + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function main() {
  const firmy = await vsetky<any>((od, po) => {
    let q = sb.from("companies").select("id, name, country, vat_payer, vat_scheme, ic_dph").order("name").range(od, po);
    if (FIRMA) q = q.eq("id", FIRMA);
    return q;
  });
  const platitelia = firmy.filter((f) => rezimFirmy(f).platitel);
  const suhrn: Record<string, any>[] = [];
  const vzorky: Record<string, unknown>[] = [];
  let zapisanych = 0;
  for (const f of platitelia) {
    const riadky = await vsetky<any>((od, po) =>
      sb
        .from("invoices")
        .select("*")
        .eq("company_id", f.id)
        .is("exported_at", null)
        .is("deleted_at", null)
        .neq("type", "proforma")
        .order("created_at")
        .range(od, po),
    );
    const chybajuce = riadky.filter(
      (r) =>
        !String(r.pohoda_clenenie_dph ?? "").trim() ||
        !String(r.kv_clenenie ?? "").trim() ||
        (AJ_PK && !String(r.pohoda_predkontacia ?? "").trim()),
    );
    if (!chybajuce.length) continue;
    const k: KontextFirmyClenenia = await nacitajKontextClenenia(sb, f.id);
    const s = {
      firma: f.name,
      dokladov: riadky.length,
      zmeni: 0,
      clenenie: {} as Record<string, number>,
      kv: {} as Record<string, number>,
      predkontacia: {} as Record<string, number>,
      bezZmeny: 0,
    };
    for (const r of chybajuce) {
      const v = await vyriesClenenieRiadku(sb, r, k);
      const zmena = zmenaClenenia(r, v, { lenDoplnit: true });
      if (!AJ_PK) {
        delete zmena.pohoda_predkontacia;
        delete zmena.predkontacia_zdroj;
      }
      if (BEZ_OSLOBODENYCH && String(zmena.pohoda_clenenie_dph ?? "").startsWith("UNoslob")) {
        vynechaneOslobodene++;
        console.log(`  vynechané (UNoslob, posúdi účtovník): ${f.name} ${r.invoice_number}`);
        continue;
      }
      const polia = ["pohoda_clenenie_dph", "kv_clenenie", "pohoda_predkontacia"].filter(
        (x) => x in zmena && zmena[x],
      );
      if (!polia.length) {
        s.bezZmeny++;
        continue;
      }
      s.zmeni++;
      if (zmena.pohoda_clenenie_dph) s.clenenie[zmena.pohoda_clenenie_dph] = (s.clenenie[zmena.pohoda_clenenie_dph] ?? 0) + 1;
      if (zmena.kv_clenenie) s.kv[zmena.kv_clenenie] = (s.kv[zmena.kv_clenenie] ?? 0) + 1;
      if (zmena.pohoda_predkontacia)
        s.predkontacia[zmena.pohoda_predkontacia] = (s.predkontacia[zmena.pohoda_predkontacia] ?? 0) + 1;
      if (vzorky.length < 5 || (vzorky.length < 8 && r.type !== "regular"))
        vzorky.push({
          firma: f.name,
          cislo: r.invoice_number,
          typ: r.type,
          stav: r.status,
          prenesenie: r.reverse_charge ? r.reverse_charge_type || "áno" : "",
          dph: r.vat_total,
          odberatel_icdph: r.customer_ic_dph,
          pred: `${r.pohoda_predkontacia ?? "—"} / ${r.pohoda_clenenie_dph ?? "—"} / ${r.kv_clenenie ?? "—"}`,
          po: `${zmena.pohoda_predkontacia ?? r.pohoda_predkontacia ?? "—"} / ${zmena.pohoda_clenenie_dph ?? r.pohoda_clenenie_dph ?? "—"} / ${zmena.kv_clenenie ?? r.kv_clenenie ?? "—"}`,
          zdroj: `${v.zdroj.clenenie ?? "—"} / ${v.zdroj.kv ?? "—"} / ${v.zdroj.predkontacia ?? "—"}`,
        });
      if (APPLY) {
        const { error } = await sb
          .from("invoices")
          .update({ ...zmena, clenenie_auto_at: new Date().toISOString() })
          .eq("id", r.id)
          .is("exported_at", null);
        if (error) console.warn(`  ${r.invoice_number}: ${error.message}`);
        else zapisanych++;
      }
    }
    suhrn.push(s);
  }
  console.log(APPLY ? "ZÁPIS" : "LEN POČTY (nič sa nezapísalo)", AJ_PK ? "— aj predkontácia" : "— členenie DPH a KV");
  console.log(`Firiem platiteľov: ${platitelia.length}, so zmenou: ${suhrn.filter((x) => x.zmeni).length}`);
  for (const s of suhrn)
    console.log(
      JSON.stringify({
        ...s,
        clenenie: s.clenenie,
        kv: s.kv,
        predkontacia: s.predkontacia,
      }),
    );
  console.log(
    "SPOLU zmení:",
    suhrn.reduce((a, s) => a + s.zmeni, 0),
    "bez zmeny (nedá sa určiť):",
    suhrn.reduce((a, s) => a + s.bezZmeny, 0),
  );
  console.log("VZORKY (predkontácia / členenie / KV):");
  for (const v of vzorky) console.log(JSON.stringify(v));
  if (BEZ_OSLOBODENYCH) console.log("Vynechané UNoslob:", vynechaneOslobodene);
  if (APPLY) console.log("Zapísaných:", zapisanych);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
