/*
  Verejný web: rýchlosť prvého zobrazenia, popisy stránok a „Preskočiť na obsah“.

  - Lišta súhlasu s cookies príde už v HTML zo servera. Keď sa kreslila až po
    hydratácii, na pomalom telefóne bola najväčším prvkom /prihlasenie a LCP
    vyšlo 8,1 s. Kto súhlas dal, tomu ju skryje skript v hlavičke ešte pred
    prvým kreslením; tlačidlá fungujú po hydratácii.
  - Hlavný skript webu nesmie niesť slovníky DE/CS (3,6 MB) — načítajú sa
    až pre nemčinu a češtinu.
  - /zabudnute-heslo a 404 majú vlastný titulok a popis, 404 aj `noindex`.
  - Prihlásenie, registrácia, zabudnuté heslo a 404 majú `<main id="obsah">`.
  - Logá platieb a ikona Knihy jázd idú z nášho servera.

  Bez prihlásenia, nič nezapisuje.
*/
import { BASE } from "../lib/prostredie.mjs";

const POPIS_KORENA = "Faktero je API-first fakturačná platforma";
const SUHLAS_KLUC = "faktero-cookie-consent";

async function html(cesta) {
  const r = await fetch(`${BASE}${cesta}`, { headers: { cookie: "faktero_jazyk=sk" } });
  return { status: r.status, text: await r.text() };
}
const meta = (text, meno) =>
  text.match(new RegExp(`<meta[^>]+name="${meno}"[^>]+content="([^"]*)"`))?.[1] ??
  text.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+name="${meno}"`))?.[1] ??
  null;
const titulok = (text) => text.match(/<title>([^<]*)<\/title>/)?.[1] ?? null;

export default {
  popis: "web: cookie lišta zo servera, LCP /prihlasenie na telefóne, veľkosť JS, popisy a #obsah",
  limit: 240000,
  async spusti(t) {
    await t.krok("HTML zo servera: lišta, #obsah, popisy", async () => {
      for (const cesta of ["/prihlasenie", "/registracia", "/zabudnute-heslo"]) {
        const { status, text } = await html(cesta);
        t.over(status === 200, `${cesta}: HTTP ${status}`);
        t.over(
          text.includes("data-cookie-lista"),
          `${cesta}: cookie lišta nie je v HTML zo servera`,
        );
        t.over(/<main[^>]*id="obsah"/.test(text), `${cesta}: chýba <main id="obsah">`);
        t.over(text.includes("data-cookie-suhlas"), `${cesta}: chýba skript, ktorý lištu skryje`);
      }
      const z = await html("/zabudnute-heslo");
      const popis = meta(z.text, "description") ?? "";
      t.over(
        popis && !popis.startsWith(POPIS_KORENA),
        `/zabudnute-heslo: popis je z koreňa („${popis.slice(0, 60)}“)`,
      );
      const n = await html(`/e2e-neexistuje-${Date.now()}`);
      t.over(n.status === 404, `404: HTTP ${n.status}`);
      t.over(/nenašla/i.test(titulok(n.text) ?? ""), `404: titulok „${titulok(n.text)}“`);
      t.over(
        !(meta(n.text, "description") ?? "").startsWith(POPIS_KORENA),
        "404: popis je z koreňa",
      );
      t.over(/noindex/.test(meta(n.text, "robots") ?? ""), "404: chýba robots noindex");
      t.over(/<main[^>]*id="obsah"/.test(n.text), '404: chýba <main id="obsah">');
    });

    await t.krok("hlavný skript bez slovníkov DE/CS", async () => {
      const { text } = await html("/prihlasenie");
      const skripty = [
        ...new Set([...text.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1])),
      ];
      t.over(skripty.length > 0, "v HTML nie sú skripty /assets/*.js");
      let najvacsi = { cesta: "", bajty: 0, text: "" };
      for (const s of skripty) {
        const r = await fetch(`${BASE}${s}`);
        const obsah = await r.text();
        if (obsah.length > najvacsi.bajty)
          najvacsi = { cesta: s, bajty: obsah.length, text: obsah };
      }
      t.log(`najväčší skript ${najvacsi.cesta}: ${Math.round(najvacsi.bajty / 1024)} kB`);
      // Kedysi 4,4 MB, z toho 3,6 MB slovníky.
      t.over(
        najvacsi.bajty < 2_000_000,
        `hlavný skript má ${Math.round(najvacsi.bajty / 1024)} kB (slovníky sú asi späť v ňom)`,
      );
      t.over(!najvacsi.text.includes("MwSt.-Erklärung"), "nemecký slovník je v hlavnom skripte");
    });

    const prehliadac = t.page.context().browser();

    await t.krok("LCP /prihlasenie na pomalom telefóne", async () => {
      const ctx = await prehliadac.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
        locale: "sk-SK",
      });
      try {
        await ctx.addInitScript(() => {
          window.__lcp = [];
          new PerformanceObserver((l) => {
            for (const e of l.getEntries())
              window.__lcp.push({
                t: e.startTime,
                lista: Boolean(e.element?.closest?.("[data-cookie-lista]")),
              });
          }).observe({ type: "largest-contentful-paint", buffered: true });
        });
        const p = await ctx.newPage();
        const cdp = await ctx.newCDPSession(p);
        await cdp.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: 150,
          downloadThroughput: (1.6 * 1024 * 1024) / 8,
          uploadThroughput: (750 * 1024) / 8,
        });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        await p.goto(`${BASE}/prihlasenie`, { waitUntil: "load", timeout: 90000 });
        await p.waitForTimeout(3000);
        const lcp = await p.evaluate(() => window.__lcp.at(-1));
        t.log(`LCP ${Math.round(lcp?.t ?? -1)} ms${lcp?.lista ? " (cookie lišta)" : ""}`);
        // Pred opravou 8,1 s; obsah zo servera má byť na obrazovke do 4 s.
        t.over(lcp && lcp.t < 4000, `LCP /prihlasenie na telefóne ${Math.round(lcp?.t ?? -1)} ms`);
      } finally {
        await ctx.close().catch(() => {});
      }
    });

    await t.krok("lišta: skrytá pri súhlase, tlačidlo funguje", async () => {
      const ctx = await prehliadac.newContext({
        viewport: { width: 1400, height: 1000 },
        locale: "sk-SK",
      });
      try {
        // Kto súhlas dal, lištu nesmie vidieť ani na okamih.
        await ctx.addInitScript((kluc) => {
          try {
            if (!sessionStorage.getItem("e2e-suhlas-raz")) {
              sessionStorage.setItem("e2e-suhlas-raz", "1");
              localStorage.setItem(
                kluc,
                JSON.stringify({
                  necessary: true,
                  analytics: false,
                  marketing: false,
                  acceptedAt: new Date().toISOString(),
                  recorded: true,
                }),
              );
            }
          } catch {
            /* bez úložiska */
          }
        }, SUHLAS_KLUC);
        const p = await ctx.newPage();
        await p.goto(`${BASE}/prihlasenie`, { waitUntil: "commit" });
        await p.waitForSelector("[data-cookie-lista]", { state: "attached", timeout: 20000 });
        const viditelna = await p.evaluate(() => {
          const el = document.querySelector("[data-cookie-lista]");
          return el ? getComputedStyle(el).display !== "none" : false;
        });
        t.over(!viditelna, "lišta je viditeľná napriek uloženému súhlasu");

        // Bez súhlasu: lišta je, „Prijať všetko“ ju po hydratácii zavrie.
        await p.evaluate((kluc) => localStorage.removeItem(kluc), SUHLAS_KLUC);
        await p.reload({ waitUntil: "domcontentloaded" });
        const prijat = p.getByRole("button", { name: /Prijať všetko/ });
        await prijat.waitFor({ timeout: 20000 });
        await prijat.click({ timeout: 20000 });
        await p.locator("[data-cookie-lista]").waitFor({ state: "detached", timeout: 15000 });
        const ulozene = await p.evaluate((kluc) => localStorage.getItem(kluc), SUHLAS_KLUC);
        t.over(Boolean(ulozene), "súhlas sa neuložil");
      } finally {
        await ctx.close().catch(() => {});
      }
    });

    await t.krok("logá platieb a ikony z nášho servera", async () => {
      const ctx = await prehliadac.newContext({ viewport: { width: 1400, height: 1000 } });
      try {
        const p = await ctx.newPage();
        for (const cesta of ["/", "/android"]) {
          await p.goto(`${BASE}${cesta}`, { waitUntil: "load", timeout: 60000 });
          await p.mouse.wheel(0, 20000);
          await p.waitForTimeout(1500);
          const obr = await p.evaluate(() =>
            [...document.images].map((i) => ({
              src: i.currentSrc || i.src,
              w: i.naturalWidth,
              zobr: i.getBoundingClientRect().width,
              hotovo: i.complete,
            })),
          );
          const cudzie = obr.filter((o) => /cdn\.gopay\.com|wikimedia\.org/.test(o.src));
          t.over(
            !cudzie.length,
            `${cesta}: obrázky z cudzieho servera ${cudzie.map((o) => o.src)}`,
          );
          const rozbite = obr.filter((o) => o.hotovo && o.w === 0 && o.src.startsWith(BASE));
          t.over(!rozbite.length, `${cesta}: nenačítané ${rozbite.map((o) => o.src).join(", ")}`);
          const velke = obr.filter((o) => o.w >= 1000 && o.zobr > 0 && o.zobr <= 64);
          t.over(!velke.length, `${cesta}: veľký obrázok v malom ${velke.map((o) => o.src)}`);
        }
      } finally {
        await ctx.close().catch(() => {});
      }
    });
  },
};
