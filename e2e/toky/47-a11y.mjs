/*
  Prístupnosť: axe-core na 10 hlavných stránkach (8 v aplikácii, 2 verejné) musí
  nájsť 0 porušení so závažnosťou „critical“ a „serious“ (kontrast, mená
  tlačidiel a polí, aria, jazyk stránky…) a 0 porušení štyroch miernych
  pravidiel v STRAZENE_MIERNE. Dve stránky aj na šírke telefónu.
  Nič nezapisuje.

  axe-core sa berie z node_modules, ak tam je, inak sa raz stiahne z jsDelivr
  (pevná verzia) do /tmp. Do stránky ide cez `evaluate`, nie `<script>` —
  tak ho nezastaví ani budúca CSP.

  Úvodná stránka `/` tu zámerne nie je: jej nový návrh je vo vetve
  vlna/uvod-dizajn a pridá sa po nasadení.
*/
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cestaModulu } from "../lib/prostredie.mjs";

const VERZIA_AXE = "4.10.3";
const STRANKY_APP = [
  "/dashboard",
  "/faktury",
  "/faktury/nova",
  "/prijate-faktury",
  "/doklady",
  "/odberatelia",
  "/exporty",
  "/nastavenia",
];
const STRANKY_WEB = ["/cennik", "/prihlasenie", "/registracia", "/zabudnute-heslo"];
const MOBIL = ["/faktury", "/cennik"];

async function zdrojAxe() {
  try {
    return readFileSync(cestaModulu("axe-core/axe.min.js"), "utf8");
  } catch {
    /* nie je v node_modules */
  }
  const cache = `/tmp/axe-core-${VERZIA_AXE}.min.js`;
  if (existsSync(cache)) return readFileSync(cache, "utf8");
  const r = await fetch(`https://cdn.jsdelivr.net/npm/axe-core@${VERZIA_AXE}/axe.min.js`);
  if (!r.ok) throw new Error(`axe-core sa nepodarilo stiahnuť (${r.status})`);
  const js = await r.text();
  if (!js.includes("axe.run") && !js.includes("axe-core"))
    throw new Error("stiahnutý axe-core je neplatný");
  writeFileSync(cache, js);
  return js;
}

/*
  Z miernejších pravidiel sa strážia tie, ktoré sú opravené všade (vlna
  31. 10.): obsah mimo orientačných bodov, dva rovnaké orientačné body bez
  mena, preskočená úroveň nadpisu a prázdna hlavička stĺpca.
*/
const STRAZENE_MIERNE = ["region", "landmark-unique", "heading-order", "empty-table-header"];

/** Spustí axe na otvorenej stránke a vráti porušenia critical/serious a strážené mierne. */
async function zavazne(page, axe) {
  await page.evaluate(axe);
  return page.evaluate(async (mierne) => {
    // eslint-disable-next-line no-undef
    const r = await window.axe.run(document, { resultTypes: ["violations"] });
    return r.violations
      .filter((v) => v.impact === "critical" || v.impact === "serious" || mierne.includes(v.id))
      .map((v) => ({
        id: v.id,
        impact: v.impact,
        uzly: v.nodes.length,
        priklad: v.nodes
          .slice(0, 2)
          .map((n) => n.target.join(" "))
          .join(" ; "),
      }));
  }, STRAZENE_MIERNE);
}

async function nacitaj(t, page, cesta) {
  await t.go(cesta, page);
  await page
    .locator("main, h1")
    .first()
    .waitFor({ timeout: 20000 })
    .catch(() => {});
  // Zoznamy a karty sa dopĺňajú po načítaní dát.
  await page.waitForTimeout(1200);
}

export default {
  popis:
    "prístupnosť: 0 critical/serious (+ 4 strážené mierne) porušení axe na 12 hlavných stránkach",
  limit: 240000,
  async spusti(t) {
    const axe = await zdrojAxe();
    const zle = [];
    const zapis = (cesta, sirka, v) => {
      for (const x of v)
        zle.push(`${cesta} @${sirka}: ${x.id} [${x.impact}] ×${x.uzly} (${x.priklad})`);
    };

    await t.krok("aplikácia (1400 px)", async () => {
      for (const cesta of STRANKY_APP) {
        await nacitaj(t, t.page, cesta);
        t.over(!/prihlasenie/.test(t.page.url()), `${cesta}: relácia nedržala`);
        zapis(cesta, 1400, await zavazne(t.page, axe));
      }
    });

    // Verejný web bez relácie — vlastný kontext.
    const ctx = await t.page
      .context()
      .browser()
      .newContext({ viewport: { width: 1400, height: 1000 }, locale: "sk-SK" });
    const web = await ctx.newPage();
    web.setDefaultTimeout(20000);
    try {
      await t.krok("verejný web (1400 px) a jazyk stránky", async () => {
        for (const cesta of STRANKY_WEB) {
          await nacitaj(t, web, cesta);
          t.over(
            (await web.locator("html").getAttribute("lang")) === "sk",
            `${cesta}: <html lang> nie je sk`,
          );
          zapis(cesta, 1400, await zavazne(web, axe));
        }
      });
    } finally {
      await ctx.close().catch(() => {});
    }

    await t.krok("telefón 390 px", async () => {
      const mobil = await t.novaStranka({ mobil: true });
      for (const cesta of MOBIL) {
        await nacitaj(t, mobil, cesta);
        zapis(cesta, 390, await zavazne(mobil, axe));
      }
    });

    if (zle.length) writeFileSync(path.join(t.vystup, "a11y-porusenia.txt"), zle.join("\n") + "\n");
    // Krátko do súhrnu (chyba sa reže na 800 znakov), celý zoznam je v a11y-porusenia.txt.
    const kratko = zle.map((z) => z.replace(/ \(.*\)$/, ""));
    t.over(
      zle.length === 0,
      `axe: ${zle.length}× critical/serious (zoznam v a11y-porusenia.txt): ${kratko.join(" | ")}`,
    );
  },
};
