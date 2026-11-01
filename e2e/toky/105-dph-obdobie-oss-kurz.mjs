/*
  Rozhodnutia 1. 11. 2026 (firma Test):

  1. DPH prehľad zaraďuje doklady podľa dátumu dodania, rovnako ako priznanie.
     Faktúra vystavená dnes, dodaná posledný deň minulého mesiaca, patrí do
     minulého mesiaca: v prehľade za minulý mesiac je (s dátumom dodania),
     za tento mesiac nie je. Pred zápisom a po ňom sa porovná prehľad (CSV
     z /uctovnictvo/dph) aj priznanie (XML z /uctovnictvo/vykazy) za minulý
     mesiac — DPH 23 % musí v oboch narásť o tú istú sumu.

  2. OSS prepočíta cudziu menu kurzom ECB k poslednému dňu štvrťroka (čl. 366
     smernice 2006/112/ES), nie kurzom z dokladu: faktúra v CZK s kurzom 24 na
     doklade sa v OSS prehľade za minulý ukončený štvrťrok prepočíta kurzom
     ECB z `exchange_rates` k jeho poslednému dňu (alebo najbližšiemu
     zverejnenému po ňom).

  Doklady sa na konci zmažú natvrdo.
*/
import { readFileSync } from "node:fs";
import path from "node:path";
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";

const r2 = (n) => Math.round(Number(n ?? 0) * 100) / 100;
const MESIACE = [
  "Január",
  "Február",
  "Marec",
  "Apríl",
  "Máj",
  "Jún",
  "Júl",
  "August",
  "September",
  "Október",
  "November",
  "December",
];

function riadkyPriznania(xml) {
  const o = {};
  for (const m of String(xml).matchAll(/<(r\d\d[a-e]?)>([^<]*)<\/\1>/g))
    o[m[1]] = Number(m[2] || 0);
  return o;
}

/** Sadzby zo sekcie DPH NA VÝSTUPE a dátumy dokladov v CSV prehľadu. */
function csvPrehladu(text) {
  const vystup = {};
  const doklady = {};
  let sekcia = "";
  for (const r of String(text).replace(/^﻿/, "").split("\n")) {
    if (/^DPH NA VÝSTUPE/.test(r)) sekcia = "vystup";
    else if (/^DPH NA VSTUPE/.test(r)) sekcia = "vstup";
    else if (/^VYSTAVENÉ FAKTÚRY/.test(r)) sekcia = "doklady";
    else if (/^PRIJATÉ FAKTÚRY/.test(r)) sekcia = "prijate";
    const p = r.split(";");
    if (sekcia === "vystup" && p.length >= 3 && /^\d/.test(p[0]))
      vystup[p[0].split(" ")[0]] = { zaklad: Number(p[1]), dph: Number(p[2]) };
    if (sekcia === "doklady" && p.length >= 6) doklady[p[0]] = { datum: p[1], dph: Number(p[4]) };
  }
  return { vystup, doklady };
}

/** Posledný deň mesiaca (mesiac 1–12). */
const koniecMesiaca = (rok, mesiac) =>
  new Date(Date.UTC(rok, mesiac, 0)).toISOString().slice(0, 10);

export default {
  popis: "DPH prehľad podľa dátumu dodania = priznanie; OSS kurzom ECB ku koncu štvrťroka",
  limit: 300000,
  firma: "test",
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test;
    const [rokDnes, mesiacDnes] = t.dnes.split("-").map(Number);
    const rok = mesiacDnes === 1 ? rokDnes - 1 : rokDnes;
    const mesiac = mesiacDnes === 1 ? 12 : mesiacDnes - 1;
    const dodanie = koniecMesiaca(rok, mesiac);

    async function vykazy(nazov) {
      await t.go("/uctovnictvo/vykazy");
      const main = page.locator("main");
      await main.locator('input[type="number"]').first().fill(String(rok));
      const vybery = main.locator("select");
      await vybery.nth(0).selectOption("mesiac");
      /* Po zmene obdobia sa výkazy zostavujú na serveri znova — tlačidlo XML by
         dovtedy stiahlo staré obdobie, preto sa čaká na odpoveď. */
      if ((await vybery.nth(1).inputValue()) !== String(mesiac)) {
        const odpoved = page.waitForResponse(
          (r) => r.url().includes("_serverFn") && r.request().method() === "POST",
          { timeout: 30000 },
        );
        await vybery.nth(1).selectOption(String(mesiac));
        await odpoved;
      }
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(800);
      const xml = main.getByRole("button", { name: /^XML$/ });
      await xml.first().waitFor({ timeout: 30000 });
      for (let i = 0; i < (await xml.count()); i++) {
        const b = xml.nth(i);
        if (!(await b.isVisible().catch(() => false)) || !(await b.isEnabled().catch(() => false)))
          continue;
        const s = await t.stiahni(() => b.click({ timeout: 5000 }), `${nazov}${i + 1}`);
        if (/priznanie/i.test(path.basename(s))) {
          const text = readFileSync(s, "utf8");
          t.over(
            new RegExp(`<mesiac>0?${mesiac}</mesiac>`).test(text) &&
              text.includes(`<rok>${rok}</rok>`),
            `priznanie nie je za ${mesiac}/${rok}`,
          );
          return riadkyPriznania(text);
        }
      }
      throw new Error("priznanie sa nestiahlo");
    }

    /** DPH prehľad za zvolený mesiac (shadcn výbery „Obdobie“ a „Rok“). */
    async function otvorPrehlad(r, m) {
      await t.go("/uctovnictvo/dph");
      const main = page.locator("main");
      await main.getByRole("button", { name: /CSV/ }).first().waitFor({ timeout: 30000 });
      const vyber = async (nazov, moznost) => {
        const box = main.getByRole("combobox", { name: nazov, exact: true }).first();
        if ((await box.innerText()).trim() === moznost) return;
        await box.click();
        await page.getByRole("option", { name: moznost, exact: true }).first().click();
      };
      await vyber("Rok", String(r));
      await vyber("Obdobie", MESIACE[m - 1]);
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(800);
      return main;
    }

    async function prehladCsv(nazov) {
      const main = await otvorPrehlad(rok, mesiac);
      const s = await t.stiahni(
        () => main.getByRole("button", { name: /CSV/ }).first().click(),
        nazov,
      );
      return csvPrehladu(readFileSync(s, "utf8"));
    }

    const zaloz = async (polia, polozka) => {
      const c = await t.rest.rpc("faktero_next_invoice_number", {
        _company_id: firma,
        _issue_date: t.dnes,
        _type: "regular",
        _series_id: null,
      });
      t.over(c.status === 200, `číslo dokladu: ${c.status} ${c.text.slice(0, 160)}`);
      const f = await t.rest.vloz("invoices", {
        company_id: firma,
        type: "regular",
        status: "issued",
        invoice_number: c.data.invoice_number,
        sequence_number: c.data.sequence_number,
        number_series_id: c.data.series_id,
        issue_date: t.dnes,
        due_date: t.dnes,
        payment_method: "bank_transfer",
        intro_note: `${t.znacka} E2E 105`,
        ...polia,
      });
      t.uprac(`doklad ${f.invoice_number}`, () => zmazFakturuNatvrdo(t, f.id));
      const p = await t.rest.post("invoice_items", [
        {
          invoice_id: f.id,
          name: `${t.znacka} služba`,
          quantity: 1,
          unit: "ks",
          position: 0,
          ...polozka,
        },
      ]);
      t.over(p.status < 300, `položka ${f.invoice_number}: ${p.status} ${p.text.slice(0, 200)}`);
      return f;
    };

    /* ------------------------------------------------ 1. DPH prehľad podľa dodania */

    const pred = await t.krok(
      `priznanie a DPH prehľad za ${mesiac}/${rok} pred zápisom`,
      async () => ({
        dph: await vykazy("pred"),
        prehlad: await prehladCsv("prehlad-pred"),
      }),
    );

    const ZAKLAD = 1234.56;
    const DPH = r2(ZAKLAD * 0.23);
    const faktura = await t.krok(`príprava: faktúra vystavená dnes, dodaná ${dodanie}`, () =>
      zaloz(
        {
          delivery_date: dodanie,
          currency: "EUR",
          customer_name: `${t.znacka} Odberateľ`,
          customer_country: "SK",
          subtotal: ZAKLAD,
          vat_total: DPH,
          total: r2(ZAKLAD + DPH),
        },
        {
          unit_price: ZAKLAD,
          vat_rate: 23,
          subtotal: ZAKLAD,
          vat_amount: DPH,
          total: r2(ZAKLAD + DPH),
        },
      ),
    );

    const po = await t.krok("priznanie a DPH prehľad po zápise", async () => ({
      dph: await vykazy("po"),
      prehlad: await prehladCsv("prehlad-po"),
    }));

    await t.krok("faktúra je v prehľade minulého mesiaca s dátumom dodania", async () => {
      const d = po.prehlad.doklady[faktura.invoice_number];
      t.over(d, `faktúra ${faktura.invoice_number} v CSV za ${mesiac}/${rok} chýba`);
      t.over(d.datum === dodanie, `dátum v prehľade ${d.datum}, čakal som dodanie ${dodanie}`);
      const main = page.locator("main");
      await main
        .locator("table tr", { hasText: faktura.invoice_number })
        .first()
        .waitFor({ timeout: 15000 });
    });

    await t.krok("v prehľade tohto mesiaca (vystavenia) faktúra nie je", async () => {
      const main = await otvorPrehlad(rokDnes, mesiacDnes);
      await page.waitForTimeout(500);
      const n = await main.locator("table tr", { hasText: faktura.invoice_number }).count();
      t.over(
        n === 0,
        `faktúra ${faktura.invoice_number} je aj v prehľade ${mesiacDnes}/${rokDnes}`,
      );
    });

    await t.krok("prehľad aj priznanie narástli o tú istú DPH", async () => {
      const dPrehlad = r2(
        (po.prehlad.vystup["23"]?.dph ?? 0) - (pred.prehlad.vystup["23"]?.dph ?? 0),
      );
      const dPriznanie = r2((po.dph.r04 ?? 0) - (pred.dph.r04 ?? 0));
      t.over(dPrehlad === DPH, `DPH prehľad 23 %: +${dPrehlad}, čakal som +${DPH}`);
      t.over(dPriznanie === DPH, `priznanie r04: +${dPriznanie}, čakal som +${DPH}`);
      const zPrehlad = r2(
        (po.prehlad.vystup["23"]?.zaklad ?? 0) - (pred.prehlad.vystup["23"]?.zaklad ?? 0),
      );
      const zPriznanie = r2((po.dph.r03 ?? 0) - (pred.dph.r03 ?? 0));
      t.over(
        zPrehlad === ZAKLAD && zPriznanie === ZAKLAD,
        `základ: prehľad +${zPrehlad}, priznanie r03 +${zPriznanie}, čakal som +${ZAKLAD}`,
      );
    });

    /* ------------------------------------------- 2. OSS kurzom ku koncu štvrťroka */

    const qDnes = Math.floor((mesiacDnes - 1) / 3) + 1;
    const rokQ = qDnes === 1 ? rokDnes - 1 : rokDnes;
    const q = qDnes === 1 ? 4 : qDnes - 1;
    const koniecQ = koniecMesiaca(rokQ, q * 3);
    const dodanieOss = `${rokQ}-${String((q - 1) * 3 + 2).padStart(2, "0")}-15`;
    const SUMA_CZK = 2444;
    const KURZ_DOKLADU = 24;

    const kurzQ = await t.krok(
      `kurz ECB CZK k ${koniecQ} (alebo najbližší zverejnený)`,
      async () => {
        const r = await t.rest.get(
          `exchange_rates?mena=eq.CZK&den=gte.${koniecQ}&select=den,kurz&order=den.asc&limit=1`,
        );
        const k = r.data?.[0];
        t.over(
          k && Number(k.kurz) > 0,
          `kurz CZK k ${koniecQ} v exchange_rates nie je (${r.status})`,
        );
        t.over(Number(k.kurz) !== KURZ_DOKLADU, "kurz ECB je zhodou rovnaký ako kurz dokladu");
        return { den: k.den, kurz: Number(k.kurz) };
      },
    );

    const oss = await t.krok(
      `príprava: OSS faktúra v CZK dodaná ${dodanieOss}, kurz na doklade 24`,
      () =>
        zaloz(
          {
            delivery_date: dodanieOss,
            currency: "CZK",
            exchange_rate: KURZ_DOKLADU,
            customer_name: `${t.znacka} Spotrebiteľ DE`,
            customer_country: "DE",
            oss: true,
            oss_country: "DE",
            subtotal: SUMA_CZK,
            vat_total: r2(SUMA_CZK * 0.19),
            total: r2(SUMA_CZK * 1.19),
          },
          {
            unit_price: SUMA_CZK,
            vat_rate: 19,
            subtotal: SUMA_CZK,
            vat_amount: r2(SUMA_CZK * 0.19),
            total: r2(SUMA_CZK * 1.19),
          },
        ),
    );

    await t.krok(
      `OSS prehľad ${q}. štvrťrok ${rokQ}: kurz ku koncu štvrťroka, nie z dokladu`,
      async () => {
        await t.go("/uctovnictvo/oss");
        const main = page.locator("main");
        await main.locator('input[type="number"]').first().fill(String(rokQ));
        await main.locator("select").first().selectOption(String(q));
        const riadok = main.locator('[data-testid="oss-riadok-DE-19"]');
        await riadok.waitFor({ timeout: 30000 });
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(800);
        const zaklad = Number(await riadok.getAttribute("data-zaklad"));
        const dan = Number(await riadok.getAttribute("data-dan"));
        const cakam = r2(SUMA_CZK / kurzQ.kurz);
        const zDokladu = r2(SUMA_CZK / KURZ_DOKLADU);
        t.over(
          zaklad === cakam,
          `základ DE 19 %: ${zaklad} €, čakal som ${cakam} € (kurz ${kurzQ.kurz} z ${kurzQ.den}); kurzom z dokladu by bolo ${zDokladu} €`,
        );
        t.over(dan === r2(cakam * 0.19), `daň DE 19 %: ${dan} €, čakal som ${r2(cakam * 0.19)} €`);
        const text = await main.locator('[data-testid="oss-prepocitane"]').innerText();
        t.over(
          /štvrťroka/.test(text),
          `chýba označenie prepočtu kurzom ku koncu štvrťroka: ${text}`,
        );
        t.over(text.includes("CZK"), `pri prepočte chýba použitý kurz CZK: ${text}`);
        t.log(
          `OSS ${oss.invoice_number}: ${SUMA_CZK} CZK → ${zaklad} € (kurz ${kurzQ.kurz} z ${kurzQ.den})`,
        );
      },
    );
  },
};
