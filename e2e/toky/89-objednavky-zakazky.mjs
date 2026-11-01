/*
  Objednávky a zákazky v českej firme (balík opráv B1, 1. 11. 2026):

  - nová objednávka CZ firmy sa uloží v Kč (K-15) a sadzba nového riadku je
    21 %, nie slovenských 23 % (D-11); úprava menu nezahodí (D-04);
  - detail objednávky ukazuje Kč, nie € (D-02);
  - úprava zákazky odmietne koniec pred začiatkom ešte pred serverom (K-07)
    a sumy zákazky sú v Kč (K-01).

  Píše len do QA Českej; objednávka aj zákazka sa po sebe zmažú.
*/
import { akciaVMenu } from "../lib/doklady.mjs";

export default {
  popis: "CZ objednávka v Kč, sadzba režimu, úprava zákazky",
  limit: 150000,
  firma: "cz",
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.cz;

    const obj = await t.krok("nová objednávka: Kč a 21 %", async () => {
      await t.go("/objednavky/nova");
      const mena = page.locator("#mena-objednavky");
      await mena.waitFor({ timeout: 20000 });
      t.over((await mena.inputValue()) === "CZK", `predvolená mena ${await mena.inputValue()}`);
      const nazov = page.getByPlaceholder("Názov položky").last();
      await nazov.fill(`${t.znacka} práca`);
      const dph = page.locator("table select").last();
      t.over((await dph.inputValue()) === "21", `sadzba nového riadku ${await dph.inputValue()}`);
      await page
        .getByRole("button", { name: /Založiť objednávku|Uložiť zmeny/ })
        .last()
        .click();
      await page.waitForURL(/\/objednavky\/[0-9a-f-]{36}$/, { timeout: 20000 });
      const id = page.url().match(/\/objednavky\/([0-9a-f-]{36})/)[1];
      t.uprac("objednávka", async () => {
        await t.rest.delete(`sales_order_items?sales_order_id=eq.${id}`);
        const r = await t.rest.delete(`sales_orders?id=eq.${id}`);
        if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
      });
      const o = (await t.rest.get(`sales_orders?id=eq.${id}&select=id,currency,company_id`))
        .data?.[0];
      t.over(o?.company_id === firma, "objednávka nie je v QA Českej");
      t.over(o?.currency === "CZK", `uložená mena ${o?.currency}`);
      return o;
    });

    await t.krok("detail objednávky v Kč", async () => {
      const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
      t.over(/Kč/.test(text), "v detaile chýba Kč");
      t.over(!/€/.test(text), "detail objednávky ukazuje €");
    });

    await t.krok("úprava objednávky menu nezmení", async () => {
      await t.go(`/objednavky/nova?id=${obj.id}`);
      await page.locator("#mena-objednavky").waitFor({ timeout: 20000 });
      await page
        .getByRole("button", { name: /Založiť objednávku|Uložiť zmeny/ })
        .last()
        .click();
      await page.waitForURL(/\/objednavky\/[0-9a-f-]{36}$/, { timeout: 20000 });
      const o = (await t.rest.get(`sales_orders?id=eq.${obj.id}&select=currency`)).data?.[0];
      t.over(o?.currency === "CZK", `po úprave mena ${o?.currency}`);
    });

    await t.krok("úprava zákazky: koniec pred začiatkom sa neuloží", async () => {
      const z = await t.rest.vloz("jobs", {
        company_id: firma,
        name: `${t.znacka} zákazka`,
        job_number: `${t.znacka}-ZAK`,
        start_date: t.dnes,
      });
      t.uprac("zákazka", async () => {
        const r = await t.rest.delete(`jobs?id=eq.${z.id}`);
        if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
      });
      await t.go(`/zakazky/${z.id}`);
      await page.getByText(`${t.znacka} zákazka`).first().waitFor({ timeout: 20000 });
      const main = (await page.locator("main").innerText()).replace(/\s+/g, " ");
      t.over(/Kč/.test(main) && !/€/.test(main), "sumy zákazky nie sú v Kč");
      await page
        .getByRole("button", { name: /Upraviť/ })
        .first()
        .click();
      await page.getByLabel("Koniec").fill("2000-01-01");
      await page
        .getByRole("button", { name: /Uložiť/ })
        .first()
        .click();
      await page
        .getByText("Koniec zákazky nemôže byť skôr ako jej začiatok.")
        .first()
        .waitFor({ timeout: 10000 });
      const j = (await t.rest.get(`jobs?id=eq.${z.id}&select=end_date`)).data?.[0];
      t.over(!j?.end_date, `koniec sa uložil: ${j?.end_date}`);
    });
  },
};
