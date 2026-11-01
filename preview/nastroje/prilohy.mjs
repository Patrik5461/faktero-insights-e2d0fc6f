#!/usr/bin/env node
/**
 * Vyrobí vymyslené prílohy do `preview/assets` (PDF faktúry, obrázok bločku,
 * logo, XML). Obsah je celý vymyslený — žiadne skutočné údaje.
 *   LD_LIBRARY_PATH=$(cat /home/patrik/qa-playwright/ldpath.txt) node preview/nastroje/prilohy.mjs
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire("/home/patrik/qa-playwright/package.json");
const { chromium } = require("playwright");
const ASSETS = resolve(dirname(fileURLToPath(import.meta.url)), "../assets");

const faktura = `<!doctype html><meta charset=utf-8><style>
body{font:12px/1.5 sans-serif;margin:40px;color:#111}h1{font-size:22px;margin:0 0 4px}
.d{position:fixed;top:40%;left:15%;font-size:110px;color:rgba(220,38,38,.12);transform:rotate(-25deg);font-weight:800}
table{width:100%;border-collapse:collapse;margin-top:20px}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}th:last-child,td:last-child{text-align:right}
.g{display:flex;justify-content:space-between;margin-top:20px}.b{border:1px solid #ccc;padding:10px;width:45%}</style>
<div class=d>DEMO</div><h1>Faktúra 20260001</h1><div>Vymyslený doklad pre ukážku Faktero — nemá žiadnu platnosť.</div>
<div class=g><div class=b><b>Dodávateľ</b><br>Demo s.r.o.<br>Ukážková 12, 811 01 Bratislava<br>IČO 00000001</div>
<div class=b><b>Odberateľ</b><br>Alfa Stavby s.r.o.<br>Hlavná 1, 811 01 Bratislava<br>IČO 10000001</div></div>
<table><tr><th>Položka</th><th>Množstvo</th><th>Cena</th><th>DPH</th><th>Spolu</th></tr>
<tr><td>Konzultácia – hodinová sadzba</td><td>10 hod</td><td>65,00 €</td><td>23 %</td><td>799,50 €</td></tr>
<tr><td>Doprava a montáž</td><td>100 km</td><td>0,65 €</td><td>23 %</td><td>79,95 €</td></tr></table>
<p style="text-align:right;font-size:15px"><b>Spolu na úhradu: 879,45 €</b><br>Základ 715,00 € · DPH 23 % 164,45 €</p>`;

const blocek = `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#e5e7eb}
.r{width:300px;margin:20px auto;background:#fff;padding:18px;font:13px/1.45 monospace;box-shadow:0 2px 8px rgba(0,0,0,.2)}
.c{text-align:center}.d{color:#dc2626;font-weight:700;text-align:center;font-size:20px}hr{border:0;border-top:1px dashed #999}</style>
<div class=r><div class=d>DEMO BLOČEK</div><div class=c>Čerpacie stanice Demo s.r.o.<br>Diaľničná 6, Senec<br>IČO 30000006 DIČ 2022000006</div><hr>
Natural 95  42,10 l x 1,629<br><span style="float:right">68,58</span><br>Umytie auta<span style="float:right">8,90</span><br><hr>
Základ 23 %<span style="float:right">62,99</span><br>DPH 23 %<span style="float:right">14,49</span><br><b>SPOLU EUR<span style="float:right">77,48</span></b><hr>
<div class=c>Vymyslený doklad – len ukážka</div></div>`;

const b = await chromium.launch();
const p = await b.newPage();
await p.setContent(faktura);
writeFileSync(resolve(ASSETS, "demo-doklad.pdf"), await p.pdf({ format: "A4" }));
await p.setViewportSize({ width: 340, height: 520 });
await p.setContent(blocek);
writeFileSync(resolve(ASSETS, "demo-blocek.png"), await p.screenshot({ fullPage: true }));
await b.close();

writeFileSync(
  resolve(ASSETS, "demo-logo.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="64" viewBox="0 0 240 64"><rect width="64" height="64" rx="14" fill="#0F7A4D"/><text x="32" y="44" font-family="sans-serif" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">D</text><text x="78" y="42" font-family="sans-serif" font-size="26" font-weight="700" fill="#0F172A">Demo s.r.o.</text></svg>`,
);
writeFileSync(
  resolve(ASSETS, "demo-doklad.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Vymyslený doklad pre preview Faktero -->\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><ID>DEMO-20260001</ID><IssueDate>2026-10-01</IssueDate><DocumentCurrencyCode>EUR</DocumentCurrencyCode><LegalMonetaryTotal><PayableAmount currencyID="EUR">879.45</PayableAmount></LegalMonetaryTotal></Invoice>\n`,
);
console.log("prílohy hotové");
