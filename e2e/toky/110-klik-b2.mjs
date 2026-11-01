/*
  Klik na riadok v zoznamoch dokladov (balík 2 – prijaté a nespracované).

  Pravidlá (schválené 1. 11. 2026): klik na bunku riadku otvorí detail cez
  router, klik na zaškrtávadlo detail neotvorí, Ctrl+klik otvorí detail v novej
  karte a zoznam ostane, Enter na zameranom riadku otvorí detail; na 390 px
  otvorí detail ťuknutie na kartu.

  Len čítanie (firma Test). Zoznam bez riadkov sa preskočí s upozornením.
  Proti produkcii prejde až po nasadení klik na riadok.
*/

const ZOZNAMY = [
  { cesta: "/prijate-faktury", detail: /\/prijate-faktury\/[0-9a-f-]{8,}/ },
  { cesta: "/prijate-zalohove", detail: /\/prijate-faktury\/[0-9a-f-]{8,}/ },
  { cesta: "/doklady", detail: /\/doklady\/novy\?id=/ },
  { cesta: "/doklady/vyuctovania", detail: /\/doklady\/vyuctovania\/[0-9a-f-]{8,}/ },
  { cesta: "/ostatne-doklady", detail: /\/ostatne-doklady\/novy\?id=/ },
  { cesta: "/nespracovane", detail: /\/(nespracovane\/[0-9a-f-]{8,}|doklady\/novy\?id=)/ },
];

/** Označí v riadku/karte bunku s textom bez interaktívneho prvku (nie číslo dokladu). */
function oznacBunku(riadok) {
  return riadok.evaluate((r) => {
    const SEL =
      "a,button,input,select,textarea,label,summary,[role=button],[role=checkbox],[role=switch],[role=combobox],[role=link],[data-neotvarat]";
    document.querySelectorAll("[data-klik-test]").forEach((x) => x.removeAttribute("data-klik-test"));
    const kand = [...r.querySelectorAll("td, div, span, p")].filter((el) => {
      if (el.closest(SEL) || el.querySelector(SEL)) return false;
      if (!(el.textContent || "").trim()) return false;
      const b = el.getBoundingClientRect();
      return b.width > 4 && b.height > 4;
    });
    const el = kand[Math.min(1, kand.length - 1)];
    if (!el) return false;
    el.setAttribute("data-klik-test", "1");
    return true;
  });
}

async function prvyRiadok(t, page, cesta, sel) {
  await t.go(cesta, page);
  const r = page.locator(sel).first();
  const je = await r
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  if (!je) t.upozornenia.push(`${cesta}: firma nemá riadky, klik sa neoveril`);
  return je ? r : null;
}

export default {
  popis: "Doklady: klik na riadok otvorí detail (bunka, zaškrtávadlo, Ctrl+klik, Enter, 390 px)",
  limit: 300000,
  async spusti(t) {
    const page = t.page;
    const ctx = page.context();
    const sel = "tbody [data-klik-riadok]";

    for (const { cesta, detail } of ZOZNAMY) {
      await t.krok(`${cesta}: klik na bunku otvorí detail`, async () => {
        const r = await prvyRiadok(t, page, cesta, sel);
        if (!r) return;
        t.over(await oznacBunku(r), "v riadku nie je bunka bez ovládacieho prvku");
        const pred = page.url();
        await page.locator("[data-klik-test]").first().click();
        await page.waitForURL((u) => u.toString() !== pred, { timeout: 15000 });
        t.over(detail.test(page.url()), `klik viedol na ${page.url()}`);
      });

      await t.krok(`${cesta}: zaškrtávadlo detail neotvorí`, async () => {
        const r = await prvyRiadok(t, page, cesta, sel);
        if (!r) return;
        const chk = r.locator("input[type=checkbox]").first();
        if (!(await chk.count())) return;
        const pred = page.url();
        await chk.click();
        await page.waitForTimeout(800);
        t.over(page.url() === pred, `klik na zaškrtávadlo otvoril ${page.url()}`);
        await chk.click();
      });

      await t.krok(`${cesta}: Ctrl+klik otvorí novú kartu`, async () => {
        const r = await prvyRiadok(t, page, cesta, sel);
        if (!r) return;
        await oznacBunku(r);
        const pred = page.url();
        const [nova] = await Promise.all([
          ctx.waitForEvent("page", { timeout: 15000 }),
          page.locator("[data-klik-test]").first().click({ modifiers: ["Control"] }),
        ]);
        await nova.waitForLoadState("domcontentloaded").catch(() => {});
        t.over(detail.test(nova.url()), `nová karta je ${nova.url()}`);
        t.over(page.url() === pred, "pôvodná karta odišla zo zoznamu");
        await nova.close();
      });

      await t.krok(`${cesta}: Enter na riadku otvorí detail`, async () => {
        const r = await prvyRiadok(t, page, cesta, sel);
        if (!r) return;
        const pred = page.url();
        await r.focus();
        await page.keyboard.press("Enter");
        await page.waitForURL((u) => u.toString() !== pred, { timeout: 15000 });
        t.over(detail.test(page.url()), `Enter viedol na ${page.url()}`);
      });
    }

    const mobil = await t.novaStranka({ mobil: true });
    for (const { cesta, detail } of ZOZNAMY) {
      await t.krok(`${cesta} (390 px): ťuknutie na kartu otvorí detail`, async () => {
        const r = await prvyRiadok(t, mobil, cesta, "[data-klik-riadok]:visible");
        if (!r) return;
        t.over(await oznacBunku(r), "v karte nie je text bez ovládacieho prvku");
        const pred = mobil.url();
        await mobil.locator("[data-klik-test]").first().click();
        await mobil.waitForURL((u) => u.toString() !== pred, { timeout: 15000 });
        t.over(detail.test(mobil.url()), `ťuknutie viedlo na ${mobil.url()}`);
      });
    }
  },
};
