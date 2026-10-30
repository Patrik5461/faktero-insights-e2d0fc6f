/*
  Doklady okolo faktúry (2. kolo testu 30. 10.):
  - jazyk dokladu zvolený ručne neprepíše výber odberateľa;
  - koncept v hlavičke detailu nepíše „Vystavená“ a vystavenie doplní dátum dodania;
  - zálohová faktúra → úhrada → daňový doklad k platbe → vyúčtovanie, ktorého PDF
    odpočíta zdanenú zálohu v rozpise DPH (daň na úhradu je len rozdiel);
  - ponuka → verejná stránka /ponuka/<token> → prijatie → faktúra.
  E-maily sa neposielajú (token ponuky sa nastaví priamo), všetko sa po toku zmaže.
*/
import { textPdf } from "../lib/pdf.mjs";
import {
  akciaVMenu,
  nacitajFakturu,
  vystavFakturu,
  zalozOdberatela,
  zmazFakturuNatvrdo,
} from "../lib/doklady.mjs";

export default {
  popis: "jazyk, koncept, záloha → doklad k platbe → vyúčtovanie, ponuka → faktúra",
  limit: 240000,
  async spusti(t) {
    const page = t.page;
    const odb = await zalozOdberatela(t);

    await t.krok("ručne zvolený jazyk ostane po výbere odberateľa", async () => {
      await t.go("/faktury/nova");
      await page.locator("#jazyk-dokladu").waitFor();
      await page.locator("#jazyk-dokladu").selectOption("en");
      await page.click("#odberatel-dokladu");
      await page.getByPlaceholder(/Hľadať podľa mena/).fill(odb.name);
      await page.locator("button", { hasText: odb.name }).first().click({ timeout: 15000 });
      await page.waitForTimeout(1500);
      const jazyk = await page.locator("#jazyk-dokladu").inputValue();
      t.over(jazyk === "en", `výber odberateľa prepísal jazyk na ${jazyk}`);
    });

    await t.krok("koncept: hlavička a dátum dodania pri vystavení", async () => {
      const fa = await vystavFakturu(t, {
        odberatel: odb.name,
        polozky: [[`${t.znacka} služba`, 1, 10, 23]],
      });
      await akciaVMenu(page, "Klonovať");
      await page.waitForURL(/\/faktury\/[0-9a-f-]{36}\/upravit/, { timeout: 30000 });
      const id = page.url().match(/\/faktury\/([0-9a-f-]{36})/)[1];
      t.uprac(`koncept ${id.slice(0, 8)}`, () => zmazFakturuNatvrdo(t, id));
      // Koncept bez dátumu dodania — vystavenie ho musí doplniť.
      await t.rest.patch(`invoices?id=eq.${id}`, { delivery_date: null });
      await t.go(`/faktury/${id}`);
      await page.getByText("Toto je koncept.").waitFor();
      const hlavicka = await page.locator("main").innerText();
      t.over(!/Vystavená \d/.test(hlavicka), "detail konceptu píše „Vystavená …“");
      t.over(/dátum vystavenia/i.test(hlavicka), "detail konceptu neukazuje dátum vystavenia");
      await page.getByRole("button", { name: "Vystaviť faktúru", exact: true }).first().click();
      const okno = page.getByRole("alertdialog");
      if (await okno.isVisible({ timeout: 2000 }).catch(() => false))
        await okno.getByRole("button").last().click();
      const k = await t.cakajNa("koncept vystavený", async () => {
        const x = await nacitajFakturu(t, id);
        return x.status === "issued" ? x : null;
      });
      t.over(k.delivery_date, "vystavený koncept nemá dátum dodania");
      t.over(k.invoice_number !== fa.invoice_number, "koncept dostal číslo pôvodnej faktúry");
    });

    const zf = await t.krok("zálohová faktúra a úhrada", async () => {
      const z = await vystavFakturu(t, {
        cesta: "/faktury/nova?type=proforma",
        odberatel: odb.name,
        polozky: [[`${t.znacka} záloha`, 1, 100, 23]],
      });
      t.over(z.type === "proforma", `typ ${z.type}, čakal som proforma`);
      await akciaVMenu(page, "Označiť ako uhradenú");
      const okno = page.getByRole("dialog").or(page.getByRole("alertdialog")).last();
      if (await okno.isVisible({ timeout: 3000 }).catch(() => false))
        await okno.getByRole("button").last().click();
      return await t.cakajNa("záloha uhradená", async () => {
        const x = await nacitajFakturu(t, z.id);
        return x.status === "paid" ? x : null;
      });
    });

    const ddp = await t.krok("daňový doklad k prijatej platbe", async () => {
      await t.go(`/faktury/${zf.id}`);
      await page.getByRole("button", { name: "Vystaviť daňový doklad" }).click();
      const okno = page.getByRole("alertdialog");
      if (await okno.isVisible({ timeout: 3000 }).catch(() => false))
        await okno.getByRole("button").last().click();
      const d = await t.cakajNa("doklad k platbe", async () => {
        const r = await t.rest.get(
          `invoices?advance_invoice_id=eq.${zf.id}&type=eq.advance_payment&select=*`,
        );
        return r.data?.[0] ?? null;
      });
      t.uprac(`doklad k platbe ${d.invoice_number}`, () => zmazFakturuNatvrdo(t, d.id));
      t.over(
        Math.abs(Number(d.vat_total) - 23) < 0.001,
        `DPH dokladu ${d.vat_total}, čakal som 23`,
      );
      return d;
    });

    await t.krok("vyúčtovanie: PDF odpočíta zdanenú zálohu v rozpise DPH", async () => {
      await t.go("/faktury/nova");
      await page.locator("#odberatel-dokladu").waitFor();
      await page.click("#odberatel-dokladu");
      await page.getByPlaceholder(/Hľadať podľa mena/).fill(odb.name);
      await page.locator("button", { hasText: odb.name }).first().click({ timeout: 15000 });
      await page.getByRole("button", { name: "Odpočítať" }).first().click({ timeout: 15000 });
      const riadok = page.locator('tr:has(input[placeholder="Názov položky"])').first();
      await riadok.locator('input[placeholder="Názov položky"]').fill(`${t.znacka} dielo`);
      await riadok.locator('input[type="number"]').nth(0).fill("1");
      await riadok.locator('input[type="number"]').nth(1).fill("300");
      await riadok.locator("select").first().selectOption("23");
      await page.locator("#invoice-submit").click();
      await page.waitForURL((u) => /\/faktury\/[0-9a-f-]{36}$/.test(u.pathname), {
        timeout: 30000,
      });
      const vid = page.url().match(/\/faktury\/([0-9a-f-]{36})/)[1];
      t.uprac(`vyúčtovanie ${vid.slice(0, 8)}`, () => zmazFakturuNatvrdo(t, vid));
      const v = await nacitajFakturu(t, vid);
      t.uprac("väzba zálohy", async () => {
        await t.rest.delete(`invoice_advances?invoice_id=eq.${v.id}`);
      });
      t.over(Math.abs(Number(v.advance_amount) - 123) < 0.001, `odpočet ${v.advance_amount}`);
      const subor = await t.stiahni(
        () =>
          page
            .getByRole("button", { name: /^(Stiahnuť PDF|Vygenerovať PDF)$/ })
            .first()
            .click(),
        "vyuctovanie",
      );
      const text = (await textPdf(subor)).join(" ").replace(/\s+/g, " ");
      t.over(
        text.includes(ddp.invoice_number),
        `v PDF chýba číslo dokladu k platbe ${ddp.invoice_number}`,
      );
      t.over(/DPH spolu 46[,.]00/.test(text), "DPH na vyúčtovaní nie je rozdiel 46,00");
      t.over(/246[,.]00/.test(text), "v PDF chýba suma na úhradu 246,00");
    });

    await t.krok("ponuka: verejná stránka, prijatie a faktúra", async () => {
      const q = await t.rest.vloz("quotes", {
        company_id: t.firmy.test,
        customer_id: odb.id,
        quote_number: `${t.znacka}-P`,
        status: "sent",
        issue_date: t.dnes,
        valid_until: "2099-12-31",
        currency: "EUR",
        customer_name: odb.name,
        customer_country: "SK",
        subtotal: 90,
        vat_total: 20.7,
        total: 110.7,
        approval_token: `e2e${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`,
      });
      t.uprac("ponuka", async () => {
        await t.rest.delete(`quote_items?quote_id=eq.${q.id}`);
        await t.rest.delete(`quotes?id=eq.${q.id}`);
      });
      await t.rest.vloz("quote_items", {
        quote_id: q.id,
        position: 0,
        name: `${t.znacka} návrh`,
        quantity: 1,
        unit: "ks",
        unit_price: 100,
        discount_percent: 10,
        vat_rate: 23,
        subtotal: 90,
        vat_amount: 20.7,
        total: 110.7,
      });
      const anon = await t.novaStranka();
      await anon.goto(`${t.base}/ponuka/${q.approval_token}`, { waitUntil: "domcontentloaded" });
      await anon.getByRole("button", { name: "Prijať ponuku" }).click({ timeout: 30000 });
      await anon.getByText(/ponuku ste prijali/i).waitFor({ timeout: 20000 });
      const prijata = await t.cakajNa("ponuka prijatá", async () => {
        const r = await t.rest.get(`quotes?id=eq.${q.id}&select=status,responded_at`);
        return r.data?.[0]?.status === "accepted" ? r.data[0] : null;
      });
      t.over(prijata.responded_at, "prijatá ponuka nemá responded_at");

      await t.go(`/ponuky/${q.id}`);
      const tl = page.getByRole("button", { name: /Konvertovať na faktúru/ });
      if (await tl.count()) await tl.first().click();
      else await akciaVMenu(page, "Konvertovať na faktúru");
      const okno = page.getByRole("alertdialog");
      if (await okno.isVisible({ timeout: 2000 }).catch(() => false))
        await okno.getByRole("button").last().click();
      await page.waitForURL(/\/faktury\/[0-9a-f-]{36}/, { timeout: 30000 });
      const fid = page.url().match(/\/faktury\/([0-9a-f-]{36})/)[1];
      t.uprac("faktúra z ponuky", () => zmazFakturuNatvrdo(t, fid));
      const f = await nacitajFakturu(t, fid);
      t.over(f.delivery_date, "faktúra z ponuky nemá dátum dodania");
      t.over(Math.abs(Number(f.total) - 110.7) < 0.001, `faktúra z ponuky na ${f.total}`);
    });
  },
};
