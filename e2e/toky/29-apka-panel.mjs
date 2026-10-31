/*
  Mobilná appka: päť jazykov, Kniha jázd, bočný panel.
  - Prehľad v SK/CS/EN/DE/HU: lišta aj karta neuhradených v jazyku appky,
    žiadna slovenčina navyše, stránka sa na 390 px neposúva do strany.
  - Jazda: počítadlo kilometrov s desatinnou čiarkou („0,0", nie „0.0").
  - Panel: Telegram otvorí bota podpory, Nastavenie aplikácie → Diagnostika.
  Dočasné vozidlo sa na konci zmaže.
*/
import { otvorApku, tlacidlo, zalozka } from "../lib/apka.mjs";

const JAZYKY = {
  sk: { prehlad: "Prehľad", karta: "Neuhradené faktúry" },
  cs: { prehlad: "Přehled" },
  en: { prehlad: "Overview" },
  de: { prehlad: "Übersicht" },
  hu: { prehlad: "Áttekintés" },
};
// Typicky slovenské slová rozhrania — v inom jazyku znamenajú zabudnutý preklad.
const SLOVENSKE = /\b(Neuhradené|Faktúra|Skenovať|Posledná aktivita|Čaká na vás)\b/;

export default {
  popis: "appka: 5 jazykov, kilometre v Jazde, Telegram a Diagnostika v paneli",
  limit: 240000,
  async spusti(t) {
    const auto = await t.rest.vloz("vehicles", {
      company_id: t.firmy.test,
      name: `${t.znacka} auto`,
      license_plate: "BA000EE",
    });
    t.uprac("vozidlo", async () => {
      const r = await t.rest.delete(`vehicles?id=eq.${auto.id}`);
      if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
    });

    for (const [jazyk, ocak] of Object.entries(JAZYKY)) {
      await t.krok(`Prehľad po jazyku ${jazyk}`, async () => {
        const page = await otvorApku(t, { jazyk, sirka: jazyk === "hu" ? 412 : 390 });
        const lista = (
          await page
            .locator("nav")
            .filter({ has: page.locator("[data-skener-v-liste]") })
            .innerText()
        ).trim();
        t.over(
          lista.includes(ocak.prehlad),
          `lišta nie je v jazyku ${jazyk}: ${lista.replace(/\s+/g, " ")}`,
        );
        await page.locator("main").first().waitFor();
        await page.waitForTimeout(2500);
        const text = await page.locator("main").first().innerText();
        if (ocak.karta) t.over(text.includes(ocak.karta), `chýba „${ocak.karta}“`);
        else {
          // Mená firiem a dokladov sú dáta — kontrolujú sa len riadky bez čísel a bez s.r.o.
          const riadky = text
            .split("\n")
            .map((x) => x.trim())
            .filter((x) => x && !/\d|s\.r\.o|a\.s\./i.test(x) && SLOVENSKE.test(x));
          t.over(!riadky.length, `slovenčina v jazyku ${jazyk}: ${riadky.slice(0, 3).join(" | ")}`);
        }
        const posun = await page.evaluate(() => {
          window.scrollTo(10000, window.scrollY);
          const x = window.scrollX;
          window.scrollTo(0, window.scrollY);
          return x;
        });
        t.over(posun <= 1, `Prehľad (${jazyk}) sa posúva do strany o ${posun} px`);
        await page.close();
      });
    }

    const page = await otvorApku(t);

    await t.krok("Jazda: kilometre s desatinnou čiarkou", async () => {
      await zalozka(page, 0);
      await page
        .locator("main")
        .getByRole("button", { name: /^Jazda$/ })
        .first()
        .click();
      await tlacidlo(page, /^Začať jazdu$/).waitFor({ timeout: 20000 });
      const text = await page.locator("main").last().innerText();
      t.over(
        /\b0,0\s*km/.test(text),
        `počítadlo nie je „0,0 km“: ${text.slice(0, 60).replace(/\s+/g, " ")}`,
      );
    });

    await t.krok("panel: Telegram", async () => {
      await zalozka(page, 0);
      await zalozka(page, -1);
      const [okno] = await Promise.all([
        page.context().waitForEvent("page", { timeout: 15000 }),
        tlacidlo(page, /Napísať na Telegram/).click(),
      ]);
      t.over(/^https:\/\/t\.me\//.test(okno.url()), `Telegram otvoril ${okno.url()}`);
      await okno.close();
    });

    await t.krok("panel: Diagnostika", async () => {
      await tlacidlo(page, /Nastavenie aplikácie/).click();
      await tlacidlo(page, /^Diagnostika/).click();
      await page
        .getByText(/sieť podľa systému/i)
        .first()
        .waitFor({ timeout: 15000 });
      await page.getByText("Poslať diagnostiku podpore").first().waitFor();
    });
  },
};
