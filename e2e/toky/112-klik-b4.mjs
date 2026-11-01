/*
  Klik na riadok – balík 4 (Banka, Pokladňa, Účtovníctvo, Exporty, Importy).
  Len číta: nič neukladá, neparuje ani neexportuje.

  - /uctovnictvo/na-kontrolu: klik na bunku (nie na číslo) otvorí detail dokladu,
    zaškrtávadlo len označí, Ctrl+klik otvorí novú kartu, Enter na riadku detail;
  - /bankove-ucty/transakcie: klik na riadok otvorí okno Detail pohybu;
  - /bankove-ucty: klik na kartu účtu → jeho transakcie;
  - /uctovnictvo/pravidla: klik na riadok otvorí úpravu pravidla (okno sa zavrie
    Escape, nič sa neuloží);
  - /uctovnictvo/dph (minulý mesiac): vystavená faktúra → /faktury/$id;
  - /exporty: klik na riadok len prepne výber, doklad neotvorí;
  - /importy: klik na riadok rozbalí logy;
  - 390 px: karta účtu v /bankove-ucty.
  Prázdny zoznam vo firme nie je chyba toku — zapíše sa ako upozornenie.
  Proti produkcii prejde až po nasadení klikateľných riadkov.
*/

export default {
  popis: "Klik na riadok: banka, pokladňa, účtovníctvo, exporty, importy (len čítanie)",
  limit: 240000,
  async spusti(t) {
    const page = t.page;
    const riadky = (loc = page) => loc.locator("tbody tr[data-klik-riadok]");
    const okno = () => page.locator('[role="dialog"]');
    const cesta = () => {
      const u = new URL(page.url());
      return u.pathname + u.search;
    };
    const prazdne = async (loc, kde) => {
      const ok = await loc
        .first()
        .waitFor({ timeout: 20000 })
        .then(() => true)
        .catch(() => false);
      if (!ok) t.upozornenia.push(`${kde}: vo firme nie je žiadny riadok, klik sa neoveril`);
      return !ok;
    };

    await t.krok("na kontrolu: bunka → detail, zaškrtávadlo nie, Ctrl+klik nová karta, Enter", async () => {
      await t.go("/uctovnictvo/na-kontrolu", page);
      if (await prazdne(riadky(), "na-kontrolu")) return;
      const r = riadky().first();
      const pred = cesta();
      await r.locator('input[type="checkbox"]').click();
      await page.waitForTimeout(300);
      t.over(cesta() === pred, "zaškrtávadlo otvorilo detail");
      await r.locator('input[type="checkbox"]').click();
      const href = await r.locator("td").nth(1).locator("a").first().getAttribute("href");
      t.over(!!href, "v riadku chýba odkaz na číslo dokladu");
      const [nova] = await Promise.all([
        page.context().waitForEvent("page", { timeout: 10000 }),
        r.locator("td").nth(2).click({ modifiers: ["Control"] }),
      ]);
      await nova.waitForLoadState("domcontentloaded").catch(() => {});
      t.over(nova.url().includes(href), `Ctrl+klik otvoril ${nova.url()}, čakal som ${href}`);
      t.over(cesta() === pred, "Ctrl+klik zmenil aj pôvodnú kartu");
      await nova.close();
      await r.locator("td").nth(2).click();
      await page.waitForURL((u) => u.pathname + u.search === href, { timeout: 15000 });
      await t.go("/uctovnictvo/na-kontrolu", page);
      await riadky().first().waitFor({ timeout: 20000 });
      await riadky().first().focus();
      await page.keyboard.press("Enter");
      await page.waitForURL((u) => !u.pathname.includes("na-kontrolu"), { timeout: 15000 });
    });

    await t.krok("transakcie: klik na riadok → Detail pohybu", async () => {
      await t.go("/bankove-ucty/transakcie", page);
      if (await prazdne(riadky(), "transakcie")) return;
      const pred = cesta();
      await riadky().first().locator("td").first().click();
      await okno().first().waitFor({ timeout: 10000 });
      t.over(cesta() === pred, "klik na pohyb zmenil stránku");
      await page.keyboard.press("Escape");
    });

    await t.krok("bankové účty: karta účtu → transakcie účtu", async () => {
      await t.go("/bankove-ucty", page);
      const k = page.locator("[data-klik-riadok]");
      if (await prazdne(k, "bankove-ucty")) return;
      await k.first().locator(".font-mono").first().click();
      await page.waitForURL(/\/bankove-ucty\/transakcie\?account=/, { timeout: 15000 });
    });

    await t.krok("pravidlá: klik na riadok → úprava (bez uloženia)", async () => {
      await t.go("/uctovnictvo/pravidla", page);
      if (await prazdne(riadky(), "pravidla")) return;
      await riadky().first().locator("td").nth(2).click();
      await okno().first().waitFor({ timeout: 10000 });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      t.over((await okno().count()) === 0, "okno úpravy pravidla sa nezavrelo");
    });

    await t.krok("DPH prehľad: faktúra vo výkaze → detail", async () => {
      await t.go("/uctovnictvo/dph", page);
      const [rok, mesiac] = t.dnes.split("-").map(Number);
      const minuly = mesiac === 1 ? 12 : mesiac - 1;
      const nazvy = ["Január", "Február", "Marec", "Apríl", "Máj", "Jún", "Júl", "August", "September", "Október", "November", "December"];
      if (mesiac === 1) {
        await page.getByRole("combobox", { name: "Rok" }).click();
        await page.getByRole("option", { name: String(rok - 1) }).click();
      }
      await page.getByRole("combobox", { name: "Obdobie" }).click();
      await page.getByRole("option", { name: nazvy[minuly - 1] }).click();
      const tab = page.locator("table").filter({ hasText: "Odberateľ" }).first();
      if (await prazdne(riadky(tab), "dph vystavené")) return;
      await riadky(tab).first().locator("td").nth(2).click();
      await page.waitForURL(/\/faktury\/[^/?]+$/, { timeout: 15000 });
    });

    await t.krok("exporty: klik na riadok len prepne výber", async () => {
      await t.go("/exporty", page);
      await page.getByLabel("Od", { exact: true }).first().fill(`${t.dnes.slice(0, 4)}-01-01`);
      const r = riadky().first();
      if (await prazdne(riadky(), "exporty")) return;
      const cb = r.locator('input[type="checkbox"]').first();
      const pred = await cb.isChecked();
      const url = cesta();
      await r.locator("td").nth(2).click();
      t.over((await cb.isChecked()) !== pred, "klik na riadok neprepol výber");
      t.over(cesta() === url, "klik na riadok v exporte otvoril doklad");
      await r.locator("td").nth(2).click();
      t.over((await cb.isChecked()) === pred, "druhý klik výber nevrátil");
    });

    await t.krok("importy: klik na riadok rozbalí logy", async () => {
      await t.go("/importy", page);
      if (await prazdne(riadky(), "importy")) return;
      const pocet = await page.locator("tbody tr").count();
      await riadky().first().locator("td").nth(2).click();
      await t.cakajNa("rozbalené logy", async () => (await page.locator("tbody tr").count()) > pocet, {
        limit: 10000,
      });
    });

    await t.krok("390 px: karta účtu je klikateľná", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await t.go("/bankove-ucty", page);
      const k = page.locator("[data-klik-riadok]:visible");
      if (await prazdne(k, "bankove-ucty 390 px")) return;
      await k.first().locator(".font-mono").first().click();
      await page.waitForURL(/\/bankove-ucty\/transakcie\?account=/, { timeout: 15000 });
    });
  },
};
