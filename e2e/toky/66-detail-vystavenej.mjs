/*
  Jednotný detail vystavenej faktúry — rovnaké rozloženie ako nespracovaný
  doklad (QA firma Test):
  - náhľad PDF na jednej strane (karta [data-karta-nahladu] s plátnom pdf.js),
    na druhej údaje a pod nimi karta „Zaúčtovanie“;
  - polia zaúčtovania v poradí Predkontácia → Členenie DPH → Členenie KV DPH;
  - predkontácia z číselníka sa uloží (Uložiť bez zaúčtovania → invoices);
  - prepínač strany náhľadu presunie náhľad doprava (aj v DOM) a späť;
  - úzka obrazovka (390 px): náhľad je nad údajmi, bez prepínača.
  Faktúra sa po toku zmaže natvrdo, voľba strany v účte sa vráti.
  Tok 67 robí to isté so zálohovou faktúrou (pomocník `overJednotnyDetail`).
*/
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";
import { pripravStranu, rozlozenie } from "./64-nahlad-strana.mjs";

/** Založí faktúru s jednou položkou v QA firme Test. */
export async function zalozFakturu(t, typ, cislo) {
  const f = await t.rest.vloz("invoices", {
    company_id: t.firmy.test,
    invoice_number: cislo,
    type: typ,
    status: "issued",
    issue_date: t.dnes,
    delivery_date: t.dnes,
    due_date: t.dnes,
    currency: "EUR",
    subtotal: 100,
    vat_total: 23,
    total: 123,
    customer_name: `${t.znacka} Odberateľ`,
  });
  t.uprac(`faktúra ${cislo}`, () => zmazFakturuNatvrdo(t, f.id));
  await t.rest.vloz("invoice_items", {
    invoice_id: f.id,
    name: "Konzultácia",
    quantity: 1,
    unit_price: 100,
    vat_rate: 23,
    subtotal: 100,
    vat_amount: 23,
    total: 123,
    position: 0,
  });
  return f;
}

/** Poradie dvoch prvkov v DOM: -1 = a je pred b. */
async function poradie(page, selA, selB) {
  return page.evaluate(
    ([a, b]) => {
      const x = document.querySelector(a);
      const y = document.querySelector(b);
      if (!x || !y) return null;
      return x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    },
    [selA, selB],
  );
}

/**
 * Celý tok nad jednou faktúrou. `hladaj` = text predkontácie v číselníku
 * firmy Test (agenda vystavených, resp. zálohových faktúr).
 */
export async function overJednotnyDetail(t, { id, hladaj, navyse }) {
  const page = t.page;
  await page.setViewportSize({ width: 1440, height: 900 });

  await t.krok("detail: náhľad PDF vľavo, údaje vpravo", async () => {
    await t.go(`/faktury/${id}`);
    const karta = page.locator("[data-karta-nahladu]").first();
    await karta.waitFor({ timeout: 30000 });
    await karta.locator("canvas").first().waitFor({ timeout: 60000 });
    const r = await rozlozenie(page);
    t.over(r?.strana === "vlavo", `strana ${r?.strana}`);
    t.over(r.domNahladPrvy && r.nahladVlavoNaObrazovke, JSON.stringify(r));
  });

  await t.krok("karta Zaúčtovanie pod údajmi, polia v poradí", async () => {
    const sekcia = page.locator("section#zauctovanie");
    await sekcia.waitFor({ timeout: 20000 });
    t.over(
      (await sekcia.getByRole("heading", { name: "Zaúčtovanie" }).count()) === 1,
      "chýba nadpis Zaúčtovanie",
    );
    // Údaje (karta pre účtovníka) sú v DOM pred zaúčtovaním a obe vedľa náhľadu.
    const p = await poradie(page, "[data-karta-nahladu]", "section#zauctovanie");
    t.over(p === -1, "zaúčtovanie nie je za náhľadom (vľavo = náhľad prvý)");
    const popisy = await sekcia
      .locator("label > span")
      .evaluateAll((s) => s.map((x) => x.textContent?.trim() ?? ""));
    const i = (z) => popisy.findIndex((x) => x.startsWith(z));
    t.over(
      i("Predkontácia") >= 0 && i("Predkontácia") < i("Členenie DPH"),
      `poradie: ${popisy.join(" | ")}`,
    );
    t.over(i("Členenie DPH") < i("Členenie KV DPH"), `poradie KV: ${popisy.join(" | ")}`);
    t.over(i("Kategória nákladu") === -1, "vystavená faktúra nemá kategóriu nákladu");
    if (navyse) await navyse(page);
  });

  await t.krok("uloženie predkontácie z číselníka", async () => {
    const sekcia = page.locator("section#zauctovanie");
    const hladanie = page.getByPlaceholder(/Hľadať kód, názov alebo účet/).last();
    for (let i = 0; i < 4 && !(await hladanie.isVisible().catch(() => false)); i++) {
      await sekcia.getByRole("combobox", { name: "Predkontácia", exact: true }).first().click();
      await hladanie.waitFor({ timeout: 3000 }).catch(() => {});
    }
    await hladanie.fill(hladaj);
    await page.getByRole("option").filter({ hasText: hladaj }).first().click();
    await sekcia.getByRole("button", { name: "Uložiť bez zaúčtovania" }).click();
    const f = await t.cakajNa("predkontácia v databáze", async () => {
      const r = await t.rest.get(`invoices?id=eq.${id}&select=pohoda_predkontacia,zauctovane_at`);
      const x = r.data?.[0];
      return x?.pohoda_predkontacia ? x : null;
    });
    t.over(!f.zauctovane_at, "Uložiť bez zaúčtovania faktúru zaúčtovalo");
  });

  await t.krok("prepnutie strany náhľadu doprava a späť", async () => {
    const b = page.getByRole("button", { name: "Presunúť náhľad doprava" }).first();
    await b.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Presunúť náhľad doľava" }).first().waitFor();
    let r = await rozlozenie(page);
    t.over(
      r.strana === "vpravo" && !r.domNahladPrvy && !r.nahladVlavoNaObrazovke,
      JSON.stringify(r),
    );
    t.over(
      await page.evaluate(() =>
        document.activeElement?.hasAttribute("data-prepinac-strany-nahladu"),
      ),
      "fokus sa po prepnutí stratil",
    );
    await page.getByRole("button", { name: "Presunúť náhľad doľava" }).first().click();
    await page.getByRole("button", { name: "Presunúť náhľad doprava" }).first().waitFor();
    r = await rozlozenie(page);
    t.over(r.strana === "vlavo" && r.domNahladPrvy, JSON.stringify(r));
  });

  await t.krok("úzka obrazovka: náhľad nad údajmi, bez prepínača", async () => {
    const m = await t.novaStranka({ mobil: true });
    await t.go(`/faktury/${id}`, m);
    const karta = m.locator("[data-karta-nahladu]").first();
    await karta.waitFor({ state: "visible", timeout: 30000 });
    await m.locator("section#zauctovanie").waitFor({ timeout: 20000 });
    const y = async (sel) => (await m.locator(sel).first().boundingBox())?.y ?? NaN;
    const yNahlad = await y("[data-karta-nahladu]");
    const yZauct = await y("section#zauctovanie");
    t.over(yNahlad < yZauct, `náhľad ${yNahlad} nie je nad zaúčtovaním ${yZauct}`);
    t.over(
      (await m.locator("[data-prepinac-strany-nahladu]:visible").count()) === 0,
      "prepínač sa na úzkej obrazovke nemá ukazovať",
    );
    const sirka = await m.evaluate(() => document.documentElement.scrollWidth);
    t.over(sirka <= 392, `stránka je širšia ako obrazovka (${sirka} px)`);
  });
}

export default {
  popis: "detail vystavenej faktúry ako nespracovaný doklad — náhľad, zaúčtovanie, strana",
  limit: 180000,
  async spusti(t) {
    await pripravStranu(t);
    const f = await t.krok("príprava: vystavená faktúra", () =>
      zalozFakturu(t, "regular", `${t.znacka}-JD1`),
    );
    await overJednotnyDetail(t, { id: f.id, hladaj: "Tržby za vlastné výrobky" });
  },
};
