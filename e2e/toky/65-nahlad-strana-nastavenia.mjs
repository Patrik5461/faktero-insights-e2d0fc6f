/*
  Strana náhľadu z Nastavení: voľba „Náhľad vpravo“ sa prejaví v Nespracovaných
  dokladoch / na bločku, na úzkej obrazovke je náhľad pod údajmi a prepínač
  v hlavičke náhľadu sa tam neukazuje. Voľba v účte sa po toku vráti.
*/
import { fotkaBlocku } from "../lib/blocek-obrazok.mjs";
import { SUPABASE } from "../lib/prostredie.mjs";
import { pravidloPreDodavatela } from "../lib/zauctovanie.mjs";
import { metadataUctu, pripravStranu, rozlozenie } from "./64-nahlad-strana.mjs";

export default {
  popis: "náhľad vľavo/vpravo — voľba v Nastaveniach a úzka obrazovka",
  limit: 120000,
  async spusti(t) {
    const page = t.page;
    const jwt = await pripravStranu(t);
    const firma = t.firmy.test;

    const dodavatel = `${t.znacka} Nastavenia s.r.o.`;
    await pravidloPreDodavatela(t, dodavatel);
    const cesta = `${firma}/${t.znacka}-nahlad-nast.png`;
    const r0 = await fetch(`${SUPABASE.url}/storage/v1/object/expense-receipts/${cesta}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE.kluc,
        Authorization: `Bearer ${jwt}`,
        "content-type": "image/png",
        "x-upsert": "true",
      },
      body: await fotkaBlocku({ riadky: [dodavatel], uhol: 0 }),
    });
    t.over(r0.status < 300, `upload ${r0.status}`);
    t.uprac("súbor bločku", () => t.rest.zmazSubory("expense-receipts", [cesta]));
    const blocek = await t.rest.vloz("expense_documents", {
      company_id: firma,
      supplier_name: dodavatel,
      document_number: `${t.znacka}-NS2`,
      issue_date: t.dnes,
      total_amount: 5,
      payment_method: "karta",
      source: "upload",
      file_path: cesta,
      file_mime: "image/png",
    });
    t.uprac("bloček", () => t.rest.delete(`expense_documents?id=eq.${blocek.id}`));

    await t.krok("Nastavenia: zvoliť Náhľad vpravo", async () => {
      await t.go("/nastavenia");
      const skupina = page.getByRole("group", { name: "Strana náhľadu dokladu" });
      await skupina.waitFor({ timeout: 30000 });
      await skupina.getByRole("button", { name: "Náhľad vpravo" }).click();
      t.over(
        (await skupina
          .getByRole("button", { name: "Náhľad vpravo" })
          .getAttribute("aria-pressed")) === "true",
        "voľba sa neoznačila",
      );
      await t.cakajNa(
        "strana_nahladu v účte",
        async () => (await metadataUctu(jwt)).strana_nahladu === "vpravo",
      );
    });

    await t.krok("bloček: náhľad je vpravo", async () => {
      await t.go(`/doklady/novy?id=${blocek.id}`);
      const r = await rozlozenie(page);
      t.over(
        r.strana === "vpravo" && !r.domNahladPrvy && !r.nahladVlavoNaObrazovke,
        JSON.stringify(r),
      );
    });

    await t.krok("úzka obrazovka: bez prepínača, náhľad pod údajmi", async () => {
      const m = await t.novaStranka({ mobil: true });
      await t.go(`/doklady/novy?id=${blocek.id}`, m);
      // Na mobile je náhľad bločku len v rozložení s formulárom (klasické); v kompaktnom detaile sa skrýva.
      const obal = m.locator("[data-strana-nahladu]").first();
      if (await obal.count()) {
        t.over((await obal.getAttribute("data-strana-nahladu")) === "vpravo", "strana na mobile");
        const viditelny = await m.locator("[data-prepinac-strany-nahladu]:visible").count();
        t.over(viditelny === 0, "prepínač sa na úzkej obrazovke nemá ukazovať");
      } else t.log("na úzkej obrazovke sa náhľad neukazuje — prepínač tiež nie");
    });

    await t.krok("Nastavenia: späť Náhľad vľavo", async () => {
      await t.go("/nastavenia");
      await page
        .getByRole("group", { name: "Strana náhľadu dokladu" })
        .getByRole("button", { name: "Náhľad vľavo" })
        .click();
      await t.cakajNa(
        "strana_nahladu v účte",
        async () => (await metadataUctu(jwt)).strana_nahladu === "vlavo",
      );
    });
  },
};
