/*
  Klik na riadok – balík 3 (Kontakty, Produkty, Ceny, Zákazky, Sklad), 1. 11. 2026:

  - klik na bunku riadku (nie na číslo ani odkaz) otvorí detail – stránku cez
    router, alebo okno úpravy tam, kde detail je dialóg (adresár, produkty,
    cenník) – v kategóriách skladu formulár vedľa tabuľky;
  - klik na zaškrtávadlo riadok len označí, detail neotvorí;
  - Ctrl+klik otvorí detail v novej karte (len zoznamy so stránkou detailu);
  - Enter na zameranom riadku otvorí detail;
  - na 390 px klik na kartu zákazky a kontaktu otvorí detail;
  - skladové karty: bunka s názvom (dvojklik = premenovanie) detail neotvorí.

  Len čítanie: dialógy sa zatvárajú Escape, nič sa neukladá. Zoznam bez
  riadkov sa preskočí (zapíše sa upozornenie). Prepnutie firmy klikom na
  riadok /firmy tok nerobí – zmenilo by firmu pre zvyšok behu.
*/

/** Interaktívne prvky – rovnaký zoznam ako NEOTVARAT_SELEKTOR v useKlikNaRiadok. */
const INTERAKTIVNE =
  "a,button,input,select,textarea,label,summary,[role=button],[role=checkbox],[role=switch],[role=menuitem],[role=combobox],[role=link],[role=tab],[contenteditable=true],[data-neotvarat]";

const UUID = "[0-9a-f-]{36}";

/**
 * ciel: RegExp adresy detailu | "dialog" (okno úpravy) | "fokus" (formulár na stránke).
 * riadok: selektor riadkov v `main`.
 */
export const ZOZNAMY = [
  { meno: "odberatelia", cesta: "/odberatelia", ciel: "dialog", vyber: true },
  { meno: "dodavatelia", cesta: "/dodavatelia", ciel: "dialog", vyber: true },
  { meno: "produkty", cesta: "/produkty", ciel: "dialog", vyber: true },
  { meno: "ceny (skupiny a dohodnuté)", cesta: "/ceny", ciel: "dialog" },
  { meno: "ceny/akcie", cesta: "/ceny/akcie", ciel: "dialog", riadok: "main div[data-klik-riadok]" },
  { meno: "zakazky", cesta: "/zakazky", ciel: new RegExp(`/zakazky/${UUID}`) },
  {
    meno: "sklad: pod minimom",
    cesta: "/sklad",
    ciel: new RegExp(`/sklad/produkty/${UUID}`),
    riadok: 'main li[data-klik-riadok]:has(a[href*="/sklad/produkty/"])',
  },
  {
    meno: "sklad: posledné pohyby",
    cesta: "/sklad",
    ciel: new RegExp(`/sklad/pohyby/${UUID}`),
    riadok: 'main li[data-klik-riadok]:has(a[href*="/sklad/pohyby/"])',
  },
  {
    meno: "sklad/produkty",
    cesta: "/sklad/produkty",
    ciel: new RegExp(`/sklad/produkty/${UUID}`),
    vyber: true,
    neotvarat: "td[data-neotvarat]",
  },
  { meno: "sklad/pohyby", cesta: "/sklad/pohyby", ciel: new RegExp(`/sklad/pohyby/${UUID}`) },
  { meno: "sklad/presuny", cesta: "/sklad/presuny", ciel: new RegExp(`/sklad/presuny/${UUID}`) },
  {
    meno: "sklad/objednavky",
    cesta: "/sklad/objednavky",
    ciel: new RegExp(`/sklad/objednavky/${UUID}`),
  },
  { meno: "sklad/minimum", cesta: "/sklad/minimum", ciel: new RegExp(`/sklad/produkty/${UUID}`) },
  { meno: "sklad/kategorie", cesta: "/sklad/kategorie", ciel: "fokus" },
];

/** Mobil 390 px: karta (nie tabuľka). */
export const MOBIL = [
  {
    meno: "zakazky (karta)",
    cesta: "/zakazky",
    ciel: new RegExp(`/zakazky/${UUID}`),
    riadok: "main [data-klik-riadok]:visible",
  },
  {
    meno: "odberatelia (karta)",
    cesta: "/odberatelia",
    ciel: "dialog",
    riadok: "main li[data-klik-riadok]:visible",
  },
];

async function pockaj(page) {
  await page
    .waitForFunction(() => !/Načítavam/.test(document.querySelector("main")?.innerText ?? ""), null, {
      timeout: 15000,
    })
    .catch(() => {});
  await page.waitForTimeout(500);
}

/** Označí v riadku prvok s textom mimo interaktívnych prvkov a vráti jeho lokátor. */
async function bunka(riadok) {
  const ok = await riadok.evaluate((r, sel) => {
    document.querySelectorAll("[data-e2e-klik]").forEach((x) => x.removeAttribute("data-e2e-klik"));
    const mimo = (el) => {
      for (let x = el; x && x !== r; x = x.parentElement) if (x.matches(sel)) return false;
      return true;
    };
    const kandidati =
      r.tagName === "TR"
        ? [...r.children].filter((td) => !td.querySelector(sel) && mimo(td))
        : [...r.querySelectorAll("*")].filter((el) => !el.querySelector(sel) && mimo(el));
    const el = kandidati.find((x) => {
      const b = x.getBoundingClientRect();
      return (x.textContent ?? "").trim() && b.width > 4 && b.height > 4;
    });
    if (!el) return false;
    el.setAttribute("data-e2e-klik", "1");
    return true;
  }, INTERAKTIVNE);
  return ok ? riadok.locator("[data-e2e-klik]") : null;
}

async function overCiel(page, z, pred) {
  if (z.ciel instanceof RegExp) {
    await page.waitForURL(z.ciel, { timeout: 15000 });
    return;
  }
  if (z.ciel === "dialog") {
    const d = page.getByRole("dialog").last();
    await d.waitFor({ timeout: 10000 });
    await page.keyboard.press("Escape");
    await d.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    if (page.url() !== pred) throw new Error(`okno zmenilo adresu na ${page.url()}`);
    return;
  }
  if (z.ciel === "fokus") {
    await page.waitForFunction(() => document.activeElement?.tagName === "INPUT", null, {
      timeout: 5000,
    });
    await page.getByText("Upraviť kategóriu").first().waitFor({ timeout: 5000 });
  }
}

/** Prejde jeden zoznam; vráti false, ak nemá riadky. */
export async function overZoznam(page, z, go, { mobil = false } = {}) {
  await go(z.cesta, page);
  await pockaj(page);
  const riadky = page.locator(z.riadok ?? "main tbody tr[data-klik-riadok]");
  if ((await riadky.count()) === 0) return false;
  const riadok = riadky.first();
  const pred = page.url();

  // 1) klik na bunku
  const b = await bunka(riadok);
  if (!b) throw new Error("v riadku nie je bunka bez odkazu/tlačidla");
  await b.click();
  await overCiel(page, z, pred);
  if (mobil) return true;

  // 2) zaškrtávadlo len označí
  if (z.vyber) {
    await go(z.cesta, page);
    await pockaj(page);
    const ch = riadky.first().locator('input[type="checkbox"]').first();
    if (await ch.count()) {
      await ch.click();
      await page.waitForTimeout(400);
      if (page.url() !== pred) throw new Error(`zaškrtávadlo otvorilo ${page.url()}`);
      if (await page.getByRole("dialog").count()) throw new Error("zaškrtávadlo otvorilo okno");
      await ch.click();
    }
  }

  // 2b) bunka, ktorá si klik nechá (dvojklik na premenovanie)
  if (z.neotvarat) {
    await go(z.cesta, page);
    await pockaj(page);
    const n = riadky.first().locator(z.neotvarat).first();
    if (await n.count()) {
      await n.click();
      await page.waitForTimeout(500);
      if (page.url() !== pred) throw new Error(`bunka ${z.neotvarat} otvorila ${page.url()}`);
    }
  }

  // 3) Ctrl+klik → nová karta (len stránka detailu)
  if (z.ciel instanceof RegExp) {
    await go(z.cesta, page);
    await pockaj(page);
    const b2 = await bunka(riadky.first());
    const [nova] = await Promise.all([
      page.context().waitForEvent("page", { timeout: 10000 }),
      b2.click({ modifiers: ["Control"] }),
    ]);
    await nova.waitForURL(z.ciel, { timeout: 15000 });
    await nova.close();
    if (page.url() !== pred) throw new Error(`Ctrl+klik zmenil aj pôvodnú kartu na ${page.url()}`);
  }

  // 4) Enter na zameranom riadku (karty akcií a riadky tabuliek majú tabIndex)
  await go(z.cesta, page);
  await pockaj(page);
  const r = riadky.first();
  if ((await r.getAttribute("tabindex")) === "0") {
    await r.focus();
    await page.keyboard.press("Enter");
    await overCiel(page, z, pred);
  }
  return true;
}

export default {
  popis: "klik na riadok: kontakty, produkty, ceny, zákazky, sklad (bunka, výber, Ctrl+klik, Enter, mobil)",
  limit: 300000,
  async spusti(t) {
    const go = (cesta, page) => t.go(cesta, page);
    for (const z of ZOZNAMY) {
      await t.krok(z.meno, async () => {
        const ok = await overZoznam(t.page, z, go);
        if (!ok) t.upozornenia.push(`${z.meno}: zoznam je prázdny, klik sa neoveril`);
      });
    }
    const mobil = await t.novaStranka({ mobil: true });
    for (const z of MOBIL) {
      await t.krok(`390 px: ${z.meno}`, async () => {
        const ok = await overZoznam(mobil, z, go, { mobil: true });
        if (!ok) t.upozornenia.push(`${z.meno}: zoznam je prázdny, klik sa neoveril`);
      });
    }
  },
};
