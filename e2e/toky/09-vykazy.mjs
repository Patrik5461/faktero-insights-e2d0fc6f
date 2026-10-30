/* Výkazy k DPH za aktuálny mesiac: priznanie (dph2025.xsd) a kontrolný výkaz (kv_dph_2025.xsd). */
import { readFileSync } from "node:fs";
import path from "node:path";
import { overXsd, SCHEMY } from "../lib/xml.mjs";

export default {
  popis: "výkazy DPH: priznanie a KV za aktuálny mesiac proti XSD",
  limit: 90000,
  async spusti(t) {
    const page = t.page;
    const [rok, mesiac] = t.dnes.split("-").map(Number);

    const subory = await t.krok("stiahnutie XML výkazov", async () => {
      await t.go("/uctovnictvo/vykazy");
      const main = page.locator("main");
      await main.locator('input[type="number"]').first().fill(String(rok));
      const vybery = main.locator("select");
      await vybery.nth(0).selectOption("mesiac");
      /*
        Výkazy sa po zmene obdobia zostavujú na serveri znova. Kým odpoveď
        nepríde, tlačidlo XML stiahne ešte staré obdobie (názov súboru už nový) —
        preto sa čaká na odpoveď.
      */
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
      // Výkazy sa počítajú z dokladov — počkáme, kým sa tlačidlá ustália.
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      const n = await xml.count();
      t.over(n >= 2, `čakal som aspoň 2 tlačidlá XML, je ich ${n}`);
      const von = [];
      // Súhrnný výkaz je bez dodaní do EÚ vypnutý — také tlačidlo sa preskočí.
      for (let i = 0; i < n; i++) {
        const b = xml.nth(i);
        if (!(await b.isVisible().catch(() => false)) || !(await b.isEnabled().catch(() => false)))
          continue;
        von.push(await t.stiahni(() => b.click({ timeout: 5000 }), `vykaz${i + 1}`));
      }
      return von;
    });

    const najdi = (re) => subory.find((s) => re.test(path.basename(s)));

    await t.krok("priznanie k DPH proti dph2025.xsd", async () => {
      const s = najdi(/priznanie/i);
      t.over(
        s,
        `medzi stiahnutými chýba priznanie (${subory.map((x) => path.basename(x)).join(", ")})`,
      );
      const xml = readFileSync(s);
      const chyba = await overXsd(xml, SCHEMY.dph);
      t.over(!chyba, `priznanie neprešlo schémou: ${chyba}`);
      // Nie prázdna kostra: v hlavičke je DIČ firmy a správne obdobie.
      const firma = (await t.rest.get(`companies?id=eq.${t.firmy.test}&select=dic`)).data?.[0];
      const text = xml.toString("utf8");
      t.over(firma?.dic && text.includes(firma.dic), `v priznaní chýba DIČ firmy ${firma?.dic}`);
      t.over(
        new RegExp(`<mesiac>0?${mesiac}</mesiac>`).test(text) && text.includes(`<rok>${rok}</rok>`),
        "priznanie nie je za aktuálny mesiac",
      );
    });

    await t.krok("kontrolný výkaz proti kv_dph_2025.xsd", async () => {
      const s = najdi(/kv|kontrol/i);
      t.over(
        s,
        `medzi stiahnutými chýba kontrolný výkaz (${subory.map((x) => path.basename(x)).join(", ")})`,
      );
      const chyba = await overXsd(readFileSync(s), SCHEMY.kvDph);
      t.over(!chyba, `KV neprešiel schémou: ${chyba}`);
    });
  },
};
