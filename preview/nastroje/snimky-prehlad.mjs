#!/usr/bin/env node
/**
 * Snímky oblasti „prehlad“ (redizajn): Prehľad /dashboard (Demo, CZ, prázdna
 * firma), Výnosy a náklady (ovládanie obdobia, s/bez DPH, tooltip), vek
 * pohľadávok s rozpisom, donut s tooltipom, /moje-ulohy, /jazdy/prehlad,
 * /ai-asistent (4 karty), zvonček (otvorený) a AI chat okno.
 *
 *   LD_LIBRARY_PATH=$(cat /home/patrik/qa-playwright/ldpath.txt) flock /tmp/redizajn-pw.lock \
 *     node preview/nastroje/snimky-prehlad.mjs --vystup=/home/patrik/redizajn-web/snimky/prehlad/po \
 *       [--dizajny=faktero,kompaktny] [--motivy=svetly,tmavy] [--sirky=1440,1920,390]
 *
 * Do `<vystup>/vysledok.json` zapíše pretečenie, chyby konzoly, cudzie požiadavky
 * a výsledky klikov (či sa prvok našiel a zareagoval).
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire("/home/patrik/qa-playwright/package.json");
const { chromium } = require("playwright");

const PORT = process.env.PREVIEW_PORT || 4317;
const ZAKLAD = `http://127.0.0.1:${PORT}`;
const volby = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, ...v] = a.slice(2).split("=");
      return [k, v.join("=")];
    }),
);
const vystup = resolve(volby.vystup ?? "/tmp/snimky-prehlad");
mkdirSync(vystup, { recursive: true });
const dizajny = (volby.dizajny ?? "faktero,kompaktny").split(",");
const motivy = (volby.motivy ?? "svetly,tmavy").split(",");
const sirky = (volby.sirky ?? "1440,1920,390").split(",").map(Number);
const cakaj = Number(volby.cakaj ?? 2500);

function uid(kluc) {
  const h = createHash("sha1").update("faktero-demo:" + kluc).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const FIRMY = { demo: uid("firma:demo"), cz: uid("firma:cz"), prazdna: uid("firma:prazdna") };

const prehliadac = await chromium.launch();
const vysledok = [];
const cudzie = [];
const kroky = [];

async function novyKontext(motiv, firma) {
  const kontext = await prehliadac.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "sk-SK",
    colorScheme: motiv === "tmavy" ? "dark" : "light",
  });
  await kontext.addInitScript(
    ([m, f]) => {
      try {
        localStorage.setItem("faktero.motiv", m);
        localStorage.setItem("faktero.demo.panel", "0");
        if (f) localStorage.setItem("faktero.active_company", f);
      } catch {}
    },
    [motiv, firma],
  );
  return kontext;
}

function sleduj(page, stav) {
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!["127.0.0.1", "localhost"].includes(u.hostname) && !["data:", "blob:"].includes(u.protocol))
      cudzie.push({ snimka: stav.aktualna, url: r.url() });
  });
  page.on("console", (m) => {
    if (m.type() === "error") (stav.chyby[stav.aktualna] ??= []).push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) =>
    (stav.chyby[stav.aktualna] ??= []).push("PAGEERROR " + e.message.slice(0, 200)),
  );
}

async function otvor(page, trasa) {
  await page.goto(ZAKLAD + trasa, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(cakaj);
}

async function info(page) {
  return page.evaluate(() => ({
    sirkaDokumentu: document.documentElement.scrollWidth,
    okno: window.innerWidth,
    redizajn: document.documentElement.hasAttribute("data-web-redizajn"),
    tmavy: document.documentElement.classList.contains("dark"),
    chybova: /Stránku sa nepodarilo načítať|Stránka sa nenašla/.test(document.body.innerText),
  }));
}

async function snimka(page, stav, nazov, { full = true, prvok = null } = {}) {
  stav.aktualna = nazov;
  try {
    const i = await info(page);
    if (prvok) await prvok.screenshot({ path: resolve(vystup, `${nazov}.png`) });
    else await page.screenshot({ path: resolve(vystup, `${nazov}.png`), fullPage: full });
    vysledok.push({ snimka: nazov, ...i, pretecenie: i.sirkaDokumentu > i.okno, chyby: stav.chyby[nazov] ?? [] });
  } catch (e) {
    vysledok.push({ snimka: nazov, chyba: String(e.message).slice(0, 200) });
  }
}

function krok(nazov, ok, pozn = "") {
  kroky.push({ krok: nazov, ok, pozn });
}

for (const dizajn of dizajny) {
  for (const motiv of motivy) {
    const kontext = await novyKontext(motiv, FIRMY.demo);
    const page = await kontext.newPage();
    page.setDefaultTimeout(15000);
    const stav = { aktualna: "_start", chyby: {} };
    sleduj(page, stav);
    await page.goto(`${ZAKLAD}/dashboard?demoPanel=0&demoDizajn=${dizajn}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.waitForTimeout(4000);

    for (const sirka of sirky) {
      await page.setViewportSize({ width: sirka, height: sirka < 600 ? 844 : sirka >= 1900 ? 1080 : 900 });
      const p = `${dizajn}-${motiv}-${sirka}`;

      /* Celé stránky. */
      for (const [nazov, trasa] of [
        ["prehlad", "/dashboard"],
        ["moje-ulohy", "/moje-ulohy"],
        ["jazdy-prehlad", "/jazdy/prehlad"],
        ["ai-asistent-chat", "/ai-asistent"],
      ]) {
        stav.aktualna = `${p}-${nazov}`;
        await otvor(page, trasa);
        await snimka(page, stav, `${p}-${nazov}`);
      }

      /* AI asistent — ostatné karty. */
      for (const [kluc, text] of [
        ["odporucania", "Odporúčania"],
        ["rizika", "Riziká"],
        ["automatizacie", "Automatizácie"],
      ]) {
        const b = page.locator("main button", { hasText: text }).first();
        const ok = (await b.count()) > 0;
        if (ok) await b.click({ timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(1200);
        krok(`${p} ai-asistent karta ${text}`, ok);
        await snimka(page, stav, `${p}-ai-asistent-${kluc}`);
      }

      /* Prehľad — interakcie. */
      try {
      stav.aktualna = `${p}-prehlad-interakcie`;
      await otvor(page, "/dashboard");
      const rozpisy = page.getByRole("button", { name: "Zobraziť rozpis" });
      const nRozpis = await rozpisy.count();
      for (let i = 0; i < nRozpis; i++) await rozpisy.nth(0).click();
      const skryt = await page.getByRole("button", { name: "Skryť rozpis" }).count();
      krok(`${p} vek: Zobraziť rozpis`, nRozpis === 2 && skryt === 2, `tlačidiel ${nRozpis}, po kliku Skryť ${skryt}`);
      const vek = page.locator("main h2", { hasText: "Vek pohľadávok" }).locator("xpath=ancestor::div[contains(@class,'grid')][1]");
      if (await vek.count()) await snimka(page, stav, `${p}-prehlad-vek-rozpis`, { prvok: vek.first() });

      const vn = page.locator("section[aria-labelledby='vn-nadpis']");
      if (await vn.count()) {
        await vn.scrollIntoViewIfNeeded();
        await vn.locator("select").selectOption("vlastne");
        await page.waitForTimeout(800);
        const datumy = await vn.locator("input[type=date]").count();
        krok(`${p} VN: Vlastné obdobie`, datumy === 2, `date polí ${datumy}`);
        await vn.getByRole("button", { name: "bez DPH" }).click();
        await page.waitForTimeout(1200);
        const stlacene = await vn.getByRole("button", { name: "bez DPH" }).getAttribute("aria-pressed");
        krok(`${p} VN: bez DPH`, stlacene === "true");
        const graf = vn.locator(".recharts-wrapper").first();
        if (await graf.count()) {
          const box = await graf.boundingBox();
          if (box) await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.5);
          await page.waitForTimeout(600);
          const tip = await vn.locator(".recharts-tooltip-wrapper").first().isVisible().catch(() => false);
          krok(`${p} VN: tooltip`, tip);
        }
        await snimka(page, stav, `${p}-prehlad-vn-vlastne-bezdph`, { prvok: vn });
        /* chybové obdobie */
        await vn.locator("input[type=date]").first().fill("2099-12-31");
        await page.waitForTimeout(600);
        const chybaObd = await vn.getByText("Začiatok obdobia je po jeho konci.").count();
        krok(`${p} VN: chyba obdobia`, chybaObd === 1);
        await snimka(page, stav, `${p}-prehlad-vn-chyba-obdobia`, { prvok: vn });
      } else krok(`${p} VN panel`, false, "nenájdený");

      const donut = page.locator("main h2", { hasText: "Rozdelenie faktúr" }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
      if (await donut.count()) {
        await donut.scrollIntoViewIfNeeded();
        const sektor = donut.locator(".recharts-pie-sector path, .recharts-sector").first();
        if (await sektor.count()) {
          await sektor.hover({ force: true }).catch(() => {});
          await page.waitForTimeout(500);
        }
        const tip = await donut.locator(".recharts-tooltip-wrapper").first().isVisible().catch(() => false);
        krok(`${p} donut: tooltip`, tip);
        await snimka(page, stav, `${p}-prehlad-donut`, { prvok: donut.first() });
      }

      /* Zvonček. */
      stav.aktualna = `${p}-zvoncek`;
      await page.evaluate(() => window.scrollTo(0, 0));
      const zvon = page.locator("button[aria-label^='Notifikácie']").first();
      if (await zvon.count()) {
        await zvon.click();
        await page.waitForTimeout(1500);
        const menu = page.locator("[role=menu]").first();
        const ok = await menu.isVisible().catch(() => false);
        krok(`${p} zvonček otvorený`, ok);
        await snimka(page, stav, `${p}-zvoncek`, { full: false });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
      } else krok(`${p} zvonček`, false, "nenájdený");

      /* AI chat okno. */
      stav.aktualna = `${p}-ai-chat`;
      const ai = page.locator("button[aria-label='Faktero AI asistent']").first();
      if (await ai.count()) {
        await ai.click();
        await page.waitForTimeout(1500);
        const okno = page.locator("[role=dialog][aria-label='Faktero AI asistent']");
        const ok = await okno.isVisible().catch(() => false);
        krok(`${p} AI chat otvorený`, ok);
        await snimka(page, stav, `${p}-ai-chat`, { full: false });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
      } else krok(`${p} AI tlačidlo`, false, "nenájdené");
      } catch (e) {
        krok(`${p} interakcie`, false, String(e.message).slice(0, 200));
      }
    }
    await kontext.close();

    /* Prehľad iných firiem (CZ, prázdna) — 1440 a 390. */
    for (const [kluc, id] of [
      ["cz", FIRMY.cz],
      ["prazdna", FIRMY.prazdna],
    ]) {
      const k2 = await novyKontext(motiv, id);
      const pg = await k2.newPage();
      pg.setDefaultTimeout(15000);
      const st = { aktualna: "_start", chyby: {} };
      sleduj(pg, st);
      await pg.goto(`${ZAKLAD}/dashboard?demoPanel=0&demoDizajn=${dizajn}`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await pg.waitForTimeout(3000);
      for (const sirka of sirky.filter((s) => s !== 1920)) {
        await pg.setViewportSize({ width: sirka, height: sirka < 600 ? 844 : 900 });
        for (const [nazov, trasa] of [
          ["prehlad", "/dashboard"],
          ["moje-ulohy", "/moje-ulohy"],
        ]) {
          st.aktualna = `${dizajn}-${motiv}-${sirka}-${nazov}-${kluc}`;
          await otvor(pg, trasa);
          await snimka(pg, st, `${dizajn}-${motiv}-${sirka}-${nazov}-${kluc}`);
        }
      }
      await k2.close();
    }
  }
}
await prehliadac.close();
writeFileSync(resolve(vystup, "vysledok.json"), JSON.stringify({ vysledok, kroky, cudzie }, null, 1));
console.log(
  JSON.stringify({
    snimok: vysledok.length,
    cudzie: cudzie.length,
    pretecenie: vysledok.filter((v) => v.pretecenie).map((v) => v.snimka),
    chybove: vysledok.filter((v) => v.chybova || v.chyba).map((v) => v.snimka),
    sChybamiKonzoly: vysledok.filter((v) => v.chyby?.length).map((v) => v.snimka),
    neuspesneKroky: kroky.filter((k) => !k.ok),
  }),
);
