/*
  Súčtové karty zoznamov po menách (balík opráv B1, 1. 11. 2026):

  - Prijaté zálohové (AB-09, AB-10): EUR a Kč sa nesčítajú, storno sa do
    „Celkovej sumy“ nepočíta;
  - Prijaté faktúry (D-17, D-18): karta „Celková suma“ a „Nezaplatené“ ukáže
    EUR aj Kč zvlášť a bez konceptu.

  Píše len do QA Českej (domáca mena Kč), doklady majú značku behu a po sebe
  sa zmažú. Hľadá sa podľa značky, takže iné doklady firmy súčty neovplyvnia.
*/
import { prijataCezRest } from "../lib/zauctovanie.mjs";

const bezMedzier = (s) => s.replace(/\s+/g, " ").replace(/ | /g, " ");

async function textKarty(page, nazov) {
  // Najvnútornejší div s nadpisom karty A sumou — samotný nadpis je tiež div.
  const karta = page
    .locator("div", { has: page.getByText(nazov, { exact: true }), hasText: /\d/ })
    .last();
  return bezMedzier(await karta.innerText());
}

export default {
  popis: "zoznamy: súčty prijatých faktúr a záloh po menách",
  limit: 150000,
  firma: "cz",
  async spusti(t) {
    const page = t.page;
    const zaklad = {
      supplier_ico: "50000088",
      amount_without_vat: 100,
      vat_amount: 0,
    };
    await prijataCezRest(
      t,
      {
        ...zaklad,
        invoice_number: `${t.znacka}-Z1`,
        type: "proforma",
        amount_total: 100,
        currency: "EUR",
      },
      "cz",
    );
    await prijataCezRest(
      t,
      {
        ...zaklad,
        invoice_number: `${t.znacka}-Z2`,
        type: "proforma",
        amount_total: 2500,
        currency: "CZK",
      },
      "cz",
    );
    await prijataCezRest(
      t,
      {
        ...zaklad,
        invoice_number: `${t.znacka}-Z3`,
        type: "proforma",
        amount_total: 900,
        currency: "CZK",
        status: "cancelled",
      },
      "cz",
    );
    await prijataCezRest(
      t,
      { ...zaklad, invoice_number: `${t.znacka}-F1`, amount_total: 40, currency: "EUR" },
      "cz",
    );
    await prijataCezRest(
      t,
      { ...zaklad, invoice_number: `${t.znacka}-F2`, amount_total: 1210, currency: "CZK" },
      "cz",
    );
    await prijataCezRest(
      t,
      {
        ...zaklad,
        invoice_number: `${t.znacka}-F3`,
        amount_total: 777,
        currency: "CZK",
        status: "draft",
      },
      "cz",
    );

    await t.krok("prijaté zálohové: Kč a € zvlášť, storno mimo", async () => {
      await t.go(`/prijate-zalohove?q=${encodeURIComponent(t.znacka)}`);
      await page.getByText(`${t.znacka}-Z1`).first().waitFor({ timeout: 20000 });
      const spolu = await textKarty(page, "Celková suma");
      t.over(/2 500,00 Kč/.test(spolu), `Celková suma bez „2 500,00 Kč“: ${spolu}`);
      t.over(/100,00 €/.test(spolu), `Celková suma bez „100,00 €“: ${spolu}`);
      t.over(!/3 400/.test(spolu) && !/2 600/.test(spolu), `meny sa sčítali: ${spolu}`);
    });

    await t.krok(
      "prijaté faktúry: Celková suma a Nezaplatené po menách, bez konceptu",
      async () => {
        await t.go(`/prijate-faktury?q=${encodeURIComponent(t.znacka)}`);
        await page.getByText(`${t.znacka}-F1`).first().waitFor({ timeout: 20000 });
        for (const nazov of ["Celková suma", "Nezaplatené"]) {
          const text = await textKarty(page, nazov);
          t.over(/1 210,00 Kč/.test(text), `${nazov} bez „1 210,00 Kč“: ${text}`);
          t.over(/40,00 €/.test(text), `${nazov} bez „40,00 €“: ${text}`);
          t.over(!/1 987|1 250/.test(text), `${nazov} zle sčítané: ${text}`);
        }
      },
    );
  },
};
