#!/usr/bin/env node
/**
 * Prechod preview v Playwrighte: otvorí zadané stránky, zbiera chyby konzoly,
 * odpovede ≥ 400 a VŠETKY sieťové požiadavky — každá mimo 127.0.0.1/localhost
 * je porušenie (preview nesmie ísť von).
 *
 *   LD_LIBRARY_PATH=$(cat /home/patrik/qa-playwright/ldpath.txt) \
 *     node preview/nastroje/prechod.mjs [--snimky=adresar] [--dizajn=kompaktny] [--ucet=email] /dashboard /faktury …
 *
 * Bez ciest prejde zoznam z `preview/nastroje/trasy.json`.
 * Výsledok: JSON na stdout (súhrn) a podrobnosti do /tmp/redizajn-prechod.json (alebo --vystup=subor.json).
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/home/patrik/qa-playwright/package.json");
const { chromium } = require("playwright");

const ADRESAR = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PREVIEW_PORT || 4317;
const ZAKLAD = `http://127.0.0.1:${PORT}`;
const args = process.argv.slice(2);
const volby = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
let trasy = args.filter((a) => !a.startsWith("--"));
if (!trasy.length) trasy = JSON.parse(readFileSync(resolve(ADRESAR, "trasy.json"), "utf8"));
const snimky = volby.snimky ? resolve(volby.snimky) : null;
if (snimky) mkdirSync(snimky, { recursive: true });
const cakaj = Number(volby.cakaj ?? 2500);

const prehliadac = await chromium.launch();
const kontext = await prehliadac.newContext({ viewport: { width: 1440, height: 900 }, locale: "sk-SK" });
const page = await kontext.newPage();

const vsetkyPoziadavky = new Set();
const cudzie = [];
let aktualna = "";
const vysledky = {};
const zaznam = () => (vysledky[aktualna] ??= { chyby: [], http: [], cudzie: [], text: "" });

page.on("request", (r) => {
  const u = new URL(r.url());
  vsetkyPoziadavky.add(`${u.protocol}//${u.host}`);
  if (!["127.0.0.1", "localhost"].includes(u.hostname) && !["data:", "blob:"].includes(u.protocol)) {
    cudzie.push({ stranka: aktualna, url: r.url() });
    zaznam().cudzie.push(r.url());
  }
});
page.on("console", (m) => {
  if (m.type() === "error") zaznam().chyby.push(m.text().slice(0, 300));
});
page.on("pageerror", (e) => zaznam().chyby.push("PAGEERROR " + String(e.message).slice(0, 300)));
page.on("response", (r) => {
  if (r.status() >= 400) zaznam().http.push(`${r.status()} ${r.request().method()} ${r.url().replace(ZAKLAD, "").slice(0, 200)}`);
});

// Prvé otvorenie — automatické prihlásenie demo účtom, prípadne dizajn/účet.
const q = new URLSearchParams();
if (volby.ucet) q.set("demoUcet", volby.ucet);
if (volby.dizajn) q.set("demoDizajn", volby.dizajn);
q.set("demoPanel", volby.panel ?? "0");
aktualna = "_start";
await page.goto(`${ZAKLAD}/dashboard?${q}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(4000);

for (const t of trasy) {
  aktualna = t;
  zaznam();
  try {
    await page.goto(ZAKLAD + t, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(cakaj);
    const text = await page.evaluate(() => document.querySelector("main")?.innerText ?? document.body.innerText);
    zaznam().text = text.replace(/\s+/g, " ").slice(0, 400);
    zaznam().url = page.url().replace(ZAKLAD, "");
    if (/Stránku sa nepodarilo načítať|Stránka sa nenašla/.test(text)) zaznam().chyby.push("CHYBOVÁ STRÁNKA");
    if (snimky) {
      const meno = t.replace(/^\//, "").replace(/[^a-z0-9-]+/gi, "_") || "uvod";
      await page.screenshot({ path: resolve(snimky, `${meno}.png`), fullPage: true });
    }
  } catch (e) {
    zaznam().chyby.push("NAVIGÁCIA " + String(e.message).slice(0, 200));
  }
}

await prehliadac.close();
writeFileSync(volby.vystup ?? "/tmp/redizajn-prechod.json", JSON.stringify({ vysledky, cudzie, povody: [...vsetkyPoziadavky] }, null, 1));
const suhrn = Object.entries(vysledky).map(([t, v]) => ({
  t,
  url: v.url,
  chyby: v.chyby.length,
  http: v.http.length,
  cudzie: v.cudzie.length,
}));
console.log(JSON.stringify({ povody: [...vsetkyPoziadavky], cudzie: cudzie.length, stranky: suhrn }, null, 0));
