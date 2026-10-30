/*
  Hromadné zaúčtovanie prijatých s kontrolou členenia DPH a kontrolný výkaz
  podľa odberateľa (test 30. 10., 2. kolo):

  - faktúra dodávateľa so zvykom dostane pri hromadnom zaúčtovaní členenie
    aj predkontáciu zo zvyku; faktúra bez zvyku a bez členenia zaúčtovanie
    zastaví (firma Test je platiteľ DPH);
  - KV za aktuálny mesiac: podnikateľ bez IČ DPH ide do A.1 bez Odb, občan
    do D.2 (nie do A.1) a prijatá s členením PN nie je v B.2.

  AI sa nevolá: návyk dodávateľa sa zapíše rovno (doklad_navyky) a faktúry
  sú označené ako prejdené automatom.
*/
import { readFileSync } from "node:fs";
import path from "node:path";
import { overXsd, SCHEMY, textXml } from "../lib/xml.mjs";
import { vystavFakturu } from "../lib/doklady.mjs";
import { prijataCezRest } from "../lib/zauctovanie.mjs";

const ICO_ZVYK = "50990011";

export default {
  popis:
    "hromadné zaúčtovanie (členenie a predkontácia zo zvyku, blok bez členenia) → KV A.1/D.2/B.2",
  limit: 240000,
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test;

    /* ---------------------------------------- hromadné zaúčtovanie */
    const teraz = new Date().toISOString();
    const navyk = await t.rest.post("doklad_navyky", {
      company_id: firma,
      kluc_dodavatela: `ico:${ICO_ZVYK}`,
      druh: "faktura",
      nazov_dodavatela: `${t.znacka} Zvyk s.r.o.`,
      polia: {
        clenenie: [
          { d: "e2e-1", h: "PD", t: teraz },
          { d: "e2e-2", h: "PD", t: teraz },
        ],
        predkontacia: [
          { d: "e2e-1", h: "2", t: teraz },
          { d: "e2e-2", h: "2", t: teraz },
        ],
      },
      pocet: 2,
    });
    t.over(navyk.status < 300, `návyk sa nezapísal: ${navyk.status} ${navyk.text.slice(0, 200)}`);
    t.uprac("návyk dodávateľa", async () => {
      await t.rest.delete(
        `doklad_navyky?company_id=eq.${firma}&kluc_dodavatela=eq.ico:${ICO_ZVYK}&druh=eq.faktura`,
      );
    });
    const zvyk = await prijataCezRest(t, {
      supplier_name: `${t.znacka} Zvyk s.r.o.`,
      supplier_ico: ICO_ZVYK,
      invoice_number: `${t.znacka}-ZV`,
    });
    const bez = await prijataCezRest(t, {
      supplier_name: `${t.znacka} Bez zvyku s.r.o.`,
      supplier_ico: "50990012",
      invoice_number: `${t.znacka}-BZ`,
    });

    await t.krok("hromadné zaúčtovanie: bez členenia sa zastaví", async () => {
      await t.go("/prijate-faktury");
      const riadok = (c) => page.locator("tr", { hasText: c }).first();
      const zaskrtni = (c) =>
        riadok(c).locator('input[type="checkbox"], button[role="checkbox"]').first().click();
      await riadok(zvyk.invoice_number).waitFor({ timeout: 30000 });
      await zaskrtni(zvyk.invoice_number);
      await zaskrtni(bez.invoice_number);
      await page.getByRole("button", { name: "Zaúčtovať", exact: true }).first().click();
      const okno = page.getByRole("dialog", { name: "Zaúčtovať vybrané faktúry" });
      await okno.waitFor();
      await t.cakajNa("kontrola členenia v okne", async () =>
        (await okno.innerText()).includes("Bez členenia DPH"),
      );
      const text = (await okno.innerText()).replace(/\s+/g, " ");
      t.over(text.includes(bez.invoice_number), `v upozornení chýba ${bez.invoice_number}`);
      t.over(
        !text.includes(`Bez členenia DPH: ${zvyk.invoice_number}`),
        "faktúra so zvykom je medzi tými bez členenia",
      );
      t.over(
        await okno.getByRole("button", { name: "Zaúčtovať", exact: true }).isDisabled(),
        "Zaúčtovať sa dá aj s faktúrou bez členenia",
      );
      await okno.getByRole("button", { name: "Zrušiť" }).click();
      await zaskrtni(bez.invoice_number);
    });

    await t.krok("hromadné zaúčtovanie: členenie a predkontácia zo zvyku", async () => {
      await page.getByRole("button", { name: "Zaúčtovať", exact: true }).first().click();
      const okno = page.getByRole("dialog", { name: "Zaúčtovať vybrané faktúry" });
      await okno.waitFor();
      await t.cakajNa("návrh zo zvyku v okne", async () =>
        (await okno.innerText()).includes("doplní z pravidla alebo zo zvyku"),
      );
      await okno.getByRole("button", { name: "Zaúčtovať", exact: true }).click();
      const p = await t.cakajNa("zaúčtovaná faktúra so zvykom", async () => {
        const x = (
          await t.rest.get(
            `purchase_invoices?id=eq.${zvyk.id}&select=zauctovane_at,pohoda_clenenie_dph,pohoda_predkontacia`,
          )
        ).data?.[0];
        return x?.zauctovane_at ? x : null;
      });
      t.over(
        p.pohoda_clenenie_dph === "PD",
        `členenie ${p.pohoda_clenenie_dph}, čakal som PD zo zvyku`,
      );
      t.over(
        p.pohoda_predkontacia === "2",
        `predkontácia ${p.pohoda_predkontacia}, čakal som 2 zo zvyku`,
      );
    });

    /* ---------------------------------------- kontrolný výkaz */
    const odberatel = async (meno, z = {}) => {
      const o = await t.rest.vloz("customers", {
        company_id: firma,
        name: `${t.znacka} ${meno}`,
        street: "Testovacia 2",
        city: "Bratislava",
        zip: "81101",
        country: "SK",
        ...z,
      });
      t.uprac(`odberateľ ${meno}`, () => t.rest.delete(`customers?id=eq.${o.id}`));
      return o;
    };
    const podnikatel = await odberatel("Živnostník", { ico: "50990021", dic: "1050990021" });
    const obcan = await odberatel("Ján Občan");
    const pn = await prijataCezRest(t, {
      supplier_name: `${t.znacka} PN s.r.o.`,
      supplier_ico: "50990031",
      supplier_ic_dph: "SK2050990031",
      invoice_number: `${t.znacka}-PN`,
      pohoda_clenenie_dph: "PN",
    });

    const [faPod, faObc] = await t.krok("vystavené: podnikateľ bez IČ DPH a občan", async () => [
      await vystavFakturu(t, { odberatel: podnikatel.name, polozky: [["Služba", 1, 100, 23]] }),
      await vystavFakturu(t, { odberatel: obcan.name, polozky: [["Služba", 1, 50, 23]] }),
    ]);

    const kv = await t.krok("stiahnutie KV za aktuálny mesiac", async () => {
      const [rok, mesiac] = t.dnes.split("-").map(Number);
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
      }
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      const xml = main.getByRole("button", { name: /^XML$/ });
      await xml.nth(1).waitFor({ timeout: 30000 });
      // Druhé tlačidlo XML je kontrolný výkaz (priznanie, KV, súhrnný výkaz).
      const subor = await t.stiahni(() => xml.nth(1).click(), "kv");
      t.over(/kv/i.test(path.basename(subor)), `stiahol sa iný výkaz: ${path.basename(subor)}`);
      return readFileSync(subor);
    });

    await t.krok("KV: schéma, A.1 bez Odb, občan v D.2, PN mimo B.2", async () => {
      const chyba = await overXsd(kv, SCHEMY.kvDph);
      t.over(!chyba, `KV neprešiel schémou: ${chyba}`);
      const text = textXml(kv);
      const a1 = text.match(new RegExp(`<A1 [^>]*F="${faPod.invoice_number}"[^>]*/>`))?.[0];
      t.over(a1, `faktúra podnikateľovi ${faPod.invoice_number} nie je v A.1`);
      t.over(!/\bOdb="/.test(a1), `A.1 podnikateľa bez IČ DPH má Odb: ${a1}`);
      t.over(
        !text.includes(`F="${faObc.invoice_number}"`),
        `faktúra občanovi ${faObc.invoice_number} je v KV po faktúrach (patrí do D.2)`,
      );
      t.over(/<D2 /.test(text), "v KV chýba D.2");
      t.over(
        !text.includes(`F="${pn.invoice_number}"`),
        `prijatá s PN ${pn.invoice_number} je v B.2`,
      );
    });
  },
};
