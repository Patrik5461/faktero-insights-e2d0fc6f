/*
  Balík B2 — formuláre faktúr v českej firme (QA Česká, CZK):
   - C-01 rýchla faktúra vznikne v korunách (predtým natvrdo EUR),
   - C-02 API: dodanie do EÚ (eu_b2b) odberateľovi s českým DIČ odmietne,
     so slovenským IČ DPH prijme (predtým presne naopak — tuzemské bolo vždy SK),
   - C-10 hotovosť v korunách sa zaokrúhli na celé Kč (rozhodnutie 2),
   - C-05 úprava faktúry s prenesením na celom doklade: prepis „Spolu“ = 1 000
     uloží jednotkovú cenu 1 000, nie 826,45.
  Nič sa neposiela von; faktúry, kľúč aj odberatelia sa zmažú natvrdo.
*/
import { createHash, randomBytes } from "node:crypto";
import { BASE } from "../lib/prostredie.mjs";
import { nacitajFakturu, zmazFakturuNatvrdo } from "../lib/doklady.mjs";

async function apiKlient(t, firma) {
  const kluc = `fk_live_` + randomBytes(24).toString("hex");
  const r = await t.rest.post("api_keys", {
    company_id: firma,
    mode: "live",
    name: `${t.znacka} API B2`,
    prefix: kluc.slice(0, 14),
    key_hash: createHash("sha256").update(kluc).digest("hex"),
  });
  t.over(
    r.status < 300 && r.data?.[0]?.id,
    `kľúč sa nezaložil: ${r.status} ${r.text.slice(0, 160)}`,
  );
  const id = r.data[0].id;
  t.uprac("API kľúč", async () => {
    await t.rest.delete(`api_keys?id=eq.${id}`);
  });
  return async (metoda, cesta, telo) => {
    const o = await fetch(`${BASE}/api/v1${cesta}`, {
      method: metoda,
      headers: { authorization: `Bearer ${kluc}`, "content-type": "application/json" },
      body: telo === undefined ? undefined : JSON.stringify(telo),
    });
    const text = await o.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* nie JSON */
    }
    return { status: o.status, data, text };
  };
}

export default {
  popis:
    "B2 CZ: rýchla faktúra v CZK, eu_b2b v API podľa krajiny firmy, hotovosť na celé Kč, úprava PDP",
  limit: 300000,
  firma: "cz",
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.cz;
    const odberatel = async (x) => {
      const r = await t.rest.post("customers", { company_id: firma, odberatel: true, ...x });
      t.over(r.status < 300, `odberateľ sa nezaložil: ${r.status} ${r.text.slice(0, 200)}`);
      const o = r.data[0];
      t.uprac(`kontakt ${x.name}`, async () => {
        const d = await t.rest.delete(`customers?id=eq.${o.id}`);
        if (d.status >= 300) throw new Error(`${d.status} ${d.text.slice(0, 200)}`);
      });
      return o;
    };
    const cz = await odberatel({
      name: `${t.znacka} Odběratel B2 s.r.o.`,
      street: "Vodičkova 12",
      city: "Praha",
      zip: "11000",
      country: "CZ",
    });
    const uprac = (id) => t.uprac(`faktúra ${id.slice(0, 8)}`, () => zmazFakturuNatvrdo(t, id));

    await t.krok("rýchla faktúra v korunách (C-01)", async () => {
      await t.go("/faktury/rychla");
      await page.locator("#odberatel-rychla").click();
      await page.getByPlaceholder(/Hľadať podľa mena/).fill(cz.name);
      await page.locator("button", { hasText: cz.name }).first().click({ timeout: 15000 });
      await page.getByRole("button", { name: /^Ďalej$/ }).click();
      await page.locator("#suma-rychla").fill("1210");
      await page.locator("#text-rychla").fill(`${t.znacka} rýchla`);
      await page.getByRole("button", { name: /^Ďalej$/ }).click();
      const predtym = page.url();
      await page.getByRole("button", { name: /Vytvoriť faktúru/ }).click();
      await page.waitForURL(
        (u) => /\/faktury\/[0-9a-f-]{36}$/.test(u.pathname) && u.href !== predtym,
        {
          timeout: 30000,
        },
      );
      const id = page.url().match(/\/faktury\/([0-9a-f-]{36})/)[1];
      uprac(id);
      const f = await nacitajFakturu(t, id);
      t.over(f.currency === "CZK", `rýchla faktúra CZ firmy je v ${f.currency}, čakal som CZK`);
    });

    await t.krok("API: eu_b2b podľa krajiny firmy (C-02)", async () => {
      const api = await apiKlient(t, firma);
      const zla = await api("POST", "/invoices", {
        customer: { name: `${t.znacka} API CZ DIČ`, country: "CZ", ic_dph: "CZ12345679" },
        reverse_charge: true,
        reverse_charge_type: "eu_b2b",
        items: [{ name: "Služba", quantity: 1, unit_price: 1000, vat_rate: 0 }],
      });
      if (zla.status === 201 && zla.data?.id) uprac(zla.data.id);
      t.over(
        zla.status === 400,
        `eu_b2b s českým DIČ v CZ firme prešlo: ${zla.status} ${zla.text.slice(0, 200)}`,
      );
      const dobra = await api("POST", "/invoices", {
        customer: { name: `${t.znacka} API SK IČ DPH`, country: "SK", ic_dph: "SK2020202021" },
        reverse_charge: true,
        reverse_charge_type: "eu_b2b",
        items: [{ name: "Služba", quantity: 1, unit_price: 1000, vat_rate: 0 }],
      });
      if (dobra.status === 201 && dobra.data?.id) uprac(dobra.data.id);
      t.over(
        dobra.status === 201,
        `eu_b2b so slovenským IČ DPH v CZ firme neprešlo: ${dobra.status} ${dobra.text.slice(0, 200)}`,
      );
      // Odberateľov založených cez API uprac tiež.
      const k = await t.rest.get(
        `customers?company_id=eq.${firma}&name=like.${encodeURIComponent(t.znacka + " API*")}&select=id`,
      );
      for (const c of k.data ?? [])
        t.uprac("API odberateľ", async () => {
          await t.rest.delete(`customers?id=eq.${c.id}`);
        });
    });

    await t.krok("hotovosť v korunách na celé Kč (C-10)", async () => {
      await t.go("/faktury/nova");
      await page.locator("#odberatel-dokladu").waitFor();
      await page.click("#odberatel-dokladu");
      await page.getByPlaceholder(/Hľadať podľa mena/).fill(cz.name);
      await page.locator("button", { hasText: cz.name }).first().click({ timeout: 15000 });
      await page.locator("#sposob-platby").selectOption("cash");
      const r = page.locator('tr:has(input[placeholder="Názov položky"])').first();
      await r.locator('input[placeholder="Názov položky"]').fill(`${t.znacka} hotovosť`);
      const cisla = r.locator('input[type="number"]');
      await cisla.nth(0).fill("1");
      await cisla.nth(1).fill("100.40");
      await r.locator("select").first().selectOption("21");
      const zaokr = await page
        .locator("#zaokruhlenie-dokladu")
        .inputValue()
        .catch(() => "");
      const predtym = page.url();
      await page.locator("#invoice-submit").click();
      await page.waitForURL(
        (u) => /\/faktury\/[0-9a-f-]{36}$/.test(u.pathname) && u.href !== predtym,
        {
          timeout: 30000,
        },
      );
      const id = page.url().match(/\/faktury\/([0-9a-f-]{36})/)[1];
      uprac(id);
      const f = await nacitajFakturu(t, id);
      t.over(
        f.rounding_mode === "retail",
        `zaokrúhlenie ${f.rounding_mode} (formulár ${zaokr}), čakal som retail`,
      );
      // 100,40 + 21,08 = 121,48 → 121 Kč
      t.over(Number(f.total) === 121, `suma ${f.total} Kč, čakal som 121`);
      t.over(Number(f.vat_total) === 21.08, `DPH ${f.vat_total}, čakal som 21,08`);
    });

    await t.krok("úprava faktúry s prenesením: prepis Spolu bez dane (C-05)", async () => {
      const h = await t.rest.post("invoices", {
        company_id: firma,
        customer_id: cz.id,
        customer_name: cz.name,
        type: "regular",
        status: "draft",
        invoice_number: `${t.znacka}-B2-PDP`,
        issue_date: t.dnes,
        delivery_date: t.dnes,
        due_date: t.dnes,
        currency: "CZK",
        reverse_charge: true,
        reverse_charge_type: "domestic_69",
        intro_note: `${t.znacka} PDP`,
        subtotal: 500,
        vat_total: 0,
        total: 500,
      });
      t.over(h.status < 300, `faktúra sa nezaložila: ${h.status} ${h.text.slice(0, 200)}`);
      const id = h.data[0].id;
      uprac(id);
      const p = await t.rest.post("invoice_items", {
        invoice_id: id,
        position: 0,
        name: `${t.znacka} stavebné práce`,
        quantity: 1,
        unit: "ks",
        unit_price: 500,
        vat_rate: 0,
        subtotal: 500,
        vat_amount: 0,
        total: 500,
      });
      t.over(p.status < 300, `položka sa nezaložila: ${p.status} ${p.text.slice(0, 200)}`);

      await t.go(`/faktury/${id}/upravit`);
      const r = page.locator('tr:has(input[placeholder="Názov položky"])').first();
      await r.waitFor();
      // Sadzba v riadku 21 % — pri prenesení na celej faktúre sa daň aj tak neráta.
      await r.locator("select").first().selectOption("21");
      const spolu = r.locator('input[title^="Suma s DPH"]');
      await spolu.fill("1000");
      await spolu.blur();
      await page.getByRole("button", { name: "Uložiť koncept", exact: true }).first().click();
      await t.cakajNa("uložená úprava", async () => {
        const f = await nacitajFakturu(t, id);
        return Number(f.total) !== 500 ? f : null;
      });
      const f = await nacitajFakturu(t, id);
      t.over(Number(f.total) === 1000, `suma ${f.total}, čakal som 1000 (bez DPH pri prenesení)`);
      t.over(Number(f.vat_total) === 0, `DPH ${f.vat_total}, čakal som 0`);
      const pol = await t.rest.get(`invoice_items?invoice_id=eq.${id}&select=unit_price,vat_rate`);
      t.over(
        Math.abs(Number(pol.data?.[0]?.unit_price) - 1000) < 0.01,
        `jednotková cena ${pol.data?.[0]?.unit_price}, čakal som 1000`,
      );
    });
  },
};
