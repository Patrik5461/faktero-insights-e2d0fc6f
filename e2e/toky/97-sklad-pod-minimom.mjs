/*
  Prehľad skladu a „pod minimom“ (oprava balíka B5, 1. 11. 2026):

  - odkazy z Prehľadu („Položky pod minimálnym stavom“) otvoria skladovú kartu,
    nie „Produkt sa nenašiel“ (viedli na id karty namiesto produktu);
  - starý odkaz s id skladovej karty detail tiež otvorí;
  - karta pod minimom je rovnako vo filtri Skladových položiek aj na stránke
    Pod minimom (predtým štyri rôzne pravidlá);
  - hodnota na detaile karty je váženou cenou (ako Prehľad), nie poslednou nákupnou.

  Produkt a karta bez pohybov sa zakladajú pre beh a na konci zmažú.
*/
export default {
  popis: "sklad: Prehľad → pod minimom otvorí kartu, jedno pravidlo minima, hodnota váženou cenou",
  limit: 150000,
  async spusti(t) {
    const firma = t.firmy.test;
    const sku = `${t.znacka}-MIN`;
    const nazov = `${t.znacka} pod minimom`;

    const { produktId, kartaId } = await t.krok("príprava: karta s vysokým minimom", async () => {
      const p = await t.rest.vloz("products", {
        company_id: firma,
        name: nazov,
        code: sku,
        unit: "ks",
        unit_price: 1,
        vat_rate: 23,
        active: true,
      });
      const k = await t.rest.vloz("stock_items", {
        company_id: firma,
        product_id: p.id,
        sku,
        unit: "ks",
        track_stock: true,
        min_stock: 100000,
        purchase_price: 1,
        sale_price: 1,
      });
      t.uprac("karta a produkt", async () => {
        const a = await t.rest.delete(`stock_items?id=eq.${k.id}`);
        if (a.status >= 300) throw new Error(`karta ${a.status} ${a.text.slice(0, 200)}`);
        const b = await t.rest.delete(`products?id=eq.${p.id}`);
        if (b.status >= 300) throw new Error(`produkt ${b.status} ${b.text.slice(0, 200)}`);
      });
      return { produktId: p.id, kartaId: k.id };
    });

    await t.krok("Prehľad: odkaz pod minimom otvorí kartu", async () => {
      await t.go("/sklad");
      // Karta so zoznamom (najvnútornejší div s nadpisom AJ odkazmi) — samotný
      // nadpis je tiež div, v ňom by sa odkazy nenašli nikdy.
      const zoznam = t.page
        .locator("div", { has: t.page.getByText("Položky pod minimálnym stavom") })
        .filter({ has: t.page.locator('a[href*="/sklad/produkty/"]') })
        .last();
      await zoznam.waitFor({ timeout: 20000 });
      const odkazy = zoznam.locator('a[href*="/sklad/produkty/"]', { hasText: nazov });
      const n = await odkazy.count();
      t.over(n > 0, "na Prehľade nie je žiadna položka pod minimom s odkazom");
      await odkazy.first().click();
      await t.page.waitForURL(/\/sklad\/produkty\/[0-9a-f-]{36}/, { timeout: 20000 });
      await t.page.getByText("Na sklade").first().waitFor({ timeout: 20000 });
      const text = await t.page.locator("main").innerText();
      t.over(!/Produkt sa nenašiel/.test(text), "odkaz z Prehľadu vedie na „Produkt sa nenašiel“");
    });

    await t.krok("detail s id karty aj s id produktu", async () => {
      for (const id of [produktId, kartaId]) {
        await t.go(`/sklad/produkty/${id}`);
        await t.page.getByRole("heading", { name: nazov }).waitFor({ timeout: 20000 });
      }
    });

    await t.krok("filter pod minimom a stránka Pod minimom ukážu tú istú kartu", async () => {
      await t.go("/sklad/produkty?filter=low_stock");
      await t.page.getByText(nazov).first().waitFor({ timeout: 20000 });
      await t.go("/sklad/minimum");
      await t.page.getByText(nazov).first().waitFor({ timeout: 20000 });
      // „Vytvoriť príjem“ nesie kartu.
      const riadok = t.page.locator("tr", { hasText: nazov });
      const href = await riadok.getByRole("link", { name: /Vytvoriť príjem/ }).getAttribute("href");
      t.over(href?.includes(`polozka=${kartaId}`), `Vytvoriť príjem bez karty: ${href}`);
    });

    await t.krok("hodnota na detaile karty = vážená cena", async () => {
      // Ľubovoľná karta QA firmy so zásobou, kde sa vážená a posledná nákupná líšia.
      const karty = await t.rest.get(
        `stock_items?company_id=eq.${firma}&product_id=not.is.null&avg_purchase_price=gt.0&select=id,product_id,avg_purchase_price,purchase_price&limit=200`,
      );
      const stavy = await t.rest.get(
        `stock_levels?company_id=eq.${firma}&select=stock_item_id,quantity&limit=1000`,
      );
      const mnozstvo = new Map();
      for (const s of stavy.data ?? [])
        mnozstvo.set(s.stock_item_id, (mnozstvo.get(s.stock_item_id) ?? 0) + Number(s.quantity));
      const k = (karty.data ?? []).find(
        (x) =>
          (mnozstvo.get(x.id) ?? 0) > 0 &&
          Math.abs(Number(x.avg_purchase_price) - Number(x.purchase_price)) > 0.005,
      );
      if (!k) {
        t.log("QA firma nemá kartu so zásobou a rozdielnou cenou — krok preskočený");
        return;
      }
      const hodnota = (mnozstvo.get(k.id) * Number(k.avg_purchase_price)).toLocaleString("sk-SK", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      await t.go(`/sklad/produkty/${k.product_id}`);
      await t.page.getByText("Hodnota skladu").first().waitFor({ timeout: 20000 });
      const text = (await t.page.locator("main").innerText()).replace(/\s/g, " ");
      t.over(
        text.replace(/ | /g, " ").includes(hodnota.replace(/ | /g, " ")),
        `hodnota ${hodnota} (vážená cena) na detaile karty chýba`,
      );
    });
  },
};
