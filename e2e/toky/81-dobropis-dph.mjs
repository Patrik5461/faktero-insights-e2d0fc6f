/*
  Dobropis v DPH (firma test2): znižuje základ aj daň všade rovnako.

  Cez REST sa zapíše faktúra 1 000 € + 23 % odberateľovi s IČ DPH a k nej
  dobropis −200 € (−46 € DPH) tak, ako ho ukladá formulár (záporné sumy
  a množstvo). Pred zápisom a po ňom sa porovná:
  - priznanie k DPH (XML z /uctovnictvo/vykazy, dph2025.xsd): r03 +1 000,
    r04 +230, r24 −200, r25 −46, výsledok (r32/r33) +184;
  - kontrolný výkaz (kv_dph_2025.xsd): faktúra v A.1, dobropis v C.1 so
    zápornými sumami;
  - DPH prehľad (CSV aj tabuľka na obrazovke /uctovnictvo/dph): riadok dobropisu −200/−46/−246
    (predtým svietil kladne, kým súčty ho odpočítali), sadzba 23 % +800/+184;
  - súčet zoznamu vystavených (`suhrn_vystavenych_faktur` za tieto dva
    doklady): 800 / 184 / 984.
  Rozdiely pred/po môžu pokaziť len doklady, ktoré do test2 v tej istej
  minúte zapíše iný tok; všetko sa na konci zmaže.
*/
import { readFileSync } from "node:fs";
import path from "node:path";
import { overXsd, SCHEMY } from "../lib/xml.mjs";
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";

const r2 = (n) => Math.round(Number(n ?? 0) * 100) / 100;

/** Hodnoty riadkov priznania z XML (`<r03>1000.00</r03>`). */
function riadkyPriznania(xml) {
  const o = {};
  for (const m of String(xml).matchAll(/<(r\d\d[a-e]?)>([^<]*)<\/\1>/g))
    o[m[1]] = Number(m[2] || 0);
  return o;
}

/** Riadky zo sekcie DPH NA VÝSTUPE a zo zoznamu vystavených v CSV prehľadu. */
function csvPrehladu(text) {
  const riadky = String(text).replace(/^﻿/, "").split("\n");
  const vystup = {};
  const doklady = {};
  let sekcia = "";
  for (const r of riadky) {
    if (/^DPH NA VÝSTUPE/.test(r)) sekcia = "vystup";
    else if (/^DPH NA VSTUPE/.test(r)) sekcia = "vstup";
    else if (/^VYSTAVENÉ FAKTÚRY/.test(r)) sekcia = "doklady";
    else if (/^PRIJATÉ FAKTÚRY/.test(r)) sekcia = "prijate";
    const p = r.split(";");
    if (sekcia === "vystup" && p.length >= 3 && /^\d/.test(p[0]))
      vystup[p[0].split(" ")[0]] = { zaklad: Number(p[1]), dph: Number(p[2]) };
    if (sekcia === "doklady" && p.length >= 6)
      doklady[p[0]] = { zaklad: Number(p[3]), dph: Number(p[4]), spolu: Number(p[5]) };
  }
  return { vystup, doklady };
}

export default {
  popis: "dobropis v DPH: priznanie, KV, DPH prehľad a súčet zoznamu pred/po (test2)",
  limit: 240000,
  firma: "test2",
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test2;
    const [rok, mesiac] = t.dnes.split("-").map(Number);

    async function vykazy(nazov) {
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
      const von = {};
      for (let i = 0; i < (await xml.count()); i++) {
        const b = xml.nth(i);
        if (!(await b.isVisible().catch(() => false)) || !(await b.isEnabled().catch(() => false)))
          continue;
        const s = await t.stiahni(() => b.click({ timeout: 5000 }), `${nazov}${i + 1}`);
        const meno = path.basename(s);
        if (/priznanie/i.test(meno)) von.dph = readFileSync(s, "utf8");
        else if (/kv|kontrol/i.test(meno)) von.kv = readFileSync(s, "utf8");
      }
      t.over(von.dph && von.kv, `stiahli sa len ${Object.keys(von).join(", ")}`);
      return von;
    }

    async function prehlad(nazov) {
      await t.go("/uctovnictvo/dph");
      const main = page.locator("main");
      const csv = main.getByRole("button", { name: /CSV/ });
      await csv.first().waitFor({ timeout: 30000 });
      // Predvolené obdobie je aktuálny mesiac; počká sa na dočítanie dokladov.
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(800);
      const s = await t.stiahni(() => csv.first().click(), nazov);
      return csvPrehladu(readFileSync(s, "utf8"));
    }

    /*
      Riadok dokladu v tabuľke na obrazovke — tabuľka a PDF rátali znamienko
      inak ako CSV (bez sumy dokladu otočili aj záporný dobropis na kladný).
    */
    async function bunkyNaObrazovke(cislo) {
      const riadok = page.locator("main table tr", { hasText: cislo }).first();
      await riadok.waitFor({ timeout: 15000 });
      return (await riadok.locator("td").allInnerTexts()).map((x) => x.replace(/\s/g, " ").trim());
    }

    const pred = await t.krok("výkazy a DPH prehľad pred zápisom", async () => ({
      ...(await vykazy("pred")),
      prehlad: await prehlad("prehlad-pred"),
    }));

    const doklady = await t.krok("príprava: faktúra 1 000 € a dobropis −200 €", async () => {
      const o = await t.rest.vloz("customers", {
        company_id: firma,
        name: `${t.znacka} Odberateľ DPH s.r.o.`,
        street: "Testovacia 1",
        city: "Bratislava",
        zip: "81101",
        country: "SK",
        ico: "36000001",
        dic: "2020000001",
        ic_dph: "SK2020000001",
      });
      t.uprac("odberateľ", async () => {
        const r = await t.rest.delete(`customers?id=eq.${o.id}`);
        if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
      });
      const zaloz = async (typ, zaklad, extra = {}) => {
        const c = await t.rest.rpc("faktero_next_invoice_number", {
          _company_id: firma,
          _issue_date: t.dnes,
          _type: typ,
          _series_id: null,
        });
        t.over(c.status === 200, `číslo dokladu: ${c.status} ${c.text.slice(0, 160)}`);
        const dph = r2(zaklad * 0.23);
        const f = await t.rest.vloz("invoices", {
          company_id: firma,
          customer_id: o.id,
          type: typ,
          status: "issued",
          invoice_number: c.data.invoice_number,
          sequence_number: c.data.sequence_number,
          number_series_id: c.data.series_id,
          issue_date: t.dnes,
          delivery_date: t.dnes,
          due_date: t.dnes,
          currency: "EUR",
          payment_method: "bank_transfer",
          customer_name: o.name,
          customer_street: o.street,
          customer_city: o.city,
          customer_zip: o.zip,
          customer_country: "SK",
          customer_ico: o.ico,
          customer_dic: o.dic,
          customer_ic_dph: o.ic_dph,
          intro_note: `${t.znacka} dobropis DPH`,
          subtotal: zaklad,
          vat_total: dph,
          total: r2(zaklad + dph),
          ...extra,
        });
        t.uprac(`doklad ${f.invoice_number}`, () => zmazFakturuNatvrdo(t, f.id));
        const p = await t.rest.post("invoice_items", [
          {
            invoice_id: f.id,
            name: `${t.znacka} služba`,
            quantity: zaklad < 0 ? -1 : 1,
            unit: "ks",
            unit_price: Math.abs(zaklad),
            vat_rate: 23,
            subtotal: zaklad,
            vat_amount: dph,
            total: r2(zaklad + dph),
            position: 0,
          },
        ]);
        t.over(p.status < 300, `položky ${f.invoice_number}: ${p.status} ${p.text.slice(0, 200)}`);
        return f;
      };
      const faktura = await zaloz("regular", 1000);
      const dobropis = await zaloz("credit_note", -200, { opravuje_fakturu_id: faktura.id });
      return { faktura, dobropis };
    });

    const po = await t.krok("výkazy a DPH prehľad po zápise", async () => ({
      ...(await vykazy("po")),
      prehlad: await prehlad("prehlad-po"),
    }));

    await t.krok("priznanie: dobropis v r24/r25, výsledok +184 €", async () => {
      const chyba = await overXsd(Buffer.from(po.dph), SCHEMY.dph);
      t.over(!chyba, `priznanie neprešlo schémou: ${chyba}`);
      const a = riadkyPriznania(pred.dph);
      const b = riadkyPriznania(po.dph);
      const d = (k) => r2((b[k] ?? 0) - (a[k] ?? 0));
      const vysledok = (x) => (x.r32 ?? 0) + (x.r33 ?? 0);
      const ocak = { r03: 1000, r04: 230, r24: -200, r25: -46 };
      for (const [k, v] of Object.entries(ocak))
        t.over(d(k) === v, `${k}: rozdiel ${d(k)}, čakal som ${v}`);
      const dv = r2(vysledok(b) - vysledok(a));
      t.over(dv === 184, `daňová povinnosť (r32/r33) sa zmenila o ${dv}, čakal som 184`);
    });

    await t.krok("KV: faktúra v A.1, dobropis v C.1 záporne", async () => {
      const chyba = await overXsd(Buffer.from(po.kv), SCHEMY.kvDph);
      t.over(!chyba, `KV neprešiel schémou: ${chyba}`);
      const f = doklady.faktura.invoice_number;
      const dob = doklady.dobropis.invoice_number;
      const a1 = [...po.kv.matchAll(/<A1 [^>]*\/>/g)]
        .map((m) => m[0])
        .find((x) => x.includes(`F="${f}"`));
      t.over(a1 && /Z="1000\.00"/.test(a1) && /D="230\.00"/.test(a1), `A.1 faktúry: ${a1}`);
      const c1 = [...po.kv.matchAll(/<C1 [^>]*\/>/g)].map((m) => m[0]).find((x) => x.includes(dob));
      t.over(c1 && /ZR="-200\.00"/.test(c1) && /DR="-46\.00"/.test(c1), `C.1 dobropisu: ${c1}`);
    });

    await t.krok("DPH prehľad (CSV): dobropis záporne v riadku aj v súčte sadzby", async () => {
      const r = po.prehlad.doklady[doklady.dobropis.invoice_number];
      t.over(r, "dobropis v zozname DPH prehľadu chýba");
      t.over(
        r.zaklad === -200 && r.dph === -46 && r.spolu === -246,
        `riadok dobropisu ${JSON.stringify(r)}, čakal som −200 / −46 / −246`,
      );
      const a = pred.prehlad.vystup["23"] ?? { zaklad: 0, dph: 0 };
      const b = po.prehlad.vystup["23"] ?? { zaklad: 0, dph: 0 };
      const dz = r2(b.zaklad - a.zaklad);
      const dd = r2(b.dph - a.dph);
      t.over(dz === 800 && dd === 184, `sadzba 23 %: +${dz} / +${dd}, čakal som +800 / +184`);
    });

    await t.krok("súčet zoznamu vystavených za tieto dva doklady", async () => {
      const r = await t.rest.rpc("suhrn_vystavenych_faktur", {
        p_company_id: firma,
        p_ids: [doklady.faktura.id, doklady.dobropis.id],
      });
      t.over(r.status === 200, `suhrn_vystavenych_faktur: ${r.status} ${r.text.slice(0, 200)}`);
      const m = (r.data?.meny ?? []).find((x) => String(x.mena).toUpperCase() === "EUR");
      t.over(
        m && r2(m.zaklad) === 800 && r2(m.dph) === 184 && r2(m.celkom) === 984,
        `súčet ${JSON.stringify(m)}, čakal som 800 / 184 / 984`,
      );
    });

    await t.krok("DPH prehľad na obrazovke: dobropis záporne ako v CSV", async () => {
      const bunky = await bunkyNaObrazovke(doklady.dobropis.invoice_number);
      const zaporne = (txt) => /^[-−]\s?246,00/.test(String(txt ?? ""));
      t.over(
        zaporne(bunky[5]) && /^[-−]\s?46,00/.test(bunky[4]) && /^[-−]\s?200,00/.test(bunky[3]),
        `dobropis na obrazovke: ${bunky.slice(3).join(" | ")} — čakal som záporné sumy ako v CSV a exportoch`,
      );
    });
  },
};
