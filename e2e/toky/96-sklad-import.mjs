/*
  Import skladu (oprava balíka B5, 1. 11. 2026):

  - reimport vlastného exportu („Exportovať vybrané“: Stav, Min, Nákup, Predaj,
    DPH %) nič nepokazí: nevytvorí príjem zo stĺpca „Stav“ a ceny ostanú;
  - „1,50“ s desatinnou čiarkou sa prečíta (predtým zhodil celý import);
  - súbor bez stĺpcov cien a DPH ceny na karte nevynuluje ani DPH neprepíše na 23 %;
  - CSV v UTF-8 bez BOM sa nečíta ako latin1 (názov s diakritikou ostane).

  Produkt a karta sa zakladajú pre každý beh a na konci zmažú (pohyb nevznikne,
  takže zmazať sa dajú).
*/
const ZAKLAD = { purchase_price: 2, sale_price: 3, vat_rate: 19, min_stock: 5 };

async function karta(t, id) {
  const r = await t.rest.get(
    `stock_items?id=eq.${id}&select=purchase_price,sale_price,vat_rate,min_stock,unit`,
  );
  if (r.status !== 200) throw new Error(`karta: ${r.status} ${r.text.slice(0, 200)}`);
  return r.data[0];
}

async function pocetPohybov(t, id) {
  const r = await t.rest.get(`stock_movements?stock_item_id=eq.${id}&select=id`);
  return (r.data ?? []).length;
}

async function nahraj(t, nazovSuboru, text) {
  await t.go("/sklad/import");
  await t.page.locator('input[type="file"]').setInputFiles({
    name: nazovSuboru,
    mimeType: "text/csv",
    // Zámerne bez BOM — tak ukladá CSV väčšina nástrojov okrem Excelu.
    buffer: Buffer.from(text, "utf8"),
  });
  const tlacidlo = t.page.getByRole("button", { name: /Potvrdiť import/ });
  await tlacidlo.waitFor({ timeout: 20000 });
  await tlacidlo.click();
  await t.page.getByText("Výsledok importu").waitFor({ timeout: 30000 });
  return t.page.locator("main").innerText();
}

export default {
  popis: "sklad: reimport exportu bez príjmu, desatinná čiarka, prázdne stĺpce nemenia ceny",
  limit: 120000,
  async spusti(t) {
    const firma = t.firmy.test;
    const sku = `${t.znacka}-IMP`;
    const nazov = `${t.znacka} Čiarový žltý kôň`;

    const { kartaId } = await t.krok("príprava: produkt a karta", async () => {
      const p = await t.rest.vloz("products", {
        company_id: firma,
        name: nazov,
        code: sku,
        unit: "ks",
        unit_price: ZAKLAD.sale_price,
        vat_rate: ZAKLAD.vat_rate,
        active: true,
      });
      const k = await t.rest.vloz("stock_items", {
        company_id: firma,
        product_id: p.id,
        sku,
        unit: "ks",
        track_stock: true,
        ...ZAKLAD,
      });
      t.uprac("karta a produkt", async () => {
        const a = await t.rest.delete(`stock_items?id=eq.${k.id}`);
        if (a.status >= 300) throw new Error(`karta ${a.status} ${a.text.slice(0, 200)}`);
        const b = await t.rest.delete(`products?id=eq.${p.id}`);
        if (b.status >= 300) throw new Error(`produkt ${b.status} ${b.text.slice(0, 200)}`);
      });
      return { kartaId: k.id };
    });

    await t.krok("reimport exportu výberu: bez príjmu, ceny ostanú, čiarka platí", async () => {
      // Presne hlavičky „Exportovať vybrané“; Predaj zmenený a s čiarkou.
      const csv = [
        "SKU;Názov;Čiarový kód;Jednotka;Stav;Min;Nákup;Predaj;DPH %",
        `${sku};${nazov};;ks;12;5;2;3,50;19`,
      ].join("\n");
      const text = await nahraj(t, `${t.znacka}-export.csv`, csv);
      t.over(
        /Počiatočné pohyby:\s*0/.test(text),
        "import vytvoril počiatočný pohyb zo stĺpca Stav",
      );
      t.over(!/Chyby:/.test(text), `import hlási chyby: ${text.slice(0, 300)}`);
      const k = await karta(t, kartaId);
      t.over(Number(k.sale_price) === 3.5, `predajná cena ${k.sale_price}, čakal som 3,5`);
      t.over(Number(k.purchase_price) === 2, `nákupná cena ${k.purchase_price}, čakal som 2`);
      t.over(Number(k.min_stock) === 5, `minimum ${k.min_stock}, čakal som 5`);
      t.over(Number(k.vat_rate) === 19, `DPH ${k.vat_rate}, čakal som 19`);
      t.over((await pocetPohybov(t, kartaId)) === 0, "na karte vznikol pohyb");
    });

    await t.krok("súbor len so SKU a názvom ceny ani DPH nemení", async () => {
      const text = await nahraj(t, `${t.znacka}-nazvy.csv`, `SKU;Názov\n${sku};${nazov}`);
      t.over(!/Chyby:/.test(text), `import hlási chyby: ${text.slice(0, 300)}`);
      const k = await karta(t, kartaId);
      t.over(Number(k.sale_price) === 3.5, `predajná cena ${k.sale_price} sa zmenila`);
      t.over(Number(k.purchase_price) === 2, `nákupná cena ${k.purchase_price} sa vynulovala`);
      t.over(Number(k.vat_rate) === 19, `DPH ${k.vat_rate} sa prepísala`);
      t.over(Number(k.min_stock) === 5, `minimum ${k.min_stock} sa vynulovalo`);
      const p = await t.rest.get(
        `products?code=eq.${encodeURIComponent(sku)}&company_id=eq.${firma}&select=name,vat_rate`,
      );
      t.over(p.data?.[0]?.name === nazov, `názov sa pokazil: ${p.data?.[0]?.name}`);
      t.over(Number(p.data?.[0]?.vat_rate) === 19, `DPH produktu ${p.data?.[0]?.vat_rate}`);
    });

    await t.krok("zlé číslo vyradí len svoj riadok", async () => {
      await t.go("/sklad/import");
      await t.page.locator('input[type="file"]').setInputFiles({
        name: `${t.znacka}-zle.csv`,
        mimeType: "text/csv",
        buffer: Buffer.from(`SKU;Názov;Nákup\n${sku};${nazov};jeden euro`, "utf8"),
      });
      await t.page.getByText(/riadkov sa neimportuje/).waitFor({ timeout: 20000 });
      const k = await karta(t, kartaId);
      t.over(Number(k.purchase_price) === 2, "zlý riadok sa zapísal");
    });
  },
};
