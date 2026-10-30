/*
  Excel zo zoznamov (Prijaté faktúry, Doklady) s hárkom položiek a ZIP
  prijatých faktúr (prílohy + _suhrn.csv). Len čítanie — QA firma test2.

  Excel: každá faktúra/doklad z hárku musí byť v databáze a hárok Položky
  musí mať toľko riadkov, koľko položiek tie doklady v databáze naozaj majú
  (zoznam položky nenesie, Excel si ich dotiahne sám).
  ZIP: _suhrn.csv má riadok za každú vybranú faktúru, príloh je toľko,
  koľko vybraných faktúr má súbor.
*/
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { cestaModulu } from "../lib/prostredie.mjs";

const modul = async (meno) => {
  const m = await import(pathToFileURL(cestaModulu(meno)).href);
  return m.default ?? m;
};

async function nacitajXlsx(subor) {
  const kniznica = await modul("xlsx");
  const wb = kniznica.read(readFileSync(subor), { type: "buffer" });
  return wb.SheetNames.map((n) => kniznica.utils.sheet_to_json(wb.Sheets[n], { header: 1 }));
}

const pocetPoloziek = (riadky) =>
  riadky.reduce((a, r) => a + (Array.isArray(r.items) ? r.items.length : 0), 0);

export default {
  popis: "Excel s položkami (prijaté, doklady) a ZIP prijatých faktúr",
  firma: "test2",
  limit: 180000,
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test2;

    await t.krok("Prijaté faktúry → Excel s položkami", async () => {
      await t.go("/prijate-faktury");
      await page.locator("tbody tr").first().waitFor({ timeout: 20000 });
      await page.getByRole("button", { name: "Ďalšie akcie" }).first().click();
      const subor = await t.stiahni(
        () => page.getByRole("menuitem", { name: "Excel", exact: true }).click(),
        "prijate-excel",
      );
      const [faktury, polozky] = await nacitajXlsx(subor);
      t.over(
        faktury?.[0]?.[0] === "Číslo",
        `prvý hárok nemá hlavičku: ${JSON.stringify(faktury?.[0])}`,
      );
      const cisla = faktury.slice(1).map((r) => String(r[0]));
      t.over(cisla.length > 0, "Excel je prázdny");
      const db = await t.rest.vsetko(
        `purchase_invoices?company_id=eq.${firma}&deleted_at=is.null&select=invoice_number,items,amount_total&order=id`,
      );
      const vExceli = new Set(cisla);
      const vybrane = db.filter((r) => vExceli.has(String(r.invoice_number)));
      t.over(
        vybrane.length >= cisla.length,
        `v Exceli sú faktúry, ktoré DB nepozná (${cisla.length} vs ${vybrane.length})`,
      );
      const ocak = pocetPoloziek(vybrane);
      t.over(
        polozky.length - 1 === ocak,
        `hárok Položky má ${polozky.length - 1} riadkov, v DB je ${ocak} položiek`,
      );
      const spoluExcel = faktury.slice(1).reduce((a, r) => a + Number(r[10] ?? 0), 0);
      const spoluDb = vybrane.reduce((a, r) => a + Number(r.amount_total ?? 0), 0);
      t.over(Math.abs(spoluExcel - spoluDb) < 0.011, `súčet Spolu ${spoluExcel} ≠ DB ${spoluDb}`);
    });

    await t.krok("Prijaté faktúry → ZIP (PDF + CSV)", async () => {
      await page.locator("thead input[type=checkbox]").first().check();
      const vybrane = Number(
        (
          await page
            .getByText(/^Vybrané: \d+/)
            .first()
            .innerText()
        ).match(/\d+/)[0],
      );
      const subor = await t.stiahni(
        () => page.getByRole("button", { name: /Stiahnuť ZIP/ }).click(),
        "prijate-zip",
      );
      const JSZip = await modul("jszip");
      const zip = await JSZip.loadAsync(readFileSync(subor));
      const csv = await zip.file("_suhrn.csv")?.async("string");
      t.over(csv, "v ZIP-e chýba _suhrn.csv");
      const riadky = csv.replace(/^﻿/, "").split("\n").filter(Boolean).length - 1;
      t.over(riadky === vybrane, `_suhrn.csv má ${riadky} riadkov, vybraných ${vybrane}`);
      const prilohy = Object.keys(zip.files).filter((n) => n !== "_suhrn.csv").length;
      t.over(prilohy <= vybrane, `príloh ${prilohy} > vybraných ${vybrane}`);
      t.log(`ZIP: vybraných ${vybrane}, príloh ${prilohy}`);
    });

    await t.krok("Doklady → Excel s položkami", async () => {
      await t.go("/doklady");
      await page.getByRole("button", { name: "Ďalšie akcie" }).first().waitFor({ timeout: 20000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.getByRole("button", { name: "Ďalšie akcie" }).first().click();
      const subor = await t.stiahni(
        () => page.getByRole("menuitem", { name: "Excel", exact: true }).click(),
        "doklady-excel",
      );
      const [doklady, polozky] = await nacitajXlsx(subor);
      const n = doklady.length - 1;
      const db = await t.rest.vsetko(
        `expense_documents?company_id=eq.${firma}&select=document_number,items&order=id`,
      );
      const cisla = new Set(doklady.slice(1).map((r) => String(r[4] ?? "")));
      const vybrane = db.filter((r) => cisla.has(String(r.document_number ?? "")));
      t.over(
        n > 0 && vybrane.length >= n,
        `doklady v Exceli ${n}, v DB nájdených ${vybrane.length}`,
      );
      const ocak = pocetPoloziek(vybrane);
      t.over(polozky.length - 1 === ocak, `hárok Položky má ${polozky.length - 1}, v DB ${ocak}`);
    });
  },
};
