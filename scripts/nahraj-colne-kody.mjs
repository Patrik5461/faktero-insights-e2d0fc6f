/*
  Nahrá číselník kombinovanej nomenklatúry (colné kódy KN) do tabuľky `colne_kody`.

  Zdroj: Eurostat, dataset „Combined Nomenclature, 2026 (CN 2026)“ na data.europa.eu,
  distribúcia SKOS_CORE (súbor ESTAT-CN2026.rdf, ~170 MB). Z RDF sa berú
  8-miestne kódy (skos:notation) a vysvetľujúce texty (skos:scopeNote) v SK, CS,
  EN, DE a HU. Na nový rok stačí stiahnuť nový súbor a spustiť znova s ROK=….

  Použitie:
    SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/nahraj-colne-kody.mjs ESTAT-CN2026.rdf
*/
import { readFileSync } from "node:fs";

const subor = process.argv[2];
const url = process.env.SUPABASE_URL;
const kluc = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!subor || !url || !kluc) {
  throw new Error(
    "Použitie: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/nahraj-colne-kody.mjs subor.rdf",
  );
}
const rok = Number(process.env.ROK ?? 2026);
const JAZYKY = ["sk", "cs", "en", "de", "hu"];

const entity = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
const text = (blok, tag, jazyk) => {
  const m = new RegExp(`<${tag} [^>]*xml:lang="${jazyk}">([\\s\\S]*?)</${tag}>`).exec(blok);
  return m ? entity(m[1].replace(/\s+/g, " ").trim()) : null;
};
const bezDiakritiky = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const kody = new Map();
for (const blok of readFileSync(subor, "utf8").split("<rdf:Description ")) {
  const n = /<notation [^>]*>([^<]+)<\/notation>/.exec(blok);
  if (!n) continue;
  const kod = n[1].replace(/\s/g, "");
  if (!/^\d{8}$/.test(kod)) continue;
  const popis = {};
  for (const j of JAZYKY) {
    popis[j] =
      text(blok, "scopeNote", j) ?? (text(blok, "prefLabel", j) ?? "").replace(/^[\d ]*-*\s*/, "");
  }
  kody.set(kod, popis);
}

const riadky = [...kody].map(([kod, p]) => ({
  kod,
  rok,
  kapitola: kod.slice(0, 2),
  popis_sk: p.sk || p.en,
  popis_cs: p.cs || null,
  popis_en: p.en || null,
  popis_de: p.de || null,
  popis_hu: p.hu || null,
  hladaj: bezDiakritiky([p.sk, p.cs, p.en].filter(Boolean).join(" | ")),
}));
for (let i = 0; i < riadky.length; i += 1000) {
  const r = await fetch(`${url}/rest/v1/colne_kody`, {
    method: "POST",
    headers: {
      apikey: kluc,
      authorization: `Bearer ${kluc}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(riadky.slice(i, i + 1000)),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
}
console.log(`Nahraných ${riadky.length} kódov (rok ${rok}).`);
