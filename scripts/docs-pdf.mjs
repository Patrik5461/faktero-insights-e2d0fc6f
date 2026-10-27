/*
  PDF z API dokumentácie (/docs/api) v slovenčine, češtine a nemčine.
  Stránka má tlačové štýly (.api-dokumentacia v styles.css), takže PDF je to,
  čo vytlačí prehliadač — bez hlavičky webu, s číslami strán.

    npm run docs:pdf                 # z bežiaceho servera na 127.0.0.1:3000
    BASE=http://127.0.0.1:3998 npm run docs:pdf

  Po každej zmene dokumentácie API (ApiDocsContent.tsx) spustiť znova a PDF
  commitnúť — tlačidlo „Stiahnuť PDF“ ich servuje z /docs/.
  Chromium je z /home/patrik/qa-playwright (na serveri potrebuje LD_LIBRARY_PATH z ldpath.txt).
*/
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const QA = "/home/patrik/qa-playwright";
const req = createRequire(`${QA}/`);
const { chromium } = req("playwright");
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const CIEL = new URL("../public/docs/", import.meta.url).pathname;
mkdirSync(CIEL, { recursive: true });

if (!process.env.LD_LIBRARY_PATH) {
  try {
    process.env.LD_LIBRARY_PATH = readFileSync(`${QA}/ldpath.txt`, "utf8").trim();
  } catch {
    /* mimo servera netreba */
  }
}

const NADPIS = {
  sk: "Faktero API dokumentácia",
  cs: "Faktero API dokumentace",
  de: "Faktero API-Dokumentation",
};
const STRANA = { sk: "Strana", cs: "Strana", de: "Seite" };

const b = await chromium.launch({ env: process.env });
try {
  for (const jazyk of ["sk", "cs", "de"]) {
    const ctx = await b.newContext({
      locale: jazyk === "sk" ? "sk-SK" : jazyk === "cs" ? "cs-CZ" : "de-DE",
    });
    const host = new URL(BASE).hostname;
    await ctx.addCookies([
      { name: "faktero_jazyk", value: jazyk, domain: host, path: "/" },
      // Súhlas s cookies — lišta by sa inak vytlačila na prvú stranu.
      { name: "faktero_cookies", value: "all", domain: host, path: "/" },
    ]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/docs/api`, { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: /Prijať všetko|Alle akzeptieren|Přijmout vše/ })
      .first()
      .click({ timeout: 1500 })
      .catch(() => {});
    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(800);
    const subor = `${CIEL}faktero-api-${jazyk}.pdf`;
    await page.pdf({
      path: subor,
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", bottom: "18mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:8px;width:100%;padding:0 14mm;color:#6b7280;font-family:sans-serif">${NADPIS[jazyk]} · faktero.sk/docs/api</div>`,
      footerTemplate: `<div style="font-size:8px;width:100%;padding:0 14mm;text-align:right;color:#6b7280;font-family:sans-serif">${STRANA[jazyk]} <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    });
    console.log("PDF:", subor);
    await ctx.close();
  }
} finally {
  await b.close();
}
