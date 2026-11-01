/*
  Importy (QA firma Test) – B7c: H-14, E-03, E-11, E-20. Len číta, nič nenahrá.

  1. /importy/doklady: 25 súborov naraz → do zoznamu ide 20 a upozornenie
     „Najviac 20 súborov naraz; 5 sa nepridalo.“ (predtým sa ticho zahodili).
     Súbory sa len vyberú, „Načítať“ sa nestlačí — nič sa nenahrá.
  2. /importy: filter Zdroj ponúka zdroje z IMPORT_ZDROJE (nie CSV/XML, ktoré sa
     nikdy nezapisovali) a po výbere „Pohoda a mPohoda“ stránka nespadne;
     stav v tabuľke nie je surový anglický kód („completed“).
  3. Výpis z platobnej brány má vlastný titulok karty.
*/

export default {
  popis: "Importy: strop 20 súborov s upozornením, filter Zdroj, titulok výpisu brány",
  limit: 120000,
  async spusti(t) {
    const page = t.page;

    await t.krok("25 súborov → 20 vybraných a upozornenie", async () => {
      await t.go("/importy/doklady", page);
      const vstup = page.locator('input[type="file"]').first();
      await vstup.waitFor({ state: "attached", timeout: 30000 });
      const subory = Array.from({ length: 25 }, (_, i) => ({
        name: `${t.znacka}-doklad-${String(i + 1).padStart(2, "0")}.csv`,
        mimeType: "text/csv",
        buffer: Buffer.from("Číslo;Dodávateľ;Suma\n"),
      }));
      await vstup.setInputFiles(subory);
      await page
        .locator("[data-sonner-toast]", { hasText: "Najviac 20 súborov naraz; 5 sa nepridalo." })
        .first()
        .waitFor({ timeout: 10000 });
      const vZozname = await page.getByText(new RegExp(`^${t.znacka}-doklad-\\d+\\.csv$`)).count();
      t.over(vZozname === 20, `v zozname má byť 20 súborov, je ${vZozname}`);
    });

    await t.krok("história importov: filter Zdroj zo zoznamu zdrojov", async () => {
      await t.go("/importy", page);
      const zdroj = page.locator("label", { hasText: /zdroj/i }).locator("select").first();
      await zdroj.waitFor({ timeout: 30000 });
      const moznosti = (await zdroj.locator("option").allTextContents()).map((s) => s.trim());
      for (const m of ["Pohoda a mPohoda", "SuperFaktúra", "Money S3", "iDoklad"])
        t.over(moznosti.includes(m), `vo filtri Zdroj chýba „${m}“ (${moznosti.join(", ")})`);
      t.over(
        !moznosti.includes("CSV") && !moznosti.includes("XML"),
        "CSV/XML vo filtri byť nemajú",
      );
      await zdroj.selectOption({ label: "Pohoda a mPohoda" });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      const surove = await page
        .locator("table td span", { hasText: /^(completed|failed|running|uploaded)$/ })
        .count();
      t.over(surove === 0, "stav importu sa zobrazuje surovo (completed/failed…)");
    });

    await t.krok("titulok výpisu z platobnej brány", async () => {
      await t.go("/uctovnictvo/vypis-do-pohody?zdroj=brana", page);
      await page.waitForFunction(() => document.title.includes("platobnej brány"), null, {
        timeout: 15000,
      });
    });
  },
};
