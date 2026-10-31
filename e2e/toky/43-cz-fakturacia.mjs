/*
  Česká firma (QA Česká, CZK) — fakturácia celou cestou cez formulár:
  faktúra 21 % + 12 % (PDF po česky, rozpis DPH, QR platba), prenesenie
  podľa § 92a, služba odberateľovi mimo EÚ (veta „mimo Evropskou unii“, nie
  „v jiném členském státě“), faktúra v eurách s kurzom ČNB, dobropis s českým
  úvodom, zálohová faktúra → daňový doklad k prijatej platbe (záloha ho potom
  ukáže, poznámka je po česky), prijatá faktúra a bloček predvolene v korunách
  s 21 %, náhľad e-mailu s faktúrou a upomienky po česky (nič sa neodosiela).
  Všetko sa na konci zmaže natvrdo.
*/
import { textPdf } from "../lib/pdf.mjs";
import { akciaVMenu, nacitajFakturu, vystavFakturu, zmazFakturuNatvrdo } from "../lib/doklady.mjs";

const pdfText = async (t, meno) => {
  const tl = () => t.page.getByRole("button", { name: /^(Stiahnuť PDF|Vygenerovať PDF)$/ }).first();
  await tl().waitFor();
  const subor = await t.stiahni(() => tl().click(), meno);
  return (await textPdf(subor)).join("\n").replace(/\s+/g, " ");
};

/** Otvorí nový formulár a vyberie odberateľa — návrh daňového režimu sa ukáže hneď. */
async function formularPre(t, nazov) {
  const page = t.page;
  await t.go("/faktury/nova");
  await page.locator("#odberatel-dokladu").waitFor();
  await page.click("#odberatel-dokladu");
  await page.getByPlaceholder(/Hľadať podľa mena/).fill(nazov);
  await page.locator("button", { hasText: nazov }).first().click({ timeout: 15000 });
}

/** Vyplní položky v už otvorenom formulári a vystaví faktúru. */
async function vystavOtvorenu(t, polozky) {
  const page = t.page;
  for (let i = 0; i < polozky.length; i++) {
    let riadky = page.locator('tr:has(input[placeholder="Názov položky"])');
    if ((await riadky.count()) <= i) {
      await page
        .getByRole("button", { name: /Pridať položku/ })
        .first()
        .click();
      riadky = page.locator('tr:has(input[placeholder="Názov položky"])');
    }
    const r = riadky.nth(i);
    const [nazov, mn, cena, dph] = polozky[i];
    await r.locator('input[placeholder="Názov položky"]').fill(nazov);
    const cisla = r.locator('input[type="number"]');
    await cisla.nth(0).fill(String(mn));
    await cisla.nth(1).fill(String(cena));
    if (dph !== undefined) await r.locator("select").first().selectOption(String(dph));
  }
  const predtym = page.url();
  await page.locator("#invoice-submit").click();
  await page.waitForURL((u) => /\/faktury\/[0-9a-f-]{36}$/.test(u.pathname) && u.href !== predtym, {
    timeout: 30000,
  });
  const id = page.url().match(/\/faktury\/([0-9a-f-]{36})/)[1];
  t.uprac(`faktúra ${id.slice(0, 8)}`, () => zmazFakturuNatvrdo(t, id));
  return await nacitajFakturu(t, id);
}

export default {
  popis: "CZ fakturácia: 21/12 %, § 92a, mimo EÚ, EUR (ČNB), dobropis, doklad k platbe, upomienka",
  limit: 300000,
  firma: "cz",
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.cz;
    const odberatel = async (x) => {
      const o = await t.rest.vloz("customers", { company_id: firma, ...x });
      t.uprac(`kontakt ${x.name}`, async () => {
        const r = await t.rest.delete(`customers?id=eq.${o.id}`);
        if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
      });
      return o;
    };
    const cz = await odberatel({
      name: `${t.znacka} Odběratel CZ s.r.o.`,
      street: "Vodičkova 12",
      city: "Praha",
      zip: "11000",
      country: "CZ",
      ico: "27082440",
      dic: "CZ27082440",
      ic_dph: "CZ27082440",
      email: "efaktura-qa@faktero.sk",
    });
    const us = await odberatel({
      name: `${t.znacka} Customer Inc`,
      street: "1 Main St",
      city: "New York",
      zip: "10001",
      country: "US",
    });

    const fa = await t.krok("faktúra 21 % + 12 %: suma a PDF po česky", async () => {
      const f = await vystavFakturu(t, {
        odberatel: cz.name,
        text: `${t.znacka} — služby`,
        polozky: [
          [`${t.znacka} služba`, 10, 1000, 21],
          [`${t.znacka} kniha`, 2, 500, 12],
        ],
      });
      t.over(f.currency === "CZK", `mena ${f.currency}`);
      t.over(Number(f.total) === 13220, `suma ${f.total}, čakal som 13 220`);
      t.over(Number(f.vat_total) === 2220, `DPH ${f.vat_total}, čakal som 2 220`);
      const text = await pdfText(t, "faktura");
      for (const [re, popis] of [
        [/FAKTURA/, "nadpis FAKTURA"],
        [/DATUM ZDANITELNÉHO PLNĚNÍ/, "DUZP"],
        [/DIČ CZ25097563/, "DIČ dodávateľa"],
        [/21 % 10 000,00 CZK 2 100,00 CZK/, "rozpis 21 %"],
        [/12 % 1 000,00 CZK 120,00 CZK/, "rozpis 12 %"],
        [/13 220,00 CZK/, "suma 13 220,00"],
        [/IBAN CZ65 ?0800/, "český IBAN"],
        [/QR PLATBA/, "QR platba"],
      ])
        t.over(re.test(text), `v PDF chýba ${popis}`);
      t.over(!/222\/2004|Z\. z\./.test(text), "v PDF je slovenský zákon");
      return f;
    });

    await t.krok("prenesenie § 92a: 0 % a veta s „Daň odvede zákazník“", async () => {
      await formularPre(t, cz.name);
      await page.getByRole("checkbox", { name: /Prenos daňovej povinnosti/ }).check();
      // Česká firma vidí český paragraf, nie slovenský § 69.
      const druh = await page.locator('option[value="domestic_69"]').first().innerText();
      t.over(/§ 92a/.test(druh), `druh prenosu: „${druh}“`);
      const f = await vystavOtvorenu(t, [[`${t.znacka} montáž`, 1, 20000]]);
      t.over(f.reverse_charge && f.reverse_charge_type === "domestic_69", "faktúra nie je v § 92a");
      t.over(
        Number(f.vat_total) === 0 && Number(f.total) === 20000,
        `suma ${f.total}/${f.vat_total}`,
      );
      const text = await pdfText(t, "pdp");
      t.over(/§ 92a zákona č\. 235\/2004 Sb\./.test(text), "v PDF chýba § 92a zákona 235/2004 Sb.");
      t.over(/Daň odvede zákazník/.test(text), "v PDF chýba „Daň odvede zákazník“");
    });

    await t.krok(
      "služba mimo EÚ: návrh podľa českého zákona a veta „mimo Evropskou unii“",
      async () => {
        await formularPre(t, us.name);
        const navrh = page.getByText(/Odberateľ je mimo EÚ \(US\)/).first();
        await navrh.waitFor({ timeout: 15000 });
        const text = await navrh.innerText();
        t.over(
          /§ 9 ods\. 1/.test(text) && !/§ 15/.test(text),
          `návrh cituje slovenský zákon: ${text}`,
        );
        const f = await vystavOtvorenu(t, [[`${t.znacka} konzultace`, 1, 3000]]);
        t.over(
          f.reverse_charge_type === "export" && f.eu_plnenie === "sluzba",
          `režim ${f.reverse_charge_type}/${f.eu_plnenie}`,
        );
        const pdf = await pdfText(t, "mimo-eu");
        t.over(/mimo Evropskou unii/.test(pdf), "v PDF chýba „mimo Evropskou unii“");
        t.over(
          !/v jiném členském státě/.test(pdf),
          "PDF tvrdí, že služba je v inom členskom štáte EÚ",
        );
      },
    );

    await t.krok("faktúra v eurách: kurz ČNB a daň v korunách", async () => {
      await formularPre(t, cz.name);
      await page.locator("#mena-dokladu").selectOption("EUR");
      const f0 = await vystavOtvorenu(t, [[`${t.znacka} služba EUR`, 1, 100, 21]]);
      const f = await t.cakajNa("kurz na faktúre", async () => {
        const x = await nacitajFakturu(t, f0.id);
        return Number(x.exchange_rate) > 0 ? x : null;
      });
      t.over(
        f.exchange_rate_source === "cnb",
        `zdroj kurzu ${f.exchange_rate_source}, čakal som cnb`,
      );
      const k = await t.rest.get(
        `kurzy_cnb?mena=eq.EUR&den=lte.${f.delivery_date}&order=den.desc&limit=1&select=den,kurz`,
      );
      if (k.status === 200 && k.data?.[0])
        t.over(
          Number(k.data[0].kurz) === Number(f.exchange_rate),
          `kurz ${f.exchange_rate}, ČNB ${k.data[0].den}: ${k.data[0].kurz}`,
        );
      const kurz = Number(f.exchange_rate);
      t.over(
        Math.abs(Number(f.vat_total_eur) - Math.round(21 * kurz * 100) / 100) < 0.011,
        `DPH v Kč ${f.vat_total_eur}, čakal som 21 € × ${kurz}`,
      );
      const pdf = await pdfText(t, "eur");
      t.over(/121,00 EUR/.test(pdf), "v PDF chýba suma 121,00 EUR");
    });

    await t.krok("dobropis: typ, znamienko a český úvod", async () => {
      await t.go(`/faktury/${fa.id}`);
      await akciaVMenu(page, "Vystaviť dobropis");
      await page.waitForURL(/\/faktury\/nova/);
      const d = await vystavFakturu(t, {
        cesta: page.url().replace(t.base, ""),
        tlacidlo: "Vystaviť dobropis",
      });
      t.over(d.type === "credit_note", `typ ${d.type}`);
      t.over(Number(d.total) === -13220, `dobropis na ${d.total}, čakal som −13 220`);
      t.over(d.opravuje_fakturu_id === fa.id, "dobropis nie je naviazaný na faktúru");
      t.over(
        d.intro_note === `Dobropis k faktuře č. ${fa.invoice_number}`,
        `úvod dobropisu „${d.intro_note}“`,
      );
      const pdf = await pdfText(t, "dobropis");
      t.over(
        pdf.includes(`Opravuje fakturu č. ${fa.invoice_number}`),
        "v PDF chýba odkaz na faktúru",
      );
      t.over(!/faktúre/.test(pdf), "v českom PDF je slovenské „faktúre“");
    });

    await t.krok("záloha → daňový doklad k prijatej platbe", async () => {
      const zf = await vystavFakturu(t, {
        cesta: "/faktury/nova?type=proforma",
        odberatel: cz.name,
        polozky: [[`${t.znacka} záloha`, 1, 5000, 21]],
      });
      t.over(zf.type === "proforma", `typ ${zf.type}`);
      // Úhrada zálohy (ako by ju spárovala banka).
      const pl = await t.rest.vloz("payments", {
        invoice_id: zf.id,
        company_id: firma,
        amount: zf.total,
        paid_at: t.dnes,
      });
      t.uprac("úhrada zálohy", () => t.rest.delete(`payments?id=eq.${pl.id}`));
      await t.rest.patch(`invoices?id=eq.${zf.id}`, { status: "paid", paid_at: t.dnes });
      await t.go(`/faktury/${zf.id}`);
      await page.getByRole("button", { name: "Vystaviť daňový doklad" }).click();
      const ddp = await t.cakajNa("doklad k platbe", async () => {
        const r = await t.rest.get(
          `invoices?advance_invoice_id=eq.${zf.id}&type=eq.advance_payment&select=*`,
        );
        return r.data?.[0] ?? null;
      });
      t.uprac(`doklad k platbe ${ddp.invoice_number}`, () => zmazFakturuNatvrdo(t, ddp.id));
      t.over(Number(ddp.total) === 6050 && Number(ddp.vat_total) === 1050, `doklad ${ddp.total}`);
      t.over(ddp.delivery_date === t.dnes, `DUZP dokladu ${ddp.delivery_date}`);
      t.over(/^Daňový doklad k platbě přijaté /.test(ddp.notes ?? ""), `poznámka „${ddp.notes}“`);
      // Záloha ukáže vystavený doklad a už neponúka vystaviť ďalší.
      await page
        .getByRole("link", { name: ddp.invoice_number })
        .first()
        .waitFor({ timeout: 15000 });
      t.over(
        !(await page.getByRole("button", { name: "Vystaviť daňový doklad" }).isVisible()),
        "záloha po vystavení dokladu stále ponúka „Vystaviť daňový doklad“",
      );
    });

    await t.krok("prijatá faktúra a bloček: predvolene koruny a 21 %", async () => {
      await t.go("/prijate-faktury/nova");
      const mena = page
        .locator("select")
        .filter({ has: page.locator('option[value="CZK"]') })
        .first();
      await t.cakajNa(
        "mena prijatej faktúry CZK",
        async () => (await mena.inputValue()) === "CZK",
        {
          limit: 10000,
        },
      );
      await t.go("/doklady/novy");
      const pole = (label) =>
        page
          .locator("label")
          .filter({ has: page.getByText(label, { exact: true }) })
          .locator("input, select")
          .first();
      await pole("Sadzba DPH %").waitFor();
      await t.cakajNa(
        "bloček v CZK s 21 %",
        async () =>
          (await pole("Mena").inputValue()) === "CZK" &&
          (await pole("Sadzba DPH %").inputValue()) === "21",
        { limit: 10000 },
      );
    });

    await t.krok("bloček z QR kódu EET: koruny, dátum a predajca bez AI", async () => {
      /*
        Kameru nahradí podvrhnutý BarcodeDetector, ktorý „prečíta“ český QR
        z účtenky. Server ho rozoberie sám (eet-cz.ts) a predajcu dohľadá v ARES —
        fotka sa neposiela, takže AI sa nevolá.
      */
      const qr = "EET*1.0*BKP:0123456789ABCDEF*DIC:CZ27082440*KC:605.00*DT:202610301015*R:B*";
      const zaciatok = new Date().toISOString();
      t.uprac("bloček z QR", async () => {
        const r = await t.rest.delete(
          `expense_documents?company_id=eq.${firma}&created_at=gte.${zaciatok}&total_amount=eq.605`,
        );
        if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
      });
      const p = await t.novaStranka({ firma: "cz" });
      await p.addInitScript((raw) => {
        globalThis.BarcodeDetector = class {
          async detect() {
            return [{ rawValue: raw }];
          }
        };
        navigator.mediaDevices.getUserMedia = async () => new MediaStream();
        HTMLMediaElement.prototype.play = async function () {};
      }, qr);
      await t.go("/doklady/novy", p);
      await p.getByRole("button", { name: "QR kód", exact: true }).click();
      const pole = (label) =>
        p
          .locator("label")
          .filter({ has: p.getByText(label, { exact: true }) })
          .locator("input, select")
          .first();
      await t.cakajNa(
        "vyplnený bloček z QR",
        async () => (await pole("Celkom").inputValue()) === "605",
        {
          limit: 30000,
        },
      );
      t.over((await pole("Mena").inputValue()) === "CZK", "bloček z QR nie je v korunách");
      t.over((await pole("Dátum vystavenia").inputValue()) === "2026-10-30", "dátum z QR nesedí");
      await p
        .locator("select")
        .filter({ has: p.locator('option[value="hotovost"]') })
        .first()
        .selectOption("karta");
      await p.getByRole("button", { name: "Uložiť doklad" }).click();
      const d = await t.cakajNa("bloček v databáze", async () => {
        const r = await t.rest.get(
          `expense_documents?company_id=eq.${firma}&created_at=gte.${zaciatok}&total_amount=eq.605&select=*`,
        );
        return r.data?.[0] ?? null;
      });
      t.over(d.currency === "CZK", `mena ${d.currency}`);
      t.over(d.supplier_ico === "27082440", `IČO predajcu ${d.supplier_ico}`);
      t.over(d.issue_date === "2026-10-30", `dátum ${d.issue_date}`);
      t.over(d.status === "processed", `stav ${d.status}, QR bloček má ísť rovno medzi Bločky`);
      await p.close();
    });

    await t.krok(
      "e-mail s faktúrou: predvolený predmet a text po česky (neodosiela sa)",
      async () => {
        await t.go(`/faktury/${fa.id}`);
        await page
          .getByRole("button", { name: /^(Odoslať e-mailom|E-mailom)$/ })
          .first()
          .click();
        const okno = page.getByRole("dialog", { name: "Odoslať faktúru e-mailom" });
        await okno.waitFor();
        await page.waitForTimeout(1000);
        const [adresa, predmet, sprava] = await okno
          .locator("input:not([type=checkbox]), textarea")
          .evaluateAll((xs) => xs.map((x) => x.value));
        t.over(adresa === "efaktura-qa@faktero.sk", `adresát ${adresa}`);
        t.over(
          predmet === `Faktura ${fa.invoice_number}`,
          `predmet „${predmet}“ (čakal som český)`,
        );
        t.over(
          /^Dobrý den/.test(sprava) && !/Ďakujeme/.test(sprava),
          `text mailu: ${sprava.slice(0, 80)}`,
        );
        await page.keyboard.press("Escape");
      },
    );

    await t.krok("upomienka: náhľad po česky (neodosiela sa)", async () => {
      await t.rest.patch(`invoices?id=eq.${fa.id}`, { due_date: "2026-01-02" });
      await t.go(`/faktury/${fa.id}`);
      await akciaVMenu(page, "Poslať upomienku");
      const okno = page.getByRole("dialog", { name: /Poslať upomienku/ });
      await okno.waitFor();
      const [, predmet, sprava] = await okno
        .locator("input, textarea")
        .evaluateAll((xs) => xs.map((x) => x.value));
      t.over(/^Upomínka: Faktura /.test(predmet), `predmet „${predmet}“`);
      t.over(
        /Dobrý den/.test(sprava) && /13\s220,00/.test(sprava),
        `text upomienky: ${sprava.slice(0, 120)}`,
      );
      await page.keyboard.press("Escape");
    });
  },
};
