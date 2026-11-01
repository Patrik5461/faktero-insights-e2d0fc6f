/*
  DPH prehľad v domácej mene (balík B6, firma test2 — SK platiteľ).

  Cez REST sa zapíše faktúra v CZK s kurzom ECB 25 (2 500 Kč + 23 %), teda
  100 € + 23 € DPH. Pred zápisom a po ňom sa porovná:
  - DPH prehľad (CSV /uctovnictvo/dph): sadzba 23 % +100 / +23 (predtým sa
    sčítalo 2 500 „€“), riadok „Mena súčtov;EUR“, doklad v CSV s menou CZK;
  - priznanie k DPH (XML, dph2025.xsd): r03 +100, r04 +23 — prehľad a
    priznanie za ten istý mesiac sa musia zhodovať (výkazy sa nemenili,
    bežná SK firma má rovnaký výsledok ako doteraz);
  - obrazovka: poznámka „prepočítané kurzom ECB“.
  Potom faktúra v USD bez kurzu: prehľad ju do súčtov nepridá a vypíše ju
  v upozornení „bez prepočtu“ (kurz 1 sa nehádá).
  Na konci sa obe faktúry aj odberateľ zmažú.
*/
import { readFileSync } from "node:fs";
import path from "node:path";
import { overXsd, SCHEMY } from "../lib/xml.mjs";
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";

const r2 = (n) => Math.round(Number(n ?? 0) * 100) / 100;

function riadkyPriznania(xml) {
  const o = {};
  for (const m of String(xml).matchAll(/<(r\d\d[a-e]?)>([^<]*)<\/\1>/g))
    o[m[1]] = Number(m[2] || 0);
  return o;
}

function csvPrehladu(text) {
  const riadky = String(text).replace(/^﻿/, "").split("\n");
  const vystup = {};
  const doklady = {};
  let mena = null;
  let sekcia = "";
  for (const r of riadky) {
    if (/^DPH NA VÝSTUPE/.test(r)) sekcia = "vystup";
    else if (/^DPH NA VSTUPE/.test(r)) sekcia = "vstup";
    else if (/^VYSTAVENÉ FAKTÚRY/.test(r)) sekcia = "doklady";
    else if (/^PRIJATÉ FAKTÚRY/.test(r)) sekcia = "prijate";
    const p = r.split(";");
    if (p[0] === "Mena súčtov") mena = p[1]?.trim();
    if (sekcia === "vystup" && p.length >= 3 && /^\d/.test(p[0]))
      vystup[p[0].split(" ")[0]] = { zaklad: Number(p[1]), dph: Number(p[2]) };
    if (sekcia === "doklady" && p.length >= 8)
      doklady[p[0]] = { zaklad: Number(p[3]), dph: Number(p[4]), mena: p[7]?.trim() };
  }
  return { vystup, doklady, mena };
}

export default {
  popis:
    "DPH prehľad v eurách: faktúra v CZK prepočítaná ako v priznaní, USD bez kurzu bokom (test2)",
  limit: 300000,
  firma: "test2",
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test2;
    const [rok, mesiac] = t.dnes.split("-").map(Number);

    async function priznanie(nazov) {
      await t.go("/uctovnictvo/vykazy");
      const main = page.locator("main");
      await main.locator('input[type="number"]').first().fill(String(rok));
      const vybery = main.locator("select");
      await vybery.nth(0).selectOption("mesiac");
      if ((await vybery.nth(1).inputValue()) !== String(mesiac)) {
        const odpoved = page.waitForResponse(
          (r) => r.url().includes("_serverFn") && r.request().method() === "POST",
          { timeout: 30000 },
        );
        await vybery.nth(1).selectOption(String(mesiac));
        await odpoved;
        await page.waitForTimeout(500);
      }
      const xml = main.getByRole("button", { name: /^XML$/ });
      await xml.first().waitFor({ timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      for (let i = 0; i < (await xml.count()); i++) {
        const b = xml.nth(i);
        if (!(await b.isVisible().catch(() => false)) || !(await b.isEnabled().catch(() => false)))
          continue;
        const s = await t.stiahni(() => b.click({ timeout: 5000 }), `${nazov}${i + 1}`);
        if (/priznanie/i.test(path.basename(s))) return readFileSync(s, "utf8");
      }
      throw new Error("priznanie sa nestiahlo");
    }

    async function prehlad(nazov) {
      await t.go("/uctovnictvo/dph");
      const main = page.locator("main");
      const csv = main.getByRole("button", { name: /CSV/ });
      await csv.first().waitFor({ timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(800);
      const s = await t.stiahni(() => csv.first().click(), nazov);
      return csvPrehladu(readFileSync(s, "utf8"));
    }

    const pred = await t.krok("priznanie a DPH prehľad pred zápisom", async () => ({
      dph: await priznanie("pred"),
      prehlad: await prehlad("prehlad-pred"),
    }));

    const odberatel = await t.krok("príprava: odberateľ", async () => {
      const o = await t.rest.vloz("customers", {
        company_id: firma,
        name: `${t.znacka} Odberateľ CZ s.r.o.`,
        street: "Testovací 1",
        city: "Brno",
        zip: "60200",
        country: "SK",
        ico: "36000002",
      });
      t.uprac("odberateľ", async () => {
        const r = await t.rest.delete(`customers?id=eq.${o.id}`);
        if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
      });
      return o;
    });

    async function zaloz({ mena, kurz, zaklad, sadzba }) {
      const c = await t.rest.rpc("faktero_next_invoice_number", {
        _company_id: firma,
        _issue_date: t.dnes,
        _type: "regular",
        _series_id: null,
      });
      t.over(c.status === 200, `číslo dokladu: ${c.status} ${c.text.slice(0, 160)}`);
      const dph = r2((zaklad * sadzba) / 100);
      const f = await t.rest.vloz("invoices", {
        company_id: firma,
        customer_id: odberatel.id,
        type: "regular",
        status: "issued",
        invoice_number: c.data.invoice_number,
        sequence_number: c.data.sequence_number,
        number_series_id: c.data.series_id,
        issue_date: t.dnes,
        delivery_date: t.dnes,
        due_date: t.dnes,
        currency: mena,
        exchange_rate: kurz,
        subtotal_eur: kurz ? r2(zaklad / kurz) : null,
        vat_total_eur: kurz ? r2(dph / kurz) : null,
        payment_method: "bank_transfer",
        customer_name: odberatel.name,
        customer_street: odberatel.street,
        customer_city: odberatel.city,
        customer_zip: odberatel.zip,
        customer_country: "SK",
        customer_ico: odberatel.ico,
        intro_note: `${t.znacka} DPH prehľad meny`,
        subtotal: zaklad,
        vat_total: dph,
        total: r2(zaklad + dph),
      });
      t.uprac(`doklad ${f.invoice_number}`, () => zmazFakturuNatvrdo(t, f.id));
      const p = await t.rest.post("invoice_items", [
        {
          invoice_id: f.id,
          name: `${t.znacka} služba`,
          quantity: 1,
          unit: "ks",
          unit_price: zaklad,
          vat_rate: sadzba,
          subtotal: zaklad,
          vat_amount: dph,
          total: r2(zaklad + dph),
          position: 0,
        },
      ]);
      t.over(p.status < 300, `položky ${f.invoice_number}: ${p.status} ${p.text.slice(0, 200)}`);
      return f;
    }

    const czk = await t.krok("príprava: faktúra 2 500 Kč + 23 %, kurz ECB 25", () =>
      zaloz({ mena: "CZK", kurz: 25, zaklad: 2500, sadzba: 23 }),
    );

    const po = await t.krok("priznanie a DPH prehľad po zápise", async () => ({
      dph: await priznanie("po"),
      prehlad: await prehlad("prehlad-po"),
    }));

    await t.krok("prehľad: sadzba 23 % +100 € / +23 € a mena súčtov EUR", async () => {
      t.over(po.prehlad.mena === "EUR", `mena súčtov v CSV: ${po.prehlad.mena}`);
      const a = pred.prehlad.vystup["23"] ?? { zaklad: 0, dph: 0 };
      const b = po.prehlad.vystup["23"] ?? { zaklad: 0, dph: 0 };
      const dz = r2(b.zaklad - a.zaklad);
      const dd = r2(b.dph - a.dph);
      t.over(dz === 100 && dd === 23, `sadzba 23 %: +${dz} / +${dd}, čakal som +100 / +23`);
      const d = po.prehlad.doklady[czk.invoice_number];
      t.over(d && d.mena === "CZK" && d.zaklad === 2500, `riadok dokladu ${JSON.stringify(d)}`);
    });

    await t.krok("priznanie: r03 +100, r04 +23 — zhodne s prehľadom, prejde schémou", async () => {
      const chyba = await overXsd(Buffer.from(po.dph), SCHEMY.dph);
      t.over(!chyba, `priznanie neprešlo schémou: ${chyba}`);
      const a = riadkyPriznania(pred.dph);
      const b = riadkyPriznania(po.dph);
      const d = (k) => r2((b[k] ?? 0) - (a[k] ?? 0));
      t.over(d("r03") === 100 && d("r04") === 23, `priznanie r03 ${d("r03")}, r04 ${d("r04")}`);
    });

    await t.krok("obrazovka: značka prepočítané", async () => {
      await page.getByTestId("dph-prepocitane").waitFor({ timeout: 15000 });
    });

    const usd = await t.krok("príprava: faktúra 100 USD bez kurzu", () =>
      zaloz({ mena: "USD", kurz: null, zaklad: 100, sadzba: 23 }),
    );

    await t.krok("USD bez kurzu: v súčtoch nie je, je v upozornení", async () => {
      const r = await prehlad("prehlad-usd");
      const b = po.prehlad.vystup["23"] ?? { zaklad: 0, dph: 0 };
      const c = r.vystup["23"] ?? { zaklad: 0, dph: 0 };
      t.over(
        r2(c.zaklad - b.zaklad) === 0,
        `USD bez kurzu zmenil súčet o ${r2(c.zaklad - b.zaklad)}`,
      );
      const upozornenie = page.getByTestId("dph-bez-prepoctu");
      await upozornenie.waitFor({ timeout: 15000 });
      const text = await upozornenie.innerText();
      t.over(
        text.includes(usd.invoice_number),
        `upozornenie nespomína ${usd.invoice_number}: ${text}`,
      );
    });
  },
};
