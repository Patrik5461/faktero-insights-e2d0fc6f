/*
  Prijatá faktúra zadaná ručne (bez AI) → zaúčtovanie s predkontáciou
  a členením na detaile → kontrola pred odovzdaním do Pohody ju pustí.
*/
import {
  CLENENIE_PRAVIDLA,
  PREDKONTACIA_PRAVIDLA,
  pravidloPreDodavatela,
  zmazPrijatu,
} from "../lib/zauctovanie.mjs";

const PREDKONTACIA = "7"; // Nákup materiálu — iná než z pravidla, aby bolo vidno ručnú zmenu

export default {
  popis: "prijatá faktúra ručne → zaúčtovanie s predkontáciou a členením → kontrola pred exportom",
  limit: 150000,
  async spusti(t) {
    const page = t.page;
    const dodavatel = `${t.znacka} Dodávateľ s.r.o.`;
    const cislo = `${t.znacka}-PF`;
    await pravidloPreDodavatela(t, t.znacka);
    // Formulár dodávateľa predvolene uloží aj do adresára — aj ten sa uprace.
    t.uprac("dodávateľ v adresári", async () => {
      const r = await t.rest.delete(
        `customers?company_id=eq.${t.firmy.test}&name=like.${encodeURIComponent("E2E-*")}`,
      );
      if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
    });

    const id = await t.krok("zadanie cez formulár", async () => {
      await t.go("/prijate-faktury/nova");
      const pole = (label) =>
        page
          .locator("label")
          .filter({ has: page.getByText(label, { exact: true }) })
          .locator("input, select, textarea")
          .first();
      await pole("Názov *").fill(dodavatel);
      await pole("IČO").fill("50000001");
      await pole("Číslo faktúry dodávateľa *").fill(cislo);
      await pole("Variabilný symbol").fill("20261030");
      await pole("Dátum vystavenia").fill(t.dnes);
      await pole("Dátum dodania (daňového plnenia)").fill(t.dnes);
      await pole("Dátum splatnosti").fill(t.dnes);
      await pole("Bez DPH").fill("100");
      await pole("DPH").fill("23");
      await pole("Celkom").fill("123");
      await page.getByRole("button", { name: "Uložiť prijatú faktúru" }).click();
      // Duplicita by sa pýtala — pri jedinečnom čísle nemá prečo.
      await page.waitForURL(/\/prijate-faktury\/[0-9a-f-]{36}/, { timeout: 30000 });
      const id = page.url().match(/\/prijate-faktury\/([0-9a-f-]{36})/)[1];
      t.uprac(`prijatá ${id.slice(0, 8)}`, () => zmazPrijatu(t, id));
      const r = await t.rest.get(`purchase_invoices?id=eq.${id}&select=*`);
      const p = r.data?.[0];
      t.over(p, "prijatá faktúra sa nezapísala");
      t.over(Number(p.amount_total) === 123, `suma ${p.amount_total}`);
      t.over(
        p.pohoda_predkontacia === PREDKONTACIA_PRAVIDLA &&
          p.pohoda_clenenie_dph === CLENENIE_PRAVIDLA,
        `pravidlo nedoplnilo kódy (${p.pohoda_predkontacia}/${p.pohoda_clenenie_dph})`,
      );
      return id;
    });

    await t.krok("zaúčtovanie na detaile", async () => {
      // Panel má podľa rozloženia rôzny tvar — tlačidlá sú na stránke len raz.
      const panel = page.locator("main");
      await panel
        .getByRole("button", { name: /^(Zaúčtovať|Zrušiť zaúčtovanie)$/ })
        .first()
        .waitFor();
      // Automat mohol doklad podľa pravidla zaúčtovať skôr — zrušením sa do fronty nevráti.
      const zrus = panel.getByRole("button", { name: "Zrušiť zaúčtovanie" });
      if (await zrus.isVisible().catch(() => false)) {
        t.log("doklad zaúčtoval automat podľa pravidla — ruším a účtujem ručne");
        await zrus.click();
        const okno = page.getByRole("alertdialog");
        if (await okno.isVisible({ timeout: 2000 }).catch(() => false))
          await okno.getByRole("button").last().click();
        await panel.getByRole("button", { name: "Zaúčtovať", exact: true }).waitFor();
      }
      // Panel sa po načítaní ešte raz prekreslí a otvorený výber zavrie — skúsi sa znova.
      const hladanie = page.getByPlaceholder(/Hľadať kód, názov alebo účet/).last();
      for (let i = 0; i < 4 && !(await hladanie.isVisible().catch(() => false)); i++) {
        await panel.getByRole("combobox", { name: "Predkontácia", exact: true }).first().click();
        await hladanie.waitFor({ timeout: 3000 }).catch(() => {});
      }
      await hladanie.fill("Nákup materiálu");
      await page.getByRole("option").filter({ hasText: "Nákup materiálu" }).first().click();
      await panel
        .locator("select")
        .filter({ has: page.locator('option[value="B2"]') })
        .first()
        .selectOption("B2")
        .catch(() => {});
      await panel.getByRole("button", { name: "Zaúčtovať", exact: true }).click();
      const p = await t.cakajNa("zaúčtovaná faktúra", async () => {
        const r = await t.rest.get(`purchase_invoices?id=eq.${id}&select=*`);
        const x = r.data?.[0];
        return x?.zauctovane_at ? x : null;
      });
      t.over(
        p.pohoda_predkontacia === PREDKONTACIA,
        `predkontácia ${p.pohoda_predkontacia}, čakal som ${PREDKONTACIA}`,
      );
      t.over(p.pohoda_clenenie_dph === CLENENIE_PRAVIDLA, `členenie ${p.pohoda_clenenie_dph}`);
      t.over(
        p.zauctovanie_zdroj === "manual",
        `zdroj zaúčtovania ${p.zauctovanie_zdroj}, čakal som manual`,
      );
      t.over(!p.exported_at, "faktúra je označená ako odovzdaná");
    });

    await t.krok("kontrola pred odovzdaním do Pohody", async () => {
      await t.go("/exporty");
      const blok = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Kontrola pred odovzdaním do Pohody" }) })
        .first();
      await blok.getByRole("button", { name: "Skontrolovať" }).click();
      await t.cakajNa("výsledok kontroly", async () => {
        const text = await blok.innerText();
        return /prejde kontrolou|Neodovzdané:/.test(text);
      });
      const text = (await blok.innerText()).replace(/\s+/g, " ");
      t.over(
        !text.includes(cislo),
        `kontrola zastavila našu faktúru: ${text.slice(text.indexOf(cislo) - 50, text.indexOf(cislo) + 200)}`,
      );
    });
  },
};
