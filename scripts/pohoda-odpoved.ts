/*
  Vyhodnotenie odpovede z Pohody (`responsePack`) po skúšobnom importe.

    npx jiti scripts/pohoda-odpoved.ts <odpoveď.xml> [<balík.zip alebo priečinok s XML>] [--json]

  Pohoda po XML importe zapíše odpoveď (v import.ini `response_dir`, pri
  ručnom importe cez Súbor → Dátová komunikácia → XML import ju uloží vedľa
  dávky). Skript povie pri každom doklade dávky, či ho Pohoda založila, aké
  číslo mu pridelila a čo upravila alebo odmietla — s vysvetlením kódov chýb
  po slovensky. Keď dostane aj odoslaný balík, priradí odpoveď k súborom
  a doklady, o ktorých Pohoda mlčí, vypíše ako chýbajúce.

  Nič nezapisuje do databázy. Kód odpovede skončí 1, keď niečo Pohoda odmietla.
*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import { rozoberBalikOdpovede, suhrnOdpovede } from "../src/lib/faktero/pohoda-odpoved";

function dekoduj(b: Uint8Array): string {
  const hlavicka = new TextDecoder("ascii").decode(b.slice(0, 200));
  const kod = /encoding\s*=\s*["']([\w-]+)["']/i.exec(hlavicka)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(kod).decode(b);
  } catch {
    return new TextDecoder("utf-8").decode(b);
  }
}

/** id položky dávky → súbor a číslo dokladu, ako odišli do Pohody. */
function odoslane(cesta: string): Map<string, { subor: string; cislo: string; agenda: string }> {
  const mapa = new Map<string, { subor: string; cislo: string; agenda: string }>();
  const subory: [string, Uint8Array][] = [];
  if (statSync(cesta).isDirectory()) {
    for (const f of readdirSync(cesta).filter((f) => f.toLowerCase().endsWith(".xml")))
      subory.push([f, readFileSync(path.join(cesta, f))]);
  } else if (cesta.toLowerCase().endsWith(".zip")) {
    for (const [f, b] of Object.entries(unzipSync(readFileSync(cesta))))
      if (f.toLowerCase().endsWith(".xml")) subory.push([f, b]);
  } else subory.push([path.basename(cesta), readFileSync(cesta)]);

  for (const [subor, b] of subory) {
    const xml = dekoduj(b);
    const re = /<dat:dataPackItem\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      const telo = m[2]!;
      const agenda = /<(\w+):(\w+)\s+version=/.exec(telo)?.[2] ?? "?";
      const cislo =
        /<typ:numberRequested[^>]*>([^<]*)</.exec(telo)?.[1] ??
        /<\w+:originalDocument(?:Number)?>([^<]*)</.exec(telo)?.[1] ??
        /<typ:number>([^<]*)</.exec(telo)?.[1] ??
        "";
      mapa.set(m[1]!, { subor, cislo, agenda });
    }
  }
  return mapa;
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const json = process.argv.includes("--json");
if (!args[0]) {
  console.error(
    "Použitie: npx jiti scripts/pohoda-odpoved.ts <odpoveď.xml> [<balík.zip|priečinok>] [--json]",
  );
  process.exit(2);
}

const odpoved = rozoberBalikOdpovede(dekoduj(readFileSync(args[0])));
const balik = args[1] ? odoslane(args[1]) : null;
const suhrn = suhrnOdpovede(odpoved);
const chybajuce = balik
  ? [...balik.keys()].filter((id) => !odpoved.polozky.some((p) => p.id === id))
  : [];

if (json) {
  console.log(
    JSON.stringify(
      {
        balik: {
          stav: odpoved.stav,
          poznamka: odpoved.poznamka,
          verziaPohody: odpoved.programVersion,
          ico: odpoved.ico,
        },
        suhrn,
        polozky: odpoved.polozky.map((p) => ({ ...p, odoslane: balik?.get(p.id) ?? null })),
        chybajuce: chybajuce.map((id) => ({ id, ...balik!.get(id)! })),
      },
      null,
      2,
    ),
  );
} else {
  console.log(
    `Odpoveď Pohody: balík ${odpoved.stav ?? "?"}${odpoved.poznamka ? ` (${odpoved.poznamka})` : ""}, ` +
      `verzia ${odpoved.programVersion ?? "?"}, IČO ${odpoved.ico ?? "?"}`,
  );
  console.log(
    `Doklady: ${odpoved.polozky.length} — založených bez výhrad ${suhrn.ok}, s upozornením ${suhrn.upozornenia}, odmietnutých ${suhrn.chyby}` +
      (balik ? `, bez odpovede ${chybajuce.length} z ${balik.size} odoslaných` : ""),
  );
  console.log("");
  for (const p of odpoved.polozky) {
    const o = balik?.get(p.id);
    const znak = p.stav === "ok" ? "OK " : p.stav === "warning" ? "UPOZ" : "CHYBA";
    console.log(
      `${znak.padEnd(5)} ${o ? `${o.subor} · ${o.agenda} ${o.cislo}` : p.id}` +
        `${p.cislo ? ` → v Pohode č. ${p.cislo}` : ""}${p.duplicita ? " (už bol v Pohode)" : ""}`,
    );
    if (p.poznamka) console.log(`      ${p.poznamka}`);
  }
  for (const id of chybajuce) {
    const o = balik!.get(id)!;
    console.log(
      `CHÝBA ${o.subor} · ${o.agenda} ${o.cislo} — Pohoda o ňom nič nepovedala (id ${id})`,
    );
  }
}
process.exit(suhrn.chyby || chybajuce.length || odpoved.stav === "error" ? 1 : 0);
