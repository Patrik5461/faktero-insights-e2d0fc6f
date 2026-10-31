/*
  Prihlásenie (relácia z formulára), prepnutie firmy cez prepínač v hlavičke,
  menu a odznak Nespracované = počet z databázy.
*/
export default {
  popis: "prihlásenie, prepnutie firmy, menu a odznaky",
  limit: 90000,
  async spusti(t) {
    const page = t.page;

    await t.krok("Prehľad po prihlásení", async () => {
      await t.go("/dashboard");
      await page.getByRole("heading", { name: "Prehľad", exact: true }).first().waitFor();
      t.over(!/prihlasenie/.test(page.url()), `relácia nedržala, som na ${page.url()}`);
    });

    await t.krok("prepnutie firmy Test → test2 → Test", async () => {
      for (const [ciel, nazov] of [
        ["test2", "test2"],
        ["test", "Test"],
      ]) {
        await page
          .getByRole("button", { name: /^Prepnúť firmu, teraz / })
          .first()
          .click();
        const zoznam = page.getByRole("listbox", { name: "Firmy" });
        await zoznam.waitFor();
        await zoznam
          .getByRole("option", { name: new RegExp(`^${nazov}\\b`) })
          .first()
          .click();
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        await t.cakajNa(
          `aktívna firma ${nazov}`,
          async () =>
            (await page.evaluate(() => localStorage.getItem("faktero.active_company"))) ===
            t.firmy[ciel],
        );
        await page
          .getByRole("button", { name: new RegExp(`^Prepnúť firmu, teraz ${nazov}$`) })
          .first()
          .waitFor({ timeout: 15000 });
      }
    });

    await t.krok("menu má hlavné agendy", async () => {
      // Na stránke Nespracovaných je jej sekcia v menu rozbalená sama.
      await t.go("/nespracovane");
      const menu = page
        .locator("ul")
        .filter({ has: page.locator('a[href^="/nespracovane"]') })
        .first();
      await menu.waitFor();
      const text = (await page.locator("aside, nav").first().innerText()).replace(/\s+/g, " ");
      for (const polozka of ["Fakturácia", "Doklady", "Banka", "Účtovníctvo", "Nespracované"])
        t.over(text.includes(polozka), `v menu chýba „${polozka}“`);
    });

    await t.krok("odznak Nespracované = databáza", async () => {
      const id = t.firmy.test;
      // Počet sa zisťuje v každom kole znova: súbežné skupiny (e2e/skupiny.mjs)
      // smú vo firme Test práve zakladať alebo mazať nespracované doklady.
      const zDatabazy = async () => {
        const nesp = await t.rest.pocet(`nespracovane_doklady?company_id=eq.${id}&select=id`);
        const bloc = await t.rest.pocet(
          `expense_documents?company_id=eq.${id}&status=eq.new&select=id`,
        );
        return { nesp, bloc, ocak: nesp + bloc };
      };
      let db = await zDatabazy();
      t.over(Number.isFinite(db.ocak), "počet z databázy sa nepodarilo zistiť");
      // Odznak sa načítava zvlášť (server funkcia) — počkáme naň.
      const odkaz = page.locator('a[href^="/nespracovane"]').first();
      await odkaz.waitFor();
      let kolo = 0;
      const vidim = await t
        .cakajNa(
          `odznak ${db.ocak}`,
          async () => {
            // Odznak sa obnovuje pri načítaní stránky — po čase ju načítame znova.
            if (++kolo % 8 === 0) await t.go("/nespracovane");
            const label = await odkaz
              .locator('[aria-label$=" čaká"]')
              .first()
              .getAttribute("aria-label")
              .catch(() => null);
            const n = label ? Number(label.replace(/\D+/g, "")) : 0;
            db = await zDatabazy();
            return n === db.ocak ? { n } : null;
          },
          { limit: 30000 },
        )
        .catch(async () => {
          const label = await odkaz
            .locator('[aria-label$=" čaká"]')
            .first()
            .getAttribute("aria-label")
            .catch(() => "žiadny");
          throw new Error(
            `odznak ukazuje „${label}“, databáza ${db.ocak} (nespracované ${db.nesp} + bločky ${db.bloc})`,
          );
        });
      t.log(`odznak Nespracované ${vidim.n}`);
    });
  },
};
