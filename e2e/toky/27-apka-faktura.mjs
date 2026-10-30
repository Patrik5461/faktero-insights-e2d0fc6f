/*
  Mobilná appka (/app, 390 px, dotyk): faktúra celým životom v telefóne.
  Sprievodca → vystavenie → oprava množstva → zmena odberateľa (Kontrola →
  Zmeniť, upozornenie na nové PDF) → zmazanie (okno musí povedať pravdu:
  číslo sa uvoľní) → faktúra odberateľovi z EÚ s návrhom „Bez DPH — dodanie
  do EÚ" (vypnutie vráti 23 %, tovar § 43). Odberatelia aj faktúry sa na konci
  zmažú natvrdo.
*/
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";
import {
  fakturaPodlaCisla,
  otvorApku,
  otvorFakturuVApke,
  tlacidlo,
  vystavVApke,
} from "../lib/apka.mjs";

const CISLO = /\b([A-Z]{0,4}\d{6,})\b/;

export default {
  popis: "appka: vystavenie, oprava, zmena odberateľa, zmazanie, faktúra do EÚ",
  limit: 240000,
  async spusti(t) {
    const odberatel = async (meno, extra = {}) => {
      const o = await t.rest.vloz("customers", {
        company_id: t.firmy.test,
        name: meno,
        street: "Testovacia 1",
        city: "Bratislava",
        zip: "81101",
        country: "SK",
        ...extra,
      });
      t.uprac(`odberateľ ${meno}`, async () => {
        const r = await t.rest.delete(`customers?id=eq.${o.id}`);
        if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
      });
      return o;
    };
    const prvy = await odberatel(`${t.znacka} Apka Prvý s.r.o.`);
    const druhy = await odberatel(`${t.znacka} Apka Druhý s.r.o.`);
    const eu = await odberatel(`${t.znacka} Apka Polska sp. z o.o.`, {
      country: "PL",
      city: "Warszawa",
      zip: "00-001",
      ic_dph: "PL5242921338",
    });

    const page = await otvorApku(t);
    const uprac = (f) => t.uprac(`faktúra ${f.invoice_number}`, () => zmazFakturuNatvrdo(t, f.id));

    const fa = await t.krok("vystavenie sprievodcom", async () => {
      const text = await vystavVApke(page, {
        odberatel: prvy.name,
        polozka: `${t.znacka} práca v appke`,
        mnozstvo: 2,
        cena: 10,
      });
      const cislo = CISLO.exec(text)?.[1];
      t.over(cislo, `po vystavení nevidno číslo faktúry: ${text.slice(0, 120)}`);
      const f = await t.cakajNa("faktúra v databáze", () => fakturaPodlaCisla(t, "test", cislo));
      uprac(f);
      t.over(f.customer_id === prvy.id, "faktúra má iného odberateľa");
      t.over(Math.abs(Number(f.total) - 24.6) < 0.001, `suma ${f.total}, čakal som 24.60`);
      t.over(f.invoice_items?.length === 1, `položiek ${f.invoice_items?.length}, čakal som 1`);
      await tlacidlo(page, /^Hotovo$/).click();
      return f;
    });

    await t.krok("oprava množstva a zmena odberateľa", async () => {
      await otvorFakturuVApke(page, fa.invoice_number);
      await tlacidlo(page, /^Upraviť faktúru/).click();
      await page.locator('input[inputmode="decimal"]').first().fill("3");
      await tlacidlo(page, /^Ďalej$/).click();
      await tlacidlo(page, /^Zmeniť$/).click();
      await page.getByPlaceholder("Hľadať odberateľa").fill(druhy.name);
      await tlacidlo(page, new RegExp(`^${druhy.name}`)).click();
      await page
        .getByText(/novému pošlite nové PDF/)
        .first()
        .waitFor({ timeout: 10000 });
      await page.getByText(`Pôvodne: ${prvy.name}`).first().waitFor();
      await tlacidlo(page, /^Uložiť zmeny$/).click();
      const f = await t.cakajNa("oprava v databáze", async () => {
        const x = await fakturaPodlaCisla(t, "test", fa.invoice_number);
        return x && Number(x.total) > 30 ? x : null;
      });
      t.over(f.id === fa.id, "oprava vyrobila novú faktúru");
      t.over(Math.abs(Number(f.total) - 36.9) < 0.001, `suma ${f.total}, čakal som 36.90`);
      t.over(f.customer_id === druhy.id, "odberateľ sa nezmenil");
      t.over(f.customer_name === druhy.name, "kópia customer_name ostala pôvodná");
      t.over(Number(f.invoice_items?.[0]?.quantity) === 3, "množstvo položky sa neuložilo");
    });

    await t.krok("zmazanie s pravdivým oknom", async () => {
      await otvorFakturuVApke(page, fa.invoice_number);
      await tlacidlo(page, /^Zmazať faktúru$/).click();
      const okno = page.getByText(/Naozaj zmazať faktúru/).first();
      await okno.waitFor();
      const veta = await page
        .getByText(/Zmizne zo zoznamu/)
        .first()
        .innerText();
      // Generátor čísel zmazané faktúry nepočíta — číslo dostane ďalšia faktúra.
      t.over(/uvoľní/.test(veta), `okno tvrdí niečo iné než skutočnosť: „${veta}“`);
      await tlacidlo(page, /^Zmazať$/).click();
      await t.cakajNa("deleted_at", async () => {
        const r = await t.rest.get(`invoices?id=eq.${fa.id}&select=deleted_at`);
        return r.data?.[0]?.deleted_at;
      });
    });

    await t.krok("faktúra do EÚ: návrh Bez DPH", async () => {
      const text = await vystavVApke(page, {
        odberatel: eu.name,
        polozka: `${t.znacka} tovar do Poľska`,
        cena: 100,
        predVystavenim: async (p) => {
          const navrh = p.locator('[role="note"]').filter({ hasText: "Bez DPH — dodanie do EÚ" });
          await navrh.waitFor({ timeout: 10000 });
          t.over(
            (await navrh.innerText()).includes("PL5242921338"),
            "návrh nespomína IČ DPH odberateľa",
          );
          const sucty = () =>
            p
              .getByText(/^základ .* · DPH /)
              .first()
              .innerText();
          t.over(/DPH 0,00/.test(await sucty()), `s návrhom má byť DPH 0: ${await sucty()}`);
          await navrh.locator('input[type="checkbox"]').uncheck();
          t.over(/DPH 23,00/.test(await sucty()), `bez návrhu má byť 23 %: ${await sucty()}`);
          await navrh.locator('input[type="checkbox"]').check();
          await navrh.getByRole("button", { name: "Tovar" }).click();
        },
      });
      const cislo = CISLO.exec(text)?.[1];
      t.over(cislo, "po vystavení nevidno číslo faktúry");
      const f = await t.cakajNa("faktúra do EÚ", () => fakturaPodlaCisla(t, "test", cislo));
      uprac(f);
      t.over(f.reverse_charge === true, "faktúra nemá prenesenie");
      t.over(f.reverse_charge_type === "eu_b2b", `režim ${f.reverse_charge_type}`);
      t.over(f.eu_plnenie === "tovar", `plnenie ${f.eu_plnenie}, čakal som tovar`);
      t.over(
        Number(f.vat_total) === 0 && Number(f.total) === 100,
        `sumy ${f.vat_total}/${f.total}`,
      );
      await tlacidlo(page, /^Hotovo$/).click();
    });
  },
};
