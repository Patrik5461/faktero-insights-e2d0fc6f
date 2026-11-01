/*
  Balík B2 — neplatiteľ DPH a zálohy (C-04, C-06, C-12, rozhodnutie 3).

  Firma test2 sa na čas toku prepne na neplatiteľa (vat_payer=false,
  sk_neplatitel) a na konci sa vráti. Overí sa:
   - poistka v databáze: hlavička ani položka faktúry neplatiteľa nesmú niesť
     DPH (spúšťače invoices_/invoice_items_dph_neplatitela),
   - poistka meny zálohy: záloha v CZK sa od faktúry v EUR odpočítať nedá
     (spúšťač invoice_advances_mena),
   - formulár novej faktúry: produkt z katalógu s 23 % dostane u neplatiteľa 0 %,
   - úprava faktúry: nový riadok u neplatiteľa 0 %, nie pevných 23 %.
  Všetko sa na konci zmaže natvrdo.
*/
import { zalozOdberatela, zmazFakturuNatvrdo } from "../lib/doklady.mjs";

export default {
  popis: "B2: poistka DPH neplatiteľa, mena zálohy, katalóg a úprava u neplatiteľa → 0 %",
  limit: 240000,
  firma: "test2",
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test2;

    const povodna = await t.krok("firma test2 → neplatiteľ", async () => {
      const r = await t.rest.get(`companies?id=eq.${firma}&select=vat_payer,vat_scheme`);
      const f = r.data?.[0];
      t.over(f, `firma sa nenačítala: ${r.status}`);
      const p = await t.rest.patch(`companies?id=eq.${firma}`, {
        vat_payer: false,
        vat_scheme: "sk_neplatitel",
      });
      t.over(p.status < 300, `prepnutie zlyhalo: ${p.status} ${p.text.slice(0, 200)}`);
      t.uprac("vrátiť platiteľa test2", async () => {
        const z = await t.rest.patch(`companies?id=eq.${firma}`, {
          vat_payer: f.vat_payer,
          vat_scheme: f.vat_scheme,
        });
        if (z.status >= 300) throw new Error(`${z.status} ${z.text.slice(0, 200)}`);
      });
      return f;
    });
    t.over(povodna, "chýba pôvodný stav firmy");

    const odb = await zalozOdberatela(t, "test2");
    const hlavicka = (x) => ({
      company_id: firma,
      customer_id: odb.id,
      customer_name: odb.name,
      type: "regular",
      status: "draft",
      issue_date: t.dnes,
      due_date: t.dnes,
      currency: "EUR",
      ...x,
    });
    const vlozFakturu = async (x) => {
      const r = await t.rest.post("invoices", hlavicka(x));
      if (r.status < 300 && r.data?.[0]?.id) {
        const id = r.data[0].id;
        t.uprac(`faktúra ${id.slice(0, 8)}`, () => zmazFakturuNatvrdo(t, id));
      }
      return r;
    };

    const fakturaId = await t.krok("databáza odmietne DPH neplatiteľa", async () => {
      const zla = await vlozFakturu({
        invoice_number: `${t.znacka}-B2-DPH`,
        subtotal: 100,
        vat_total: 23,
        total: 123,
      });
      t.over(zla.status >= 400, `faktúra s DPH prešla: ${zla.status}`);
      t.over(/nie je platiteľ DPH/.test(zla.text), `iná chyba: ${zla.text.slice(0, 200)}`);

      const ok = await vlozFakturu({
        invoice_number: `${t.znacka}-B2-0`,
        subtotal: 100,
        vat_total: 0,
        total: 100,
      });
      t.over(ok.status < 300, `faktúra bez DPH neprešla: ${ok.status} ${ok.text.slice(0, 200)}`);
      const id = ok.data[0].id;
      const riadok = (sadzba, dan) => ({
        invoice_id: id,
        position: 0,
        name: `${t.znacka} položka`,
        quantity: 1,
        unit: "ks",
        unit_price: 100,
        vat_rate: sadzba,
        subtotal: 100,
        vat_amount: dan,
        total: 100 + dan,
      });
      const zlaPol = await t.rest.post("invoice_items", riadok(23, 23));
      t.over(zlaPol.status >= 400, `položka s DPH prešla: ${zlaPol.status}`);
      t.over(/nesmie mať DPH/.test(zlaPol.text), `iná chyba: ${zlaPol.text.slice(0, 200)}`);
      const okPol = await t.rest.post("invoice_items", riadok(0, 0));
      t.over(
        okPol.status < 300,
        `položka bez DPH neprešla: ${okPol.status} ${okPol.text.slice(0, 200)}`,
      );
      return id;
    });

    await t.krok("záloha v inej mene sa odpočítať nedá", async () => {
      const z = await vlozFakturu({
        type: "proforma",
        status: "paid",
        currency: "CZK",
        invoice_number: `${t.znacka}-B2-ZF`,
        subtotal: 1000,
        vat_total: 0,
        total: 1000,
      });
      t.over(z.status < 300, `zálohová sa nezaložila: ${z.status} ${z.text.slice(0, 200)}`);
      const r = await t.rest.post("invoice_advances", {
        company_id: firma,
        invoice_id: fakturaId,
        advance_invoice_id: z.data[0].id,
        amount: 1000,
      });
      if (r.status < 300) await t.rest.delete(`invoice_advances?invoice_id=eq.${fakturaId}`);
      t.over(r.status >= 400, `záloha v CZK sa odpočítala od faktúry v EUR: ${r.status}`);
      t.over(/inej mene/.test(r.text), `iná chyba: ${r.text.slice(0, 200)}`);
    });

    // Produkt z cenníka so sadzbou platiteľa.
    const produkt = await t.krok("produkt s 23 % v cenníku", async () => {
      const r = await t.rest.post("products", {
        company_id: firma,
        name: `${t.znacka} Produkt 23`,
        unit: "ks",
        unit_price: 50,
        vat_rate: 23,
        active: true,
      });
      t.over(r.status < 300, `produkt sa nezaložil: ${r.status} ${r.text.slice(0, 200)}`);
      const p = r.data[0];
      t.uprac("produkt", async () => {
        await t.rest.delete(`products?id=eq.${p.id}`);
      });
      return p;
    });

    await t.krok("nová faktúra: katalóg u neplatiteľa → 0 %", async () => {
      await t.go("/faktury/nova");
      await page.locator("#odberatel-dokladu").waitFor();
      await page
        .getByRole("button", { name: /Z katalógu/ })
        .first()
        .click();
      await page.getByPlaceholder(/Hľadať produkt/).fill(produkt.name);
      await page.locator("button", { hasText: produkt.name }).first().click();
      const riadok = page.locator('tr:has(input[placeholder="Názov položky"])').first();
      await t.cakajNa(
        "riadok z katalógu",
        async () =>
          (await riadok.locator('input[placeholder="Názov položky"]').inputValue()) ===
          produkt.name,
      );
      const sadzba = await riadok.locator("select").first().inputValue();
      t.over(Number(sadzba) === 0, `riadok z katalógu má ${sadzba} %, čakal som 0`);
    });

    await t.krok("úprava faktúry: nový riadok u neplatiteľa → 0 %", async () => {
      await t.go(`/faktury/${fakturaId}/upravit`);
      await page
        .getByRole("button", { name: /Pridať položku/ })
        .first()
        .waitFor();
      const pred = await page.locator('tr:has(input[placeholder="Názov položky"])').count();
      await page
        .getByRole("button", { name: /Pridať položku/ })
        .first()
        .click();
      const riadky = page.locator('tr:has(input[placeholder="Názov položky"])');
      await t.cakajNa("nový riadok", async () => (await riadky.count()) > pred);
      const sadzba = await riadky.nth(pred).locator("select").first().inputValue();
      t.over(Number(sadzba) === 0, `nový riadok v úprave má ${sadzba} %, čakal som 0`);
    });
  },
};
