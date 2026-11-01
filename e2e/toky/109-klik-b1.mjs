/*
  Klik na riadok — balík 1 (Fakturácia a eFaktúra). Len číta, nič nezakladá.
  V hlavných zoznamoch firmy Test:
  - klik na obyčajnú bunku (nie číslo, nie tlačidlo) otvorí detail cez router,
  - klik na zaškrtávadlo detail neotvorí,
  - Ctrl+klik otvorí detail v novej karte a zoznam ostane,
  - Enter na zameranom riadku otvorí detail,
  - na 390 px otvorí detail klik na kartu.
  Prázdny zoznam sa len zapíše do upozornení (firma Test nemusí mať všetky doklady).
*/
const NEOTVARAT =
  "a,button,input,select,textarea,label,summary,[role=button],[role=checkbox],[role=switch],[role=menuitem],[role=combobox],[role=link],[role=tab],[contenteditable=true],[data-neotvarat]";
const ID = "[0-9a-f-]{36}";

const ZOZNAMY = [
  { cesta: "/faktury", detail: new RegExp(`/faktury/${ID}$`), checkbox: true },
  { cesta: "/zalohove", detail: new RegExp(`/faktury/${ID}$`) },
  { cesta: "/ponuky", detail: new RegExp(`/ponuky/${ID}$`), checkbox: true },
  { cesta: "/objednavky", detail: new RegExp(`/objednavky/${ID}$`) },
  { cesta: "/opakovane", detail: new RegExp(`/opakovane/${ID}$`), checkbox: true },
  { cesta: "/faktury/upomienky", detail: new RegExp(`/faktury/${ID}$`) },
  { cesta: "/efaktura/odoslane", detail: new RegExp(`/faktury/${ID}$`) },
];

/** Stred obyčajného textu v riadku/karte — mimo odkazov a ovládačov. */
async function bezpecnyBod(loc) {
  return loc.evaluate((riadok, sel) => {
    const el = [...riadok.querySelectorAll("*")].find((e) => {
      if (e.children.length || !e.textContent.trim()) return false;
      const z = e.closest(sel);
      if (z && riadok.contains(z)) return false;
      const r = e.getBoundingClientRect();
      return r.width > 4 && r.height > 4;
    });
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.left + Math.min(r.width / 2, 20), y: r.top + r.height / 2 };
  }, NEOTVARAT);
}

async function prvyRiadok(t, page, sel) {
  const r = page.locator(sel).first();
  const je = await r
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  return je ? r : null;
}

export default {
  popis: "klik na riadok otvorí detail: faktúry, zálohové, ponuky, objednávky, opakované, upomienky, eFaktúry (len čítanie)",
  limit: 300000,
  async spusti(t) {
    const page = t.page;
    const ctx = page.context();
    const RIADOK = "table tr[data-klik-riadok]";

    for (const z of ZOZNAMY) {
      await t.krok(`${z.cesta}: klik, zaškrtávadlo, Ctrl+klik, Enter`, async () => {
        await t.go(z.cesta);
        const riadok = await prvyRiadok(t, page, RIADOK);
        if (!riadok) {
          t.upozornenia.push(`${z.cesta}: vo firme Test nie je žiadny riadok`);
          return;
        }
        const zoznam = page.url();

        if (z.checkbox) {
          const cb = riadok.locator("input[type=checkbox]").first();
          await cb.check();
          await page.waitForTimeout(600);
          t.over(page.url() === zoznam, `${z.cesta}: zaškrtávadlo otvorilo ${page.url()}`);
          await cb.uncheck();
        }

        const bod = await bezpecnyBod(riadok);
        t.over(bod, `${z.cesta}: v riadku nie je obyčajný text na kliknutie`);
        const [nova] = await Promise.all([
          ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null),
          (async () => {
        await page.keyboard.down("Control");
        await page.mouse.click(bod.x, bod.y);
        await page.keyboard.up("Control");
      })(),
        ]);
        t.over(nova, `${z.cesta}: Ctrl+klik neotvoril novú kartu`);
        await nova.waitForLoadState("domcontentloaded").catch(() => {});
        t.over(z.detail.test(nova.url()), `${z.cesta}: nová karta ${nova.url()}`);
        t.over(page.url() === zoznam, `${z.cesta}: Ctrl+klik zmenil aj pôvodnú kartu`);
        await nova.close();

        await page.mouse.click(bod.x, bod.y);
        await page.waitForURL(z.detail, { timeout: 15000 });

        await t.go(z.cesta);
        const r2 = await prvyRiadok(t, page, RIADOK);
        t.over(r2, `${z.cesta}: po návrate chýba riadok`);
        await r2.focus();
        await page.keyboard.press("Enter");
        await page.waitForURL(z.detail, { timeout: 15000 });
      });
    }

    await t.krok("mobil 390 px: klik na kartu otvorí detail", async () => {
      const m = await t.novaStranka({ mobil: true });
      for (const z of ZOZNAMY) {
        await t.go(z.cesta, m);
        const karta = await prvyRiadok(t, m, "div[data-klik-riadok]:visible");
        if (!karta) {
          t.upozornenia.push(`mobil ${z.cesta}: žiadna karta`);
          continue;
        }
        const bod = await bezpecnyBod(karta);
        t.over(bod, `mobil ${z.cesta}: na karte nie je obyčajný text`);
        await m.mouse.click(bod.x, bod.y);
        await m.waitForURL(z.detail, { timeout: 15000 });
      }
    });
  },
};
