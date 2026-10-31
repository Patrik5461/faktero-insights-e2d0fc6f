/*
  Spätný chod Pohody celou cestou cez web: vystavená faktúra vo firme Test
  (23 % + 19 %) → Účtovné exporty → Pohoda XML (bez označenia) → schéma
  Stormware → Import z Pohody do firmy test2 → sumy, DPH, sadzby, dátum
  dodania a členenie KV musia sedieť na cent s pôvodnou faktúrou.

  Potom odpoveď z Pohody (`responsePack`) nahratá ručne v Prepojení
  s Pohodou: odmietnutý doklad ukáže kód chyby a vysvetlenie (id je
  vymyslené, nič sa nezapíše).

  Import ide do inej firmy (test2), lebo vo firme Test by číslo faktúry bolo
  duplicitné a import by ju správne preskočil. Všetko sa na konci zmaže.
*/
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { overXsd, SCHEMY, textXml } from "../lib/xml.mjs";
import { vystavFakturu, zalozOdberatela, zmazFakturuNatvrdo } from "../lib/doklady.mjs";

const c = (n) => Math.round(Number(n ?? 0) * 100) / 100;

/** Účtovné exporty → Pohoda XML bez „Označiť ako odovzdané“; vráti cestu k súboru. */
export async function exportujDoPohody(t, cisla, meno) {
  const page = t.page;
  const zoznam = Array.isArray(cisla) ? cisla : [cisla];
  const zaciatok = new Date().toISOString();
  t.uprac("história exportov", async () => {
    const r = await t.rest.delete(
      `export_jobs?created_at=gte.${zaciatok}&format=eq.pohoda_xml&invoice_count=eq.${zoznam.length}`,
    );
    if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
  });
  await t.go("/exporty");
  const sekcia = page
    .locator("div.rounded-2xl")
    .filter({ has: page.getByRole("button", { name: "Vybrať všetko", exact: true }) })
    .last();
  const datumy = sekcia.locator('input[type="date"]');
  await datumy.nth(0).fill(t.dnes);
  await datumy.nth(1).fill(t.dnes);
  await sekcia
    .locator("select")
    .filter({ has: page.locator('option[value="pohoda_xml"]') })
    .selectOption("pohoda_xml");
  for (const cislo of zoznam) {
    const riadok = sekcia.locator("tr", { hasText: cislo });
    await riadok.waitFor({ timeout: 20000 });
    await riadok.locator('input[type="checkbox"]').check();
  }
  const oznacit = sekcia.getByLabel(/Označiť ako odovzdané/);
  if (await oznacit.isChecked()) await oznacit.uncheck();
  return await t.stiahni(
    () => sekcia.getByRole("button", { name: "Exportovať", exact: true }).click(),
    meno,
  );
}

/**
 * Import z Pohody (/importy/pohoda) v otvorenej stránke. Vráti čas začiatku —
 * podľa neho `importovana` zmaže len odberateľov, ktorých založil tento import.
 */
export async function importujZPohody(t, page, subor, firma) {
  const od = new Date().toISOString();
  t.uprac("história importov", async () => {
    const jobs = await t.rest.get(
      `import_jobs?company_id=eq.${firma}&created_at=gte.${od}&source=eq.Pohoda&select=id`,
    );
    for (const j of jobs.data ?? []) {
      await t.rest.delete(`import_logs?import_job_id=eq.${j.id}`);
      await t.rest.delete(`import_jobs?id=eq.${j.id}`);
    }
  });
  await t.go("/importy/pohoda", page);
  await page.locator('input[type="file"]').first().setInputFiles(subor);
  await page.getByRole("button", { name: /Načítať náhľad/ }).click();
  await page.getByRole("button", { name: /Pokračovať/ }).waitFor({ timeout: 40000 });
  await page.getByRole("button", { name: /Pokračovať/ }).click();
  await page.getByRole("button", { name: /Potvrdiť a importovať/ }).click();
  await t.potvrd(page);
  await page.getByText("Import dokončený").waitFor({ timeout: 90000 });
  return od;
}

/** Faktúra importovaná do firmy podľa čísla; zaregistruje jej zmazanie. */
export async function importovana(t, firma, cislo, od) {
  const r = await t.cakajNa("importovaná faktúra", async () => {
    const x = await t.rest.get(
      `invoices?company_id=eq.${firma}&invoice_number=eq.${encodeURIComponent(cislo)}&deleted_at=is.null&select=*,invoice_items(*)`,
    );
    return x.data?.[0] ?? null;
  });
  t.uprac(`importovaná ${cislo}`, async () => {
    await zmazFakturuNatvrdo(t, r.id);
    // Len odberateľ, ktorého založil tento import — existujúci kontakt s tým istým IČO ostáva.
    if (r.customer_id && od)
      await t.rest.delete(
        `customers?id=eq.${r.customer_id}&company_id=eq.${firma}&created_at=gte.${od}`,
      );
  });
  return r;
}

export default {
  popis: "Pohoda: export → XSD → import späť do test2 (sumy, sadzby, KV na cent) → odpoveď Pohody",
  limit: 300000,
  async spusti(t) {
    const page = t.page;

    const fa = await t.krok("príprava: faktúra 23 % + 19 % vo firme Test", async () => {
      const odb = await zalozOdberatela(t);
      await t.rest.patch(`customers?id=eq.${odb.id}`, {
        ico: "35999888",
        dic: "2021999888",
        ic_dph: "SK2021999888",
      });
      return await vystavFakturu(t, {
        odberatel: odb.name,
        text: `${t.znacka} — spätný chod Pohody`,
        polozky: [
          [`${t.znacka} služba`, 3, 33.33, 23],
          [`${t.znacka} tovar`, 2, 10.1, 19],
        ],
      });
    });

    const subor = await t.krok("export do Pohody a schéma Stormware", async () => {
      const s = await exportujDoPohody(t, fa.invoice_number, "pohoda-spatny-chod");
      const buf = readFileSync(s);
      const chyba = await overXsd(buf, SCHEMY.pohoda);
      t.over(!chyba, `XML neprešlo schémou Stormware: ${chyba}`);
      const text = textXml(buf);
      t.over(text.includes(fa.invoice_number), "v XML chýba faktúra");
      t.over(/<inv:classificationKVDPH><typ:ids>A1<\/typ:ids>/.test(text), "faktúra nemá KV A1");
      const r = await t.rest.get(`invoices?id=eq.${fa.id}&select=exported_at`);
      t.over(!r.data?.[0]?.exported_at, "faktúra sa označila ako odovzdaná");
      return s;
    });

    await t.krok("import z Pohody do firmy test2 — sumy na cent", async () => {
      const p2 = await t.novaStranka({ firma: "test2" });
      const od = await importujZPohody(t, p2, subor, t.firmy.test2);
      const imp = await importovana(t, t.firmy.test2, fa.invoice_number, od);
      t.over(
        [c(imp.subtotal), c(imp.vat_total), c(imp.total)].join() ===
          [c(fa.subtotal), c(fa.vat_total), c(fa.total)].join(),
        `sumy nesedia: ${imp.subtotal}/${imp.vat_total}/${imp.total} ≠ ${fa.subtotal}/${fa.vat_total}/${fa.total}`,
      );
      const sadzby = (imp.invoice_items ?? []).map((i) => Number(i.vat_rate)).sort();
      t.over(sadzby.join() === "19,23", `sadzby po importe ${sadzby.join()}`);
      const dph = c((imp.invoice_items ?? []).reduce((a, i) => a + Number(i.vat_amount), 0));
      t.over(dph === c(fa.vat_total), `DPH položiek ${dph} ≠ ${fa.vat_total}`);
      t.over(imp.type === "regular", `druh ${imp.type}`);
      t.over(imp.delivery_date === (fa.delivery_date ?? fa.issue_date), "dátum dodania nesedí");
      t.over(imp.kv_clenenie === "A1", `KV po importe ${imp.kv_clenenie}`);
      t.over(imp.customer_ic_dph === "SK2021999888", "IČ DPH odberateľa sa stratilo");
      await p2.close();
    });

    await t.krok("odpoveď z Pohody: odmietnutý doklad ukáže kód a vysvetlenie", async () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<rsp:responsePack version="2.0" id="FAKTERO" state="ok" xmlns:rsp="http://www.stormware.cz/schema/version_2/response.xsd" xmlns:rdc="http://www.stormware.cz/schema/version_2/documentresponse.xsd" xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd">
<rsp:responsePackItem version="2.0" id="00000000-0000-4000-8000-0000000e2e60" state="error">
<inv:invoiceResponse version="2.0" state="error"><rdc:importDetails><rdc:detail>
<rdc:state>error</rdc:state><rdc:errno>108</rdc:errno><rdc:note>Položka nebola nájdená.</rdc:note>
<rdc:XPath>/dat:dataPack/dat:dataPackItem[1]/inv:invoice[1]/inv:invoiceHeader[1]/inv:classificationVAT</rdc:XPath>
</rdc:detail></rdc:importDetails></inv:invoiceResponse></rsp:responsePackItem></rsp:responsePack>`;
      const cesta = path.join(t.vystup, "subory", `${t.tok}-odpoved.xml`);
      writeFileSync(cesta, xml, "utf8");
      await t.go("/uctovnictvo/pohoda");
      await page.locator('input[type="file"][accept*="xml"]').last().setInputFiles(cesta);
      const stav = page.getByRole("status").filter({ hasText: /odmietnutých 1/ });
      await stav.waitFor({ timeout: 30000 });
      const text = await stav.innerText();
      t.over(
        /\[108\]/.test(text) && /classificationVAT/.test(text),
        `chyba bez kódu/poľa: ${text}`,
      );
    });
  },
};
