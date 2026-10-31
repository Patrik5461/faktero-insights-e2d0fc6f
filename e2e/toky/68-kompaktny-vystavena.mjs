/*
  Detail vystavenej faktúry v KOMPAKTNOM rozložení (QA firma Test) — musí
  vyzerať ako nespracovaný doklad v kompaktnom rozložení (NespracovanyKompaktny):
  - veľký náhľad PDF s nástrojmi ([data-nahlad-kompaktny], plátno pdf.js) vľavo,
    panel 400 px ([data-panel-kompaktny]) vpravo;
  - sekcie panelu v poradí Základné údaje → Čiastka a DPH → Odberateľ →
    Platobné údaje → Úhrada → Poznámka → Položky;
  - zaúčtovanie hneď za typom dokladu (Predkontácia → Členenie DPH → KV DPH),
    tlačidlá Uložiť bez zaúčtovania / Zaúčtovať v pätičke panelu;
  - predkontácia z číselníka sa uloží (Uložiť bez zaúčtovania → invoices);
  - úzka obrazovka (390 px): náhľad nad panelom, bez vodorovného posuvu.
  QA účet sa na tok prepne do kompaktného dizajnu (user_metadata.dizajn
  a vzhlad_nespracovanych) a potom sa mu vráti pôvodná voľba; faktúra sa
  zmaže natvrdo. Tok 69 robí to isté so zálohovou faktúrou.
*/
import { metadataUctu, rozlozenie } from "./64-nahlad-strana.mjs";
import { zalozFakturu } from "./66-detail-vystavenej.mjs";
import { prihlasRest, qaHeslo } from "../lib/prostredie.mjs";

export const SEKCIE = [
  "Základné údaje",
  "Čiastka a DPH",
  "Odberateľ",
  "Platobné údaje",
  "Úhrada",
  "Poznámka",
  "Položky",
];

/** Prepne QA účet do kompaktného dizajnu (náhľad vľavo) a po toku vráti pôvodné voľby. */
export async function pripravKompaktny(t) {
  const { jwt } = await prihlasRest(qaHeslo());
  const m = await metadataUctu(jwt);
  const povodne = {
    dizajn: m.dizajn ?? null,
    vzhlad_nespracovanych: m.vzhlad_nespracovanych ?? null,
    strana_nahladu: m.strana_nahladu ?? null,
  };
  await metadataUctu(jwt, {
    dizajn: "kompaktny",
    vzhlad_nespracovanych: "kompaktny",
    strana_nahladu: "vlavo",
  });
  t.uprac("dizajn a strana náhľadu v účte", () => metadataUctu(jwt, povodne));
  return jwt;
}

/** Nová stránka s kompaktným dizajnom aj v localStorage (dizajn sa nasadzuje bez bliknutia odtiaľ). */
async function stranaKompaktne(t, moznosti = {}) {
  const p = await t.novaStranka(moznosti);
  await p.context().addInitScript(() => {
    try {
      localStorage.setItem("faktero.dizajn", "kompaktny");
    } catch {
      /* bez úložiska */
    }
  });
  return p;
}

export async function overKompaktnyDetail(t, { id, hladaj, navyse }) {
  const page = await stranaKompaktne(t);
  await page.setViewportSize({ width: 1440, height: 900 });

  await t.krok("kompaktný detail: náhľad PDF vľavo, panel 400 px vpravo", async () => {
    await t.go(`/faktury/${id}`, page);
    t.over(
      (await page.evaluate(() => document.documentElement.dataset.dizajn)) === "kompaktny",
      "stránka nie je v kompaktnom dizajne",
    );
    const nahlad = page.locator("[data-nahlad-kompaktny]").first();
    await nahlad.waitFor({ timeout: 30000 });
    await nahlad.locator("canvas").first().waitFor({ timeout: 60000 });
    for (const x of ["Otočiť doľava", "Priblížiť", "Stiahnuť", "Skryť náhľad"])
      t.over(
        (await nahlad.getByRole("button", { name: x }).count()) +
          (await nahlad.getByRole("link", { name: x }).count()) >
          0,
        `v nástrojoch náhľadu chýba „${x}“`,
      );
    const r = await rozlozenie(page);
    t.over(r?.strana === "vlavo" && r.domNahladPrvy && r.nahladVlavoNaObrazovke, JSON.stringify(r));
    const panel = page.locator("[data-panel-kompaktny]").first();
    const sirka = (await panel.boundingBox())?.width ?? 0;
    t.over(Math.abs(sirka - 400) <= 2, `panel má ${sirka} px, nie 400 px`);
    t.over(
      (await page.locator("[data-detail-vystavenej]").count()) === 1,
      "chýba kompaktný detail vystavenej",
    );
  });

  await t.krok("sekcie panelu v poradí nespracovaného dokladu", async () => {
    const sekcie = await page
      .locator("[data-panel-kompaktny] [data-sekcia]")
      .evaluateAll((s) => s.map((x) => x.getAttribute("data-sekcia")));
    const i = SEKCIE.map((s) => sekcie.indexOf(s));
    t.over(
      i.every((x) => x > -1) && i.every((x, k) => k === 0 || x > i[k - 1]),
      `poradie: ${sekcie.join(" | ")}`,
    );
  });

  await t.krok("zaúčtovanie hneď za typom dokladu, tlačidlá v pätičke", async () => {
    const sekcia = page.locator("section#zauctovanie");
    await sekcia.waitFor({ timeout: 20000 });
    t.over(
      (await sekcia.getAttribute("data-sekcia")) === "Základné údaje",
      "kotva #zauctovanie nie je sekcia Základné údaje",
    );
    const text = (await sekcia.innerText()).replace(/\s+/g, " ");
    const k = (s) => text.indexOf(s);
    t.over(
      k("Typ dokladu") > -1 &&
        k("Typ dokladu") < k("Predkontácia") &&
        k("Predkontácia") < k("Členenie DPH") &&
        k("Členenie DPH") < k("Členenie KV DPH") &&
        k("Členenie KV DPH") < k("Dátum vystavenia"),
      `poradie polí: ${text.slice(0, 300)}`,
    );
    t.over(k("Kategória nákladu") === -1, "vystavená faktúra nemá kategóriu nákladu");
    const pata = page.locator("[data-panel-kompaktny] > div").last();
    for (const x of ["Uložiť bez zaúčtovania", "Zaúčtovať"])
      t.over(
        (await pata.getByRole("button", { name: x, exact: true }).count()) === 1,
        `v pätičke chýba „${x}“`,
      );
    if (navyse) await navyse(page);
  });

  await t.krok("uloženie predkontácie z číselníka (pätička)", async () => {
    const sekcia = page.locator("section#zauctovanie");
    const hladanie = page.getByPlaceholder(/Hľadať kód, názov alebo účet/).last();
    for (let i = 0; i < 4 && !(await hladanie.isVisible().catch(() => false)); i++) {
      await sekcia.getByRole("combobox", { name: "Predkontácia", exact: true }).first().click();
      await hladanie.waitFor({ timeout: 3000 }).catch(() => {});
    }
    await hladanie.fill(hladaj);
    await page.getByRole("option").filter({ hasText: hladaj }).first().click();
    await page
      .locator("[data-panel-kompaktny]")
      .getByRole("button", { name: "Uložiť bez zaúčtovania" })
      .click();
    const f = await t.cakajNa("predkontácia v databáze", async () => {
      const r = await t.rest.get(`invoices?id=eq.${id}&select=pohoda_predkontacia,zauctovane_at`);
      const x = r.data?.[0];
      return x?.pohoda_predkontacia ? x : null;
    });
    t.over(!f.zauctovane_at, "Uložiť bez zaúčtovania faktúru zaúčtovalo");
  });

  await t.krok("úzka obrazovka: náhľad nad panelom, bez posuvu do strany", async () => {
    const m = await stranaKompaktne(t, { mobil: true });
    await t.go(`/faktury/${id}`, m);
    await m
      .locator("[data-nahlad-kompaktny]")
      .first()
      .waitFor({ state: "visible", timeout: 30000 });
    await m.locator("section#zauctovanie").waitFor({ timeout: 20000 });
    const y = async (sel) => (await m.locator(sel).first().boundingBox())?.y ?? NaN;
    const yN = await y("[data-nahlad-kompaktny]");
    const yP = await y("[data-panel-kompaktny]");
    t.over(yN < yP, `náhľad ${yN} nie je nad panelom ${yP}`);
    const sirka = await m.evaluate(() => document.documentElement.scrollWidth);
    t.over(sirka <= 392, `stránka je širšia ako obrazovka (${sirka} px)`);
  });
}

export default {
  popis: "kompaktný detail vystavenej faktúry ako nespracovaný doklad — náhľad, sekcie, pätička",
  limit: 180000,
  async spusti(t) {
    await pripravKompaktny(t);
    const f = await t.krok("príprava: vystavená faktúra", () =>
      zalozFakturu(t, "regular", `${t.znacka}-KD1`),
    );
    await overKompaktnyDetail(t, { id: f.id, hladaj: "Tržby za vlastné výrobky" });
  },
};
