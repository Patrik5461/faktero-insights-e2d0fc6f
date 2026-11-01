#!/usr/bin/env node
/**
 * Snímky celých stránok v matici dizajn × motív × šírka (redizajn webu).
 *
 *   LD_LIBRARY_PATH=$(cat /home/patrik/qa-playwright/ldpath.txt) flock /tmp/redizajn-pw.lock \
 *     node preview/nastroje/snimky-dizajn.mjs --vystup=/home/patrik/redizajn-web/snimky/dizajn/po \
 *       [--dizajny=faktero,kompaktny] [--motivy=svetly,tmavy] [--sirky=1440,1920,390] \
 *       [nazov=/trasa …]
 *
 * Bez trás odfotí shell + Prehľad, zoznam, detail, formulár a nastavenia.
 * Do `<vystup>/vysledok.json` zapíše pre každú snímku: vodorovné pretečenie
 * stránky (scrollWidth > šírka okna), chyby konzoly a požiadavky mimo
 * 127.0.0.1/localhost (`cudzie` musí byť 0).
 */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire("/home/patrik/qa-playwright/package.json");
const { chromium } = require("playwright");

const PORT = process.env.PREVIEW_PORT || 4317;
const ZAKLAD = `http://127.0.0.1:${PORT}`;
const args = process.argv.slice(2);
const volby = Object.fromEntries(
  args.filter((a) => a.startsWith("--")).map((a) => {
    const [k, ...v] = a.slice(2).split("=");
    return [k, v.join("=")];
  }),
);
const vystup = resolve(volby.vystup ?? "/tmp/snimky-dizajn");
mkdirSync(vystup, { recursive: true });
const dizajny = (volby.dizajny ?? "faktero,kompaktny").split(",");
const motivy = (volby.motivy ?? "svetly,tmavy").split(",");
const sirky = (volby.sirky ?? "1440,1920,390").split(",").map(Number);
const cakaj = Number(volby.cakaj ?? 2500);

let stranky = args
  .filter((a) => !a.startsWith("--"))
  .map((a) => {
    const i = a.indexOf("=");
    return i > 0 ? [a.slice(0, i), a.slice(i + 1)] : [a.replace(/[^a-z0-9]+/gi, "_"), a];
  });
if (!stranky.length)
  stranky = [
    ["prehlad", "/dashboard"],
    ["zoznam-faktur", "/faktury?type=vydane"],
    ["detail-faktury", "/faktury/33dbf7aa-20ef-49c8-acd7-5a62e756ce03"],
    ["formular-faktury", "/faktury/nova"],
    ["nastavenia", "/nastavenia"],
  ];

const prehliadac = await chromium.launch();
const vysledok = [];
const cudzieVsetky = [];

for (const dizajn of dizajny) {
  for (const motiv of motivy) {
    const kontext = await prehliadac.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "sk-SK",
      colorScheme: motiv === "tmavy" ? "dark" : "light",
    });
    await kontext.addInitScript((m) => {
      try {
        localStorage.setItem("faktero.motiv", m);
        localStorage.setItem("faktero.demo.panel", "0");
      } catch {}
    }, motiv);
    const page = await kontext.newPage();
    let aktualna = "_start";
    const chyby = {};
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (!["127.0.0.1", "localhost"].includes(u.hostname) && !["data:", "blob:"].includes(u.protocol))
        cudzieVsetky.push({ stranka: aktualna, url: r.url() });
    });
    page.on("console", (m) => {
      if (m.type() === "error") (chyby[aktualna] ??= []).push(m.text().slice(0, 200));
    });
    page.on("pageerror", (e) => (chyby[aktualna] ??= []).push("PAGEERROR " + e.message.slice(0, 200)));

    await page.goto(`${ZAKLAD}/dashboard?demoPanel=0&demoDizajn=${dizajn}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.waitForTimeout(4000);

    for (const sirka of sirky) {
      await page.setViewportSize({ width: sirka, height: sirka < 600 ? 844 : sirka >= 1900 ? 1080 : 900 });
      for (const [nazov, trasa] of stranky) {
        aktualna = `${dizajn}-${motiv}-${sirka}-${nazov}`;
        try {
          await page.goto(ZAKLAD + trasa, { waitUntil: "domcontentloaded", timeout: 120000 });
          await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
          await page.waitForTimeout(cakaj);
          const info = await page.evaluate(() => ({
            sirkaDokumentu: document.documentElement.scrollWidth,
            okno: window.innerWidth,
            redizajn: document.documentElement.hasAttribute("data-web-redizajn"),
            tmavy: document.documentElement.classList.contains("dark"),
            dizajn: document.documentElement.dataset.dizajn ?? "faktero",
            chybova: /Stránku sa nepodarilo načítať|Stránka sa nenašla/.test(document.body.innerText),
          }));
          await page.screenshot({ path: resolve(vystup, `${aktualna}.png`), fullPage: true });
          vysledok.push({
            snimka: aktualna,
            ...info,
            pretecenie: info.sirkaDokumentu > info.okno,
            chyby: chyby[aktualna] ?? [],
          });
        } catch (e) {
          vysledok.push({ snimka: aktualna, chyba: String(e.message).slice(0, 200) });
        }
      }
    }
    await kontext.close();
  }
}
await prehliadac.close();
writeFileSync(resolve(vystup, "vysledok.json"), JSON.stringify({ vysledok, cudzie: cudzieVsetky }, null, 1));
console.log(
  JSON.stringify({
    snimok: vysledok.length,
    cudzie: cudzieVsetky.length,
    pretecenie: vysledok.filter((v) => v.pretecenie).map((v) => v.snimka),
    chybove: vysledok.filter((v) => v.chybova || v.chyba).map((v) => v.snimka),
    sChybamiKonzoly: vysledok.filter((v) => v.chyby?.length).map((v) => v.snimka),
  }),
);
