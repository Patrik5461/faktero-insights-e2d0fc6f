/*
  Jednorazová spätná kontrola prijatých eFaktúr.

    npx jiti scripts/efaktura-kontrola-spatne.ts --dry-run
    npx jiti scripts/efaktura-kontrola-spatne.ts [--vsetko]

  Prejde `efaktura_received_documents`, nad uloženým XML (`xml_payload`)
  spustí `skontrolujEfakturu` a zapíše len stĺpce `kontrola_*` a
  `skontrolovane_at`. Nič iné na doklade nemení a na poskytovateľa nevolá.

  Voľby:
    --dry-run   nič nezapíše, len vypíše súhrn
    --vsetko    skontroluje aj doklady, ktoré už výsledok majú (inak len prázdne)

  Kľúč berie zo SUPABASE_SERVICE_ROLE_KEY (prostredie alebo ecosystem.config.cjs).
*/
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import {
  najcastejsieNalezy,
  skontrolujNaUlozenie,
  type UlozenaKontrola,
} from "../src/lib/faktero/efaktura/kontrola/ulozenie";

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
  const skuska = process.argv.includes("--dry-run");
  const vsetko = process.argv.includes("--vsetko");
  const { url, sluzba } = prostredie();
  if (!url || !sluzba) {
    console.error("Chýba SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const sb = createClient(url, sluzba, { auth: { persistSession: false } });

  // Najprv len id (stránkovane, Supabase vráti najviac 1000 riadkov), XML potom po dávkach.
  const idcka: string[] = [];
  for (let od = 0; ; od += 1000) {
    let dotaz = sb
      .from("efaktura_received_documents")
      .select("id")
      .order("id")
      .range(od, od + 999);
    if (!vsetko) dotaz = dotaz.is("skontrolovane_at", null);
    const { data, error } = await dotaz;
    if (error) throw new Error(error.message);
    idcka.push(...(data ?? []).map((r) => r.id));
    if ((data ?? []).length < 1000) break;
  }

  const DAVKA = 20;
  let spolu = 0;
  let bezXml = 0;
  let zlyhane = 0;
  let sChybami = 0;
  let sVarovaniami = 0;
  let ok = 0;
  const vysledky: UlozenaKontrola[] = [];

  for (let i = 0; i < idcka.length; i += DAVKA) {
    const { data, error } = await sb
      .from("efaktura_received_documents")
      .select("id, document_number, xml_payload")
      .in("id", idcka.slice(i, i + DAVKA));
    if (error) throw new Error(error.message);
    const riadky = data ?? [];
    for (const r of riadky) {
      spolu += 1;
      if (!r.xml_payload) {
        bezXml += 1;
        continue;
      }
      const stlpce = skontrolujNaUlozenie(String(r.xml_payload));
      if (!stlpce) {
        zlyhane += 1;
        continue;
      }
      vysledky.push(stlpce.kontrola_vysledok);
      if (stlpce.kontrola_chyby > 0) sChybami += 1;
      else if (stlpce.kontrola_varovania > 0) sVarovaniami += 1;
      else ok += 1;
      if (!skuska) {
        const { error: e } = await sb
          .from("efaktura_received_documents")
          .update(stlpce as never)
          .eq("id", r.id);
        if (e) {
          zlyhane += 1;
          console.error(`${r.document_number ?? r.id}: zápis zlyhal — ${e.message}`);
        }
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        rezim: skuska ? "skúška (nič nezapísané)" : "zapísané",
        dokladov: spolu,
        bezXml,
        zlyhaneKontroly: zlyhane,
        bezNalezov: ok,
        lenVarovania: sVarovaniami,
        sChybami,
        najcastejsie: najcastejsieNalezy(vysledky, 15),
      },
      null,
      1,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
