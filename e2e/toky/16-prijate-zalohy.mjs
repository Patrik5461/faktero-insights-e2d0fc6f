/*
  Prijaté faktúry: zálohová faktúra a faktúra, ktorá ju zúčtováva — väzba
  v detaile oboch, odpočet zálohy v „Zostáva k úhrade“ aj v súčte
  „Nezaplatené“ zoznamu, čiastočná úhrada cez okno Úhrady a odznaky
  („Čiastočne uhradená“, „Na kontrolu“).
*/
import { prijataCezRest } from "../lib/zauctovanie.mjs";

const suma = (s) =>
  Number(
    String(s)
      .replace(/[^\d,-]/g, "")
      .replace(",", "."),
  );

export default {
  popis: "prijaté: záloha a jej zúčtovanie, úhrady, odznaky",
  limit: 150000,
  firma: "test2",
  async spusti(t) {
    const page = t.page;
    const zal = await prijataCezRest(
      t,
      {
        invoice_number: `${t.znacka}-ZAL`,
        type: "proforma",
        status: "paid",
        payment_date: t.dnes,
        amount_without_vat: 40,
        vat_amount: 0,
        amount_total: 40,
      },
      "test2",
    );
    const fin = await prijataCezRest(
      t,
      {
        invoice_number: `${t.znacka}-FIN`,
        amount_without_vat: 113.82,
        vat_amount: 26.18,
        amount_total: 140,
        advance_invoice_id: zal.id,
      },
      "test2",
    );
    t.uprac("väzba na zálohu", async () => {
      await t.rest.patch(`purchase_invoices?id=eq.${fin.id}`, { advance_invoice_id: null });
      await t.rest.delete(`purchase_invoice_payments?purchase_invoice_id=eq.${fin.id}`);
    });
    await prijataCezRest(
      t,
      { invoice_number: `${t.znacka}-KONTROLA`, na_kontrolu_at: new Date().toISOString() },
      "test2",
    );

    await t.krok("detail faktúry: väzba na zálohu a odpočet", async () => {
      await t.go(`/prijate-faktury/${fin.id}`);
      await page.getByText("Zúčtováva zálohovú faktúru").first().waitFor({ timeout: 20000 });
      await page
        .getByRole("link", { name: `${t.znacka}-ZAL` })
        .first()
        .waitFor();
      const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
      t.over(/Zostáva k úhrade 100,00 €/.test(text), `chýba „Zostáva k úhrade 100,00 €“`);
    });

    await t.krok("detail zálohy: kde je zúčtovaná", async () => {
      await page
        .getByRole("link", { name: `${t.znacka}-ZAL` })
        .first()
        .click();
      await page.waitForURL((u) => u.pathname.endsWith(zal.id), { timeout: 20000 });
      await page.getByText("Zúčtovaná vo faktúre").first().waitFor({ timeout: 20000 });
      await page
        .getByRole("link", { name: `${t.znacka}-FIN` })
        .first()
        .waitFor();
    });

    await t.krok("čiastočná úhrada 30 € cez okno Úhrady", async () => {
      await t.go(`/prijate-faktury/${fin.id}`);
      await page.getByRole("button", { name: "Pridať úhradu" }).first().click();
      const okno = page.getByRole("dialog", { name: "Úhrady" });
      await okno.waitFor();
      t.over(
        (await okno.innerText()).includes("Odpočet uhradenej zálohy"),
        "okno neukazuje odpočet zálohy",
      );
      const pole = okno.locator("label", { hasText: /Suma/ }).locator("input");
      await pole.fill("30");
      await okno.getByRole("button", { name: "Pridať úhradu" }).click();
      await t.cakajNa("úhrada", async () => {
        const r = await t.rest.get(
          `purchase_invoice_payments?purchase_invoice_id=eq.${fin.id}&select=amount`,
        );
        return r.data?.length ? r.data : null;
      });
      const f = (await t.rest.get(`purchase_invoices?id=eq.${fin.id}&select=status`)).data[0];
      t.over(f.status !== "paid", `po čiastočnej úhrade je ${f.status}`);
    });

    await t.krok("zoznam: odznaky a „Nezaplatené“ bez zálohy a úhrady", async () => {
      await t.go("/prijate-faktury");
      await page.getByPlaceholder("Dodávateľ…").fill(t.znacka);
      const kontrola = page.locator("tbody tr", { hasText: `${t.znacka}-KONTROLA` }).first();
      await kontrola.waitFor({ timeout: 20000 });
      t.over((await kontrola.innerText()).includes("Na kontrolu"), "chýba odznak Na kontrolu");
      const riadok = page.locator("tbody tr", { hasText: `${t.znacka}-FIN` }).first();
      await riadok.getByText("Čiastočne uhradená").waitFor({ timeout: 20000 });
      // FIN: 140 − 40 záloha − 30 úhrada = 70; KONTROLA 123.
      await t
        .cakajNa("súčet nezaplatených", async () => {
          const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
          const m = /Nezaplatené\s*([\d\s ,]+)\s*€/i.exec(text);
          return m && Math.abs(suma(m[1]) - 193) < 0.005;
        })
        .catch(async () => {
          const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
          throw new Error(
            `„Nezaplatené“ nie je 193,00 €: ${/Nezaplatené[^A-Z]*/i.exec(text)?.[0] ?? "?"}`,
          );
        });
    });
  },
};
