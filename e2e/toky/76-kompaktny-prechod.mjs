/*
  Kompaktný dizajn — prechod hlavných stránok a detailov dokladov (QA firma Test)
  na 1440 aj 390 px:
  - žiadna stránka sa na telefóne nedá posunúť do strany (meria sa voči
    `screen.width`, nie innerWidth — pozri posuvStranky v toku 70) a ani na
    širokej obrazovke nie je širšia ako okno;
  - detaily dokladov (faktúra, dobropis, zálohová, prijatá, bloček,
    nespracovaný, ponuka) majú kompaktný náhľad ([data-nahlad-kompaktny])
    a panel ([data-panel-kompaktny]) — na širokej obrazovke vedľa seba,
    na telefóne náhľad nad panelom.
  Nič sa nezapisuje okrem dočasného prepnutia dizajnu QA účtu (vráti sa).
  So `E2E_SNIMKY=<priečinok>` uloží snímku každej stránky (vizuálna kontrola).
*/
import { mkdirSync } from "node:fs";
import path from "node:path";
import { pripravKompaktny } from "./68-kompaktny-vystavena.mjs";
import { posuvStranky } from "./70-mobil-ai-hlavicka.mjs";

export const STRANKY = [
  ["prehlad", "/dashboard"],
  ["faktury", "/faktury"],
  ["faktura-nova", "/faktury/nova"],
  ["zalohove", "/zalohove"],
  ["dobropisy", "/faktury?type=credit"],
  ["ponuky", "/ponuky"],
  ["ponuka-nova", "/ponuky/nova"],
  ["objednavky", "/objednavky"],
  ["prijate", "/prijate-faktury"],
  ["prijata-nova", "/prijate-faktury/nova"],
  ["blocky", "/doklady"],
  ["blocek-novy", "/doklady/novy"],
  ["nespracovane", "/nespracovane"],
  ["ostatne", "/ostatne-doklady"],
  ["ostatny-novy", "/ostatne-doklady/novy"],
  ["vyuctovania", "/doklady/vyuctovania"],
  ["vyuctovanie-nove", "/doklady/vyuctovania/novy"],
  ["banka", "/bankove-ucty"],
  ["banka-pohyby", "/bankove-ucty/transakcie"],
  ["pokladna", "/pokladna"],
  ["exporty", "/exporty"],
  ["dph", "/uctovnictvo/dph"],
  ["vykazy", "/uctovnictvo/vykazy"],
  ["adresar", "/odberatelia"],
  ["cennik", "/ceny"],
  ["produkty", "/produkty"],
  ["sklad", "/sklad"],
  ["zakazky", "/zakazky"],
  ["jazdy", "/jazdy"],
  ["vozovy-park", "/vozovy-park"],
  ["palivove-karty", "/vozovy-park/palivove-karty"],
  ["nastavenia", "/nastavenia"],
  ["podpora", "/podpora"],
];

/** Detaily dokladov — [meno, tabuľka, filter, cesta(id)], ktoré majú mať náhľad + panel. */
const DETAILY = [
  [
    "faktura",
    "invoices",
    "type=eq.regular&status=neq.cancelled&deleted_at=is.null",
    (id) => `/faktury/${id}`,
  ],
  ["dobropis", "invoices", "type=eq.credit_note&deleted_at=is.null", (id) => `/faktury/${id}`],
  ["zalohova", "invoices", "type=eq.proforma&deleted_at=is.null", (id) => `/faktury/${id}`],
  ["prijata", "purchase_invoices", "deleted_at=is.null", (id) => `/prijate-faktury/${id}`],
  ["blocek", "expense_documents", "", (id) => `/doklady/novy?id=${id}`],
  ["nespracovany", "nespracovane_doklady", "stav=neq.spracovane", (id) => `/nespracovane/${id}`],
  ["ponuka", "quotes", "deleted_at=is.null", (id) => `/ponuky/${id}`],
];

/** Ostatné stránky s id (bez požiadavky na náhľad). */
const DALSIE = [
  [
    "faktura-uprava",
    "invoices",
    "type=eq.regular&status=neq.cancelled&deleted_at=is.null",
    (id) => `/faktury/${id}/upravit`,
  ],
  ["zakazka", "jobs", "", (id) => `/zakazky/${id}`],
];

async function prveId(t, tabulka, filter) {
  const r = await t.rest
    .get(
      `${tabulka}?company_id=eq.${t.firmy.test}${filter ? `&${filter}` : ""}&select=id&order=created_at.desc&limit=1`,
    )
    .catch(() => null);
  return r?.data?.[0]?.id ?? null;
}

async function stranaKompaktne(t, mobil) {
  const p = await t.novaStranka({ mobil });
  if (!mobil) await p.setViewportSize({ width: 1440, height: 900 });
  await p.context().addInitScript(() => {
    try {
      localStorage.setItem("faktero.dizajn", "kompaktny");
    } catch {
      /* bez úložiska */
    }
  });
  return p;
}

async function nacitaj(t, page, cesta) {
  await t.go(cesta, page);
  await page
    .waitForFunction(
      () => !/Načítavam/.test(document.querySelector("main")?.innerText ?? ""),
      null,
      {
        timeout: 15000,
      },
    )
    .catch(() => {});
  await page.waitForTimeout(800);
}

export default {
  popis:
    "kompaktný dizajn: hlavné stránky bez posuvu do strany, detaily dokladov majú náhľad + panel",
  limit: 600000,
  async spusti(t) {
    await pripravKompaktny(t);
    const snimky = process.env.E2E_SNIMKY || null;
    if (snimky) mkdirSync(snimky, { recursive: true });
    const nalezy = [];

    const zoznam = [...STRANKY.map(([m, c]) => ({ meno: m, cesta: c, detail: false }))];
    await t.krok("príprava: doklady na detaily", async () => {
      // Ponuka vo firme Test nemusí byť — dočasná s jednou položkou (zmaže sa).
      if (!(await prveId(t, "quotes", "deleted_at=is.null"))) {
        const q = await t.rest.vloz("quotes", {
          company_id: t.firmy.test,
          quote_number: `${t.znacka}-CP`.slice(-30),
          customer_name: `${t.znacka} Odberateľ s.r.o.`,
          subtotal: 100,
          vat_total: 23,
          total: 123,
        });
        t.uprac("dočasná ponuka", async () => {
          await t.rest.delete(`quote_items?quote_id=eq.${q.id}`);
          await t.rest.delete(`quotes?id=eq.${q.id}`);
        });
        await t.rest.vloz("quote_items", {
          quote_id: q.id,
          position: 1,
          name: "Služba",
          quantity: 1,
          unit: "ks",
          unit_price: 100,
          vat_rate: 23,
          total: 123,
        });
      }
      for (const [meno, tab, filter, cesta, detail] of [
        ...DETAILY.map((d) => [...d, true]),
        ...DALSIE.map((d) => [...d, false]),
      ]) {
        const id = await prveId(t, tab, filter);
        if (id) zoznam.push({ meno, cesta: cesta(id), detail });
        else t.upozornenia.push(`vo firme Test chýba doklad na „${meno}“`);
      }
    });

    for (const mobil of [false, true]) {
      const page = await stranaKompaktne(t, mobil);
      const sirka = mobil ? 390 : 1440;
      for (const s of zoznam) {
        await t.krok(`${sirka}: ${s.meno}`, async () => {
          await nacitaj(t, page, s.cesta);
          if (s.detail)
            await page
              .locator("[data-panel-kompaktny]")
              .first()
              .waitFor({ timeout: 20000 })
              .catch(() => {});
          const dizajn = await page.evaluate(() => document.documentElement.dataset.dizajn);
          if (dizajn !== "kompaktny") nalezy.push(`${sirka} ${s.meno}: dizajn ${dizajn}`);
          const posuv = await posuvStranky(page);
          if (posuv > 1) nalezy.push(`${sirka} ${s.meno}: posuv do strany ${posuv} px`);
          if (s.detail) {
            const n = page.locator("[data-nahlad-kompaktny]").first();
            const p = page.locator("[data-panel-kompaktny]").first();
            const bn = (await n.count()) ? await n.boundingBox() : null;
            const bp = (await p.count()) ? await p.boundingBox() : null;
            if (!bn || !bp)
              nalezy.push(`${sirka} ${s.meno}: chýba ${bn ? "" : "náhľad "}${bp ? "" : "panel"}`);
            else if (mobil ? bn.y >= bp.y : Math.abs(bn.y - bp.y) > 40)
              nalezy.push(
                `${sirka} ${s.meno}: náhľad a panel nie sú ${mobil ? "pod sebou" : "vedľa seba"}`,
              );
          }
          if (snimky)
            await page
              .screenshot({
                path: path.join(snimky, `${String(sirka)}-${s.meno}.png`),
                fullPage: true,
                timeout: 15000,
              })
              .catch(() => {});
        });
      }
      await page.context().close();
    }
    if (snimky) t.log(`snímky: ${snimky}`);
    t.over(!nalezy.length, `nálezy (${nalezy.length}): ${nalezy.join("; ")}`);
  },
};
