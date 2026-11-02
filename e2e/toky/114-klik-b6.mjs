/*
  Klik na riadok – balík 6 (Nastavenia, Prehľad, Moje úlohy, Schvaľovanie, Firmy).
  Len číta: nič neuloží, okná úprav sa zavrú bez uloženia.

  Na každom zozname (ak v QA firme nejaký riadok je):
  1. klik na bunku/text riadku (nie na odkaz ani tlačidlo) otvorí detail
     – inú stránku alebo okno/formulár úpravy,
  2. klik na zaškrtávadlo alebo tlačidlo v riadku detail neotvorí,
  3. Ctrl+klik na riadok s cieľom otvorí detail v novej karte, pôvodná ostane,
  4. Enter na zameranom riadku otvorí detail,
  5. na 390 px klik na kartu (zoznam firiem, admin) otvorí detail.
  Prázdny zoznam sa len zapíše do logu — QA firma nemusí mať každú agendu.
*/

/** Prvý klikateľný riadok/karta, ktorý je viditeľný. */
async function prvyRiadok(page, selektor = "[data-klik-riadok]") {
  const r = page.locator(selektor).filter({ visible: true }).first();
  try {
    await r.waitFor({ state: "visible", timeout: 5000 });
    return r;
  } catch {
    return null;
  }
}

/** Klik do riadku mimo odkazov, tlačidiel a vstupov — na miesto s obyčajným textom. */
async function klikNaText(riadok, modifikatory) {
  // elementFromPoint vidí len to, čo je v okne — riadok najprv posuň do zorného poľa.
  await riadok.scrollIntoViewIfNeeded();
  const bod = await riadok.evaluate((el) => {
    const NEOTVARAT =
      "a,button,input,select,textarea,label,summary,[role=button],[role=checkbox],[role=switch],[role=menuitem],[role=combobox],[role=link],[role=tab],[data-neotvarat]";
    const kandidati = [...el.querySelectorAll("td, div, span, p")];
    for (const k of [el, ...kandidati]) {
      if (k !== el && k.closest(NEOTVARAT)) continue;
      const r = k.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      // Bod v rohu prvku, kde nie je interaktívny potomok.
      for (const [dx, dy] of [
        [4, 4],
        [r.width - 4, r.height - 4],
        [r.width / 2, r.height - 3],
      ]) {
        const x = r.left + dx;
        const y = r.top + dy;
        const ciel = document.elementFromPoint(x, y);
        if (ciel && el.contains(ciel) && !ciel.closest(NEOTVARAT)) {
          const o = el.getBoundingClientRect();
          return { x: x - o.left, y: y - o.top };
        }
      }
    }
    return null;
  });
  if (!bod) throw new Error("v riadku sa nenašlo miesto bez odkazu a tlačidla");
  await riadok.click({ position: bod, modifiers: modifikatory });
}

/** Čaká na zmenu adresy alebo na otvorené okno/formulár. */
async function otvorilSa(page, povodna, { okno = false, formular = null } = {}) {
  const koniec = Date.now() + 10000;
  while (Date.now() < koniec) {
    if (page.url() !== povodna) return "stranka";
    if (okno && (await page.getByRole("dialog").filter({ visible: true }).count())) return "okno";
    if (formular && (await formular())) return "formular";
    await page.waitForTimeout(200);
  }
  return null;
}

export default {
  popis: "Klik na riadok (balík 6): nastavenia, prehľad, moje úlohy, schvaľovanie, firmy",
  limit: 300000,
  async spusti(t) {
    const page = t.page;

    /** Spoločné kroky pre zoznam, ktorého riadok vedie na inú stránku. */
    async function zoznamSOdkazom(cesta, nazov, { selektor, novaKarta = true, enter = true } = {}) {
      await t.krok(`${nazov}: klik na bunku otvorí detail`, async () => {
        await t.go(cesta, page);
        const r = await prvyRiadok(page, selektor);
        if (!r) return t.log(`${nazov}: žiadny riadok, preskočené`);
        const povodna = page.url();
        await klikNaText(r);
        const v = await otvorilSa(page, povodna);
        t.over(v === "stranka", `${nazov}: klik na riadok neotvoril detail`);
      });
      if (novaKarta)
        await t.krok(`${nazov}: Ctrl+klik otvorí novú kartu`, async () => {
          await t.go(cesta, page);
          const r = await prvyRiadok(page, selektor);
          if (!r) return;
          const povodna = page.url();
          const [nova] = await Promise.all([
            page.context().waitForEvent("page", { timeout: 10000 }),
            klikNaText(r, ["Control"]),
          ]);
          await nova.close();
          t.over(page.url() === povodna, `${nazov}: Ctrl+klik zmenil aj pôvodnú kartu`);
        });
      if (enter)
        await t.krok(`${nazov}: Enter na riadku otvorí detail`, async () => {
          await t.go(cesta, page);
          const r = await prvyRiadok(page, selektor);
          if (!r) return;
          const povodna = page.url();
          await r.focus();
          await page.keyboard.press("Enter");
          t.over((await otvorilSa(page, povodna)) === "stranka", `${nazov}: Enter detail neotvoril`);
        });
    }

    await zoznamSOdkazom("/schvalovanie", "Na schválenie");
    await t.krok("Na schválenie: zaškrtávadlo detail neotvorí", async () => {
      await t.go("/schvalovanie", page);
      const r = await prvyRiadok(page);
      if (!r) return;
      const povodna = page.url();
      await r.locator('input[type="checkbox"]').first().click();
      await page.waitForTimeout(600);
      t.over(page.url() === povodna, "klik na zaškrtávadlo otvoril detail");
    });

    // Prehľad: opakované faktúry a ponuky — riadky bez klávesnice (vnútri je odkaz).
    await zoznamSOdkazom("/dashboard", "Prehľad", { enter: false });

    await zoznamSOdkazom("/moje-ulohy", "Moje úlohy – komentáre", { enter: false });

    // Číselné rady, webhooky, poznámky: riadok otvorí okno alebo formulár úpravy.
    for (const [cesta, nazov] of [
      ["/ciselne-rady", "Číselné rady"],
      ["/webhooky", "Webhooky"],
      ["/webhooky-logy", "Doručenia webhookov"],
      ["/nastavenia/poznamky", "Preddefinované poznámky"],
      ["/nastavenia/schvalovanie", "Cesty schvaľovania"],
    ]) {
      await t.krok(`${nazov}: klik na riadok otvorí úpravu`, async () => {
        await t.go(cesta, page);
        const r = await prvyRiadok(page);
        if (!r) return t.log(`${nazov}: žiadny riadok, preskočené`);
        const vstupovPred = await page.locator("input:visible, textarea:visible").count();
        const povodna = page.url();
        await klikNaText(r);
        const v = await otvorilSa(page, povodna, {
          okno: true,
          formular: async () =>
            (await page.locator("input:visible, textarea:visible").count()) > vstupovPred,
        });
        t.over(v === "okno" || v === "formular", `${nazov}: klik na riadok neotvoril úpravu`);
        t.over(page.url() === povodna, `${nazov}: klik na riadok zmenil stránku`);
      });
      await t.krok(`${nazov}: tlačidlo v riadku robí len svoje`, async () => {
        await t.go(cesta, page);
        const r = await prvyRiadok(page);
        if (!r) return;
        // Nebezpečné tlačidlá (Zmazať) sa nestláčajú — len to, ktoré úpravu otvára samo.
        const b = r.getByRole("button", { name: /upraviť|zobraziť payload/i }).first();
        if (!(await b.count())) return;
        await b.click();
        await page.waitForTimeout(500);
        const okna = await page.getByRole("dialog").filter({ visible: true }).count();
        t.over(okna <= 1, `${nazov}: tlačidlo otvorilo viac okien naraz`);
      });
    }

    // Zoznam firiem: klik na riadok inej ako aktívnej firmy ju prepne (ako klik na názov).
    await t.krok("Firmy: klik na riadok inej firmy ju prepne", async () => {
      await t.go("/firmy", page);
      const r = await prvyRiadok(page, "tr[data-klik-riadok]");
      if (!r) return t.log("Firmy: žiadna iná firma, preskočené");
      const pred = await localStorage_firma(page);
      await klikNaText(r);
      await page.waitForURL(/\/dashboard/, { timeout: 15000 });
      const po = await localStorage_firma(page);
      t.over(po && po !== pred, "klik na riadok firmu neprepol");
    });

    await t.krok("Firmy na 390 px: klik na kartu prepne firmu", async () => {
      const m = await t.novaStranka({ mobil: true });
      await t.go("/firmy", m);
      const r = await prvyRiadok(m, "div[data-klik-riadok]");
      if (!r) return t.log("Firmy (mobil): žiadna iná firma, preskočené");
      const pred = await localStorage_firma(m);
      await klikNaText(r);
      await m.waitForURL(/\/dashboard/, { timeout: 15000 });
      t.over((await localStorage_firma(m)) !== pred, "klik na kartu firmu neprepol");
    });
  },
};

function localStorage_firma(page) {
  return page.evaluate(() => localStorage.getItem("faktero.active_company"));
}
