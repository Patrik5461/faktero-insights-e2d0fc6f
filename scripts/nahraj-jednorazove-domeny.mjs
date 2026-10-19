/*
  Zoznam jednorazových e-mailových domén do tabuľky `blokovane_domeny`.

  Zdroj: github.com/disposable-email-domains/disposable-email-domains
  (`disposable_email_blocklist.conf`), uložený v supabase/data/jednorazove-domeny.txt,
  plus naše vlastné v supabase/data/jednorazove-domeny-vlastne.txt.

  Použitie:
    node scripts/nahraj-jednorazove-domeny.mjs --stiahni     # obnoví súbor zo zdroja
    node scripts/nahraj-jednorazove-domeny.mjs --sql         # vypíše INSERT pre migráciu
    SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/nahraj-jednorazove-domeny.mjs
                                                             # doplní nové domény do DB

  Domény sa len pridávajú, nič sa nemaže — ručne pridanú doménu obnova nezruší.
*/
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const koren = resolve(import.meta.dirname, "..");
const SUBOR = resolve(koren, "supabase/data/jednorazove-domeny.txt");
const VLASTNE = resolve(koren, "supabase/data/jednorazove-domeny-vlastne.txt");
const ZDROJ =
  "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf";

const platna = (d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d);
const nacitaj = (subor) =>
  readFileSync(subor, "utf8")
    .split("\n")
    .map((r) => r.trim().toLowerCase())
    .filter((r) => r && !r.startsWith("#"))
    .filter(platna);

if (process.argv.includes("--stiahni")) {
  const r = await fetch(ZDROJ);
  if (!r.ok) throw new Error(`Zdroj vrátil ${r.status}`);
  const domeny = (await r.text())
    .split("\n")
    .map((x) => x.trim().toLowerCase())
    .filter(platna);
  if (domeny.length < 1000) throw new Error(`Podozrivo krátky zoznam (${domeny.length})`);
  writeFileSync(SUBOR, domeny.join("\n") + "\n");
  console.log(`Uložených ${domeny.length} domén do ${SUBOR}`);
  process.exit(0);
}

const riadky = [
  ...nacitaj(SUBOR).map((domena) => ({ domena, zdroj: "disposable-email-domains" })),
  ...nacitaj(VLASTNE).map((domena) => ({ domena, zdroj: "faktero" })),
];
const unikatne = [...new Map(riadky.map((r) => [r.domena, r])).values()];

if (process.argv.includes("--sql")) {
  // Po tisícoch domén v jednom príkaze, zvlášť zo zdroja a naše vlastné.
  for (const zdroj of ["disposable-email-domains", "faktero"]) {
    const vyber = unikatne.filter((r) => r.zdroj === zdroj);
    for (let i = 0; i < vyber.length; i += 1000) {
      const hodnoty = vyber
        .slice(i, i + 1000)
        .map((r) => `('${r.domena}')`)
        .join(",");
      console.log(
        `insert into public.blokovane_domeny (domena, zdroj) select d, '${zdroj}' from (values ${hodnoty}) v(d) on conflict (domena) do nothing;`,
      );
    }
  }
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const kluc = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !kluc) throw new Error("Chýba SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY");
for (let i = 0; i < unikatne.length; i += 1000) {
  const r = await fetch(`${url}/rest/v1/blokovane_domeny?on_conflict=domena`, {
    method: "POST",
    headers: {
      apikey: kluc,
      authorization: `Bearer ${kluc}`,
      "content-type": "application/json",
      prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(unikatne.slice(i, i + 1000)),
  });
  if (!r.ok) throw new Error(`Zápis zlyhal: ${r.status} ${await r.text()}`);
}
console.log(`Hotovo: ${unikatne.length} domén v blokovane_domeny`);
