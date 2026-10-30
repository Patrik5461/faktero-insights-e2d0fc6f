/*
  Faktúra nemeckej firme s IČ DPH: formulár sám navrhne dodanie do EÚ
  (služba, § 15 ods. 1 s prenesením), faktúra vyjde s 0 % DPH a v PDF je
  veta o prenesení. Predtým ostal tuzemský režim a odišla faktúra s 23 %.
  Odberateľ aj faktúra sa na konci zmažú natvrdo.
*/
import { textPdf } from "../lib/pdf.mjs";
import { vystavFakturu } from "../lib/doklady.mjs";

export default {
  popis: "faktúra DE odberateľovi s IČ DPH: 0 % DPH a veta o prenesení",
  limit: 150000,
  async spusti(t) {
    const page = t.page;
    const odb = await t.rest.vloz("customers", {
      company_id: t.firmy.test,
      name: `${t.znacka} Kunde GmbH`,
      street: "Teststraße 1",
      city: "Berlin",
      zip: "10115",
      country: "DE",
      ic_dph: "DE123456789",
    });
    t.uprac("odberateľ DE", async () => {
      const r = await t.rest.delete(`customers?id=eq.${odb.id}`);
      if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
    });

    await t.krok("formulár navrhne dodanie do EÚ", async () => {
      await t.go("/faktury/nova");
      await page.locator("#odberatel-dokladu").waitFor();
      await page.click("#odberatel-dokladu");
      await page.getByPlaceholder(/Hľadať podľa mena/).fill(odb.name);
      await page.locator("button", { hasText: odb.name }).first().click({ timeout: 15000 });
      await page
        .getByText(/Odberateľ má IČ DPH iného štátu EÚ \(DE123456789\) — faktúra je bez DPH/)
        .first()
        .waitFor({ timeout: 15000 });
      const pdp = page.getByRole("checkbox", { name: /Prenos daňovej povinnosti/ });
      t.over(await pdp.isChecked(), "prenos daňovej povinnosti sa nezapol sám");
    });

    const fa = await t.krok("vystavenie bez DPH", async () => {
      const f = await vystavFakturu(t, {
        odberatel: odb.name,
        text: `${t.znacka} — Beratungsleistungen`,
        polozky: [[`${t.znacka} konzultácia`, 2, 100]],
      });
      t.over(f.reverse_charge === true, "faktúra nemá prenesenie");
      t.over(
        f.reverse_charge_type === "eu_b2b",
        `režim ${f.reverse_charge_type}, čakal som eu_b2b`,
      );
      t.over(f.eu_plnenie === "sluzba", `plnenie ${f.eu_plnenie}, čakal som sluzba`);
      t.over(Number(f.vat_total) === 0, `DPH ${f.vat_total}, čakal som 0`);
      t.over(Math.abs(Number(f.total) - 200) < 0.001, `suma ${f.total}, čakal som 200`);
      const r = await t.rest.get(`invoice_items?invoice_id=eq.${f.id}&select=vat_rate,vat_amount`);
      t.over(
        (r.data ?? []).every((x) => Number(x.vat_rate) === 0 && Number(x.vat_amount) === 0),
        "položka má nenulovú DPH",
      );
      return f;
    });

    await t.krok("PDF s vetou o prenesení", async () => {
      const tlacidlo = () =>
        page.getByRole("button", { name: /^(Stiahnuť PDF|Vygenerovať PDF)$/ }).first();
      await tlacidlo().waitFor();
      const subor = await t.stiahni(() => tlacidlo().click(), "faktura-eu");
      const text = (await textPdf(subor)).join("\n").replace(/\s+/g, " ");
      t.over(text.includes(fa.invoice_number), `v PDF chýba číslo ${fa.invoice_number}`);
      t.over(/§\s?15 (ods\.|odst\.|Abs\.) 1|§\s?15\(1\)/.test(text), "v PDF chýba § 15 ods. 1");
      // Jazyk dokladu môže byť podľa odberateľa aj nemčina či angličtina.
      t.over(
        /Prenesenie daňovej povinnosti|Steuerschuldnerschaft|Reverse charge/i.test(text),
        "v PDF chýba veta o prenesení daňovej povinnosti",
      );
      t.over(!/\b23\s?%/.test(text), "v PDF je 23 % DPH");
    });
  },
};
