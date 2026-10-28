/*
  PDF manuálov z Pomoci v slovenčine, češtine a nemčine:

    public/docs/faktero-manualy-{sk,cs,de}.pdf    všetky manuály v jednom súbore
                                                   (titulná strana, obsah, číslovanie)
    public/docs/faktero-prepojenia-{sk,cs,de}.pdf  prehľad API a prepojení samostatne

    npm run docs:manualy                    # z bežiaceho servera na 127.0.0.1:3000
    BASE=http://127.0.0.1:3998 npm run docs:manualy

  Manuály majú tlačové štýly (.pomoc-manual v styles.css). Poradie je také
  ako v rozcestníku Pomoci. Po zmene manuálov spustiť znova a PDF commitnúť.
  Chromium je z /home/patrik/qa-playwright (na serveri LD_LIBRARY_PATH z ldpath.txt).
*/
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const QA = "/home/patrik/qa-playwright";
const req = createRequire(`${QA}/`);
const { chromium } = req("playwright");
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const KOREN = new URL("../", import.meta.url).pathname;
const CIEL = `${KOREN}public/docs/`;
mkdirSync(CIEL, { recursive: true });

if (!process.env.LD_LIBRARY_PATH) {
  try {
    process.env.LD_LIBRARY_PATH = readFileSync(`${QA}/ldpath.txt`, "utf8").trim();
  } catch {
    /* mimo servera netreba */
  }
}

/* Poradie z rozcestníka; manuály, ktoré v ňom nie sú, idú na koniec. */
const rozcestnik = readFileSync(`${KOREN}src/routes/pomoc.index.tsx`, "utf8");
const vsetky = readdirSync(`${KOREN}src/routes`)
  .filter((f) => /^pomoc\..+\.tsx$/.test(f) && !f.endsWith(".test.tsx") && f !== "pomoc.index.tsx")
  .map(
    (f) =>
      "/pomoc/" +
      f
        .replace(/^pomoc\./, "")
        .replace(/\.tsx$/, "")
        .replace(/\./g, "/"),
  );
const poradie = [...rozcestnik.matchAll(/to: "(\/pomoc\/[a-z0-9/-]+)"/g)].map((m) => m[1]);
const MANUALY = [
  ...poradie.filter((c) => vsetky.includes(c)),
  ...vsetky.filter((c) => !poradie.includes(c)),
];

const TEXT = {
  sk: {
    nazov: "Faktero — manuály",
    podnadpis: "Všetky návody z Pomoci v jednom súbore",
    obsah: "Obsah",
    strana: "Strana",
    prepojenia: "Faktero — API a prepojenia",
  },
  cs: {
    nazov: "Faktero — manuály",
    podnadpis: "Všechny návody z Nápovědy v jednom souboru",
    obsah: "Obsah",
    strana: "Strana",
    prepojenia: "Faktero — API a propojení",
  },
  de: {
    nazov: "Faktero — Handbücher",
    podnadpis: "Alle Anleitungen aus der Hilfe in einer Datei",
    obsah: "Inhalt",
    strana: "Seite",
    prepojenia: "Faktero — API und Anbindungen",
  },
};
const OKRAJ = { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" };
const datum = new Date().toLocaleDateString("sk-SK");
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

const b = await chromium.launch({ env: process.env });
try {
  for (const jazyk of ["sk", "cs", "de"]) {
    const T = TEXT[jazyk];
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
    const casti = [];
    for (const cesta of MANUALY) {
      await page.goto(`${BASE}${cesta}`, { waitUntil: "networkidle" });
      await page.emulateMedia({ media: "print" });
      await page.waitForTimeout(300);
      const nadpis = ((await page.textContent("h1").catch(() => null)) ?? cesta).trim();
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: OKRAJ,
        displayHeaderFooter: true,
        headerTemplate: `<div style="font-size:8px;width:100%;padding:0 14mm;color:#6b7280;font-family:sans-serif">Faktero · ${esc(nadpis)} · faktero.sk${cesta}</div>`,
        footerTemplate: `<div></div>`,
      });
      casti.push({ cesta, nadpis, pdf, strany: (await PDFDocument.load(pdf)).getPageCount() });
      if (cesta === "/pomoc/prepojenia") {
        // Prehľad prepojení aj samostatne — s vlastným číslovaním strán.
        await page.pdf({
          path: `${CIEL}faktero-prepojenia-${jazyk}.pdf`,
          format: "A4",
          printBackground: true,
          margin: OKRAJ,
          displayHeaderFooter: true,
          headerTemplate: `<div style="font-size:8px;width:100%;padding:0 14mm;color:#6b7280;font-family:sans-serif">${esc(T.prepojenia)} · faktero.sk${cesta}</div>`,
          footerTemplate: `<div style="font-size:8px;width:100%;padding:0 14mm;text-align:right;color:#6b7280;font-family:sans-serif">${T.strana} <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
        });
        console.log("PDF:", `${CIEL}faktero-prepojenia-${jazyk}.pdf`);
      }
    }

    /* Titulná strana a obsah — čísla strán sa dopočítajú, keď je známa dĺžka obsahu. */
    const uvod = async (stranyUvodu) => {
      let strana = stranyUvodu + 1;
      const riadky = casti
        .map((c) => {
          const r = `<tr><td>${esc(c.nadpis)}</td><td class="c">${strana}</td></tr>`;
          strana += c.strany;
          return r;
        })
        .join("");
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>
          body{font-family:Inter,Arial,sans-serif;color:#111827;margin:0}
          .titul{height:255mm;display:flex;flex-direction:column;justify-content:center;page-break-after:always}
          .titul h1{font-size:40px;margin:0;color:#0f7a4d}.titul p{font-size:16px;color:#4b5563;margin:12px 0 0}
          h2{font-size:22px;margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:12px}
          td{padding:5px 0;border-bottom:1px solid #e5e7eb}td.c{text-align:right;width:60px;color:#4b5563}
        </style></head><body>
          <div class="titul"><h1>${esc(T.nazov)}</h1><p>${esc(T.podnadpis)}</p><p>faktero.sk/pomoc · ${datum}</p></div>
          <h2>${esc(T.obsah)}</h2><table>${riadky}</table>
        </body></html>`,
      );
      return page.pdf({ format: "A4", printBackground: true, margin: OKRAJ });
    };
    let uvodPdf = await uvod(2);
    const stranyUvodu = (await PDFDocument.load(uvodPdf)).getPageCount();
    if (stranyUvodu !== 2) uvodPdf = await uvod(stranyUvodu);

    const spolu = await PDFDocument.create();
    spolu.setTitle(T.nazov);
    spolu.setAuthor("Faktero");
    for (const zdroj of [uvodPdf, ...casti.map((c) => c.pdf)]) {
      const d = await PDFDocument.load(zdroj);
      for (const s of await spolu.copyPages(d, d.getPageIndices())) spolu.addPage(s);
    }
    // Priebežné číslovanie (titulná strana bez čísla).
    const pismo = await spolu.embedFont(StandardFonts.Helvetica);
    const stranky = spolu.getPages();
    stranky.forEach((s, i) => {
      if (i === 0) return;
      const text = `${T.strana} ${i + 1} / ${stranky.length}`;
      const w = pismo.widthOfTextAtSize(text, 8);
      s.drawText(text, {
        x: s.getWidth() - 40 - w,
        y: 22,
        size: 8,
        font: pismo,
        color: rgb(0.42, 0.45, 0.5),
      });
    });
    const subor = `${CIEL}faktero-manualy-${jazyk}.pdf`;
    writeFileSync(subor, await spolu.save());
    console.log("PDF:", subor, `(${casti.length} manuálov, ${stranky.length} strán)`);
    await ctx.close();
  }
} finally {
  await b.close();
}
