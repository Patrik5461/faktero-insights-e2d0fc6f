/*
  Zamestnanci (balík opráv B8): citlivé údaje a mazanie bez potvrdenia.

  - Z-01: „Upraviť“ citlivé údaje bez „Zobraziť“ a doplnenie čísla OP nesmie
    zmazať rodné číslo (predtým sa posielali obe polia, prázdne = vymazať);
  - Z-04/Z-05: zmazanie neprítomnosti aj dochádzky sa pýta na potvrdenie;
  - Z-06: dochádzka má pole Poznámka a poznámka je v zozname.

  Firma test2, zamestnanec so značkou behu; po sebe ho zmaže (kaskádovo aj
  neprítomnosti, dochádzku a záznam prístupov). Overuje nasadený kód –
  spúšťať po nasadení vetvy vlna/opravy-b8.
*/
export default {
  popis: "Zamestnanci: úprava RČ/OP nemaže druhý údaj, mazanie s potvrdením (Z-01, Z-04–Z-06)",
  limit: 150000,
  firma: "test2",
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test2;
    const priezvisko = `E2E ${t.znacka}`;
    const RC = "900101/1234";
    const OP = "EA123456";

    t.uprac("zamestnanec", async () => {
      const r = await t.rest.get(
        `employees?company_id=eq.${firma}&last_name=eq.${encodeURIComponent(priezvisko)}&select=id`,
      );
      for (const z of r.data ?? []) {
        // Na `employees` sú práva po stĺpcoch – vrátiť celý riadok sa nedá.
        const d = await t.rest.delete(`employees?id=eq.${z.id}&company_id=eq.${firma}`, {
          hlavicky: { Prefer: "return=minimal" },
        });
        if (d.status >= 300)
          throw new Error(`zamestnanec ${z.id}: ${d.status} ${d.text.slice(0, 200)}`);
      }
    });

    await t.krok("nový zamestnanec len s rodným číslom", async () => {
      await t.go("/zamestnanci/novy");
      await page.locator("#zam-first_name").fill("Test");
      await page.locator("#zam-last_name").fill(priezvisko);
      await page.locator("#zam-rc").fill(RC);
      await page.getByRole("button", { name: "Uložiť zamestnanca" }).click();
      await page.waitForURL(/\/zamestnanci\/[0-9a-f-]{36}/, { timeout: 30000 });
    });

    await t.krok("Upraviť bez Zobraziť: doplnenie OP nezmaže RČ (Z-01)", async () => {
      await page.getByRole("tab", { name: "Údaje" }).click();
      const sekcia = page.locator("section").filter({ hasText: "Citlivé údaje" });
      await sekcia.getByRole("button", { name: "Upraviť" }).click();
      t.over(
        (await page.locator("#c-rc").inputValue()) === "",
        "pole RČ nie je prázdne – test by nič neoveril",
      );
      await page.locator("#c-op").fill(OP);
      await sekcia.getByRole("button", { name: "Uložiť" }).click();
      await page
        .locator("[data-sonner-toast]")
        .filter({ hasText: "Citlivé údaje sú uložené." })
        .first()
        .waitFor({ timeout: 20000 });
      await sekcia.getByRole("button", { name: "Zobraziť" }).click();
      await sekcia.getByText(RC).waitFor({ timeout: 20000 });
      await sekcia.getByText(OP).waitFor({ timeout: 20000 });
    });

    await t.krok("dochádzka s poznámkou (Z-06) a zmazanie s potvrdením (Z-05)", async () => {
      await page.getByRole("tab", { name: "Dochádzka" }).click();
      const den = `${new Date().toISOString().slice(0, 7)}-03`;
      await page.locator("#a-den").fill(den);
      await page.locator("#a-note").fill(`pozn ${t.znacka}`);
      await page.getByRole("button", { name: "Zapísať deň" }).click();
      await page.getByText(`pozn ${t.znacka}`).first().waitFor({ timeout: 20000 });
      await page.getByRole("button", { name: "Zmazať záznam dochádzky" }).first().click();
      const okno = page.getByRole("alertdialog");
      await okno.waitFor({ timeout: 10000 });
      await okno
        .getByRole("button", { name: /Zrušiť|Nie/ })
        .first()
        .click();
      await page.waitForTimeout(1000);
      t.over(await page.getByText(`pozn ${t.znacka}`).count(), "záznam zmizol aj po Zrušiť");
      await page.getByRole("button", { name: "Zmazať záznam dochádzky" }).first().click();
      await t.potvrd(page);
      await page
        .getByText(`pozn ${t.znacka}`)
        .first()
        .waitFor({ state: "detached", timeout: 20000 });
    });
  },
};
