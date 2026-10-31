/*
  Nebezpečné vstupy naostro (QA Česká): HTML/skript v mene odberateľa, položke,
  poznámke, adrese a štítku sa nikde nespustí — v zoznamoch, detailoch ani na
  verejnej stránke ponuky. Hľadanie so znakmi, ktoré PostgREST považuje za
  syntax (`( ) , " * % \`), nezlyhá. Excel a CSV v ZIP-e prijatých faktúr
  nesmú z mena dodávateľa spraviť vzorec.

  Zapisuje sa cez REST do QA firmy a všetko sa po toku zmaže. Nič sa
  neposiela e-mailom.
*/
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { cestaModulu } from "../lib/prostredie.mjs";
import { textPdf } from "../lib/pdf.mjs";

const modul = async (meno) => {
  const m = await import(pathToFileURL(cestaModulu(meno)).href);
  return m.default ?? m;
};

const ID_PONUKY = "f4dfd84e-0a77-49be-a14e-4ec1cf6cde88";

export default {
  popis: "XSS v dokladoch a ponuke, hľadanie so syntaxou PostgREST, vzorce v Exceli/CSV",
  firma: "cz",
  limit: 240000,
  async spusti(t) {
    const firma = t.firmy.cz;
    const z = t.znacka;
    // Keby sa ktorýkoľvek payload spustil, otvorí okno alert → zachytí ho `dialog`.
    const html = `${z} <img src=x onerror=alert(1)> "><script>alert(2)</script><svg onload=alert(3)>`;
    const vzorec = `=HYPERLINK("https://e2e.invalid/${z}","klik")`;
    const spustene = [];
    const zlePoziadavky = [];

    const sleduj = (page) => {
      page.on("dialog", (d) => spustene.push(`${page.url()}: ${d.type()} ${d.message()}`));
      page.on("response", (r) => {
        if (r.url().includes("/rest/v1/") && r.status() >= 400)
          zlePoziadavky.push(`${r.status()} ${decodeURIComponent(r.url()).slice(0, 200)}`);
      });
    };
    sleduj(t.page);
    const page = t.page;

    /* ------------------------------------------------------ údaje cez REST */

    const odberatel = await t.krok("odberateľ s HTML v mene a adrese", async () => {
      const o = await t.rest.vloz("customers", {
        company_id: firma,
        name: html,
        street: html,
        city: `<b>${z}</b>`,
        zip: "11000",
        country: "CZ",
        notes: html,
      });
      t.uprac("odberateľ", () => t.rest.delete(`customers?id=eq.${o.id}`));
      return o;
    });

    const token = randomBytes(24).toString("hex");
    const ponuka = await t.krok("ponuka s HTML v položke a poznámke", async () => {
      const p = await t.rest.vloz("quotes", {
        // Pevné id: PDF ponuky leží v úložisku na `quotes/<id>.pdf` a QA účet ho
        // zmazať nesmie — každý beh tak prepíše ten istý súbor namiesto nového.
        id: ID_PONUKY,
        company_id: firma,
        quote_number: `${z}-P`,
        customer_id: odberatel.id,
        customer_name: html,
        customer_street: html,
        notes: html,
        status: "sent",
        currency: "CZK",
        issue_date: t.dnes,
        valid_until: "2099-12-31",
        approval_token: token,
        subtotal: 100,
        vat_total: 21,
        total: 121,
      });
      t.uprac("ponuka", async () => {
        await t.rest.delete(`quote_items?quote_id=eq.${p.id}`);
        await t.rest.delete(`quotes?id=eq.${p.id}`);
      });
      await t.rest.vloz("quote_items", {
        quote_id: p.id,
        name: html,
        description: html,
        quantity: 1,
        unit: "ks",
        unit_price: 100,
        vat_rate: 21,
        total: 121,
        position: 0,
      });
      // Znaky, ktoré písmo PDF nemá alebo ktoré text otáčajú — generovanie nesmie spadnúť.
      await t.rest.vloz("quote_items", {
        quote_id: p.id,
        name: `Emoji 😀 \u202Eotarvo\u202C zalomenie\u000Bwordu tab\tkoniec & <b>`,
        quantity: 1,
        unit: "ks",
        unit_price: 0,
        vat_rate: 21,
        total: 0,
        position: 1,
      });
      return p;
    });

    const prijata = await t.krok("prijatá faktúra so vzorcom v mene dodávateľa", async () => {
      const p = await t.rest.vloz("purchase_invoices", {
        company_id: firma,
        invoice_number: `${z}-PF`,
        supplier_name: vzorec,
        issue_date: t.dnes,
        due_date: t.dnes,
        amount_without_vat: 100,
        vat_amount: 21,
        amount_total: 121,
        currency: "CZK",
        status: "received",
        note: html,
        stitky: [html],
      });
      t.uprac("prijatá faktúra", () => t.rest.delete(`purchase_invoices?id=eq.${p.id}`));
      return p;
    });

    /* ---------------------------------------------------- v aplikácii */

    const overStranku = async (cesta, ocakavanyText) => {
      await t.go(cesta);
      if (ocakavanyText) {
        await page
          .getByText(ocakavanyText, { exact: false })
          .first()
          .waitFor({ timeout: 20000 })
          .catch(() => {
            throw new Error(`na ${cesta} nie je vidno text „${ocakavanyText}“`);
          });
      }
      await page.waitForTimeout(800);
      const vlozene = await page.evaluate(
        () =>
          document.querySelectorAll('img[src="x"], img[onerror], svg[onload], script:not([src])')
            .length,
      );
      // Inline skripty v hlavičke (téma, súhlas) sú naše — rátajú sa len tie v obsahu.
      const vObsahu = await page.evaluate(
        () =>
          document.querySelectorAll(
            'main img[src="x"], main svg[onload], main script, [role=dialog] script',
          ).length,
      );
      t.over(!vObsahu, `${cesta}: v obsahu stránky je vložená značka z dát (${vlozene})`);
      t.over(!spustene.length, `spustil sa skript z dát: ${spustene.join(" | ")}`);
    };

    await t.krok("zoznam a detail ponuky", async () => {
      await overStranku("/ponuky", `${z}-P`);
      await overStranku(`/ponuky/${ponuka.id}`, `${z}-P`);
      const text = await page.locator("main").innerText();
      t.over(text.includes("<img src=x"), "HTML z dát sa nezobrazilo ako text");
    });

    await t.krok("odberatelia", async () => {
      await overStranku("/odberatelia", z);
    });

    await t.krok("prijaté faktúry", async () => {
      await overStranku("/prijate-faktury", `${z}-PF`);
      await overStranku(`/prijate-faktury/${prijata.id}`, `${z}-PF`);
    });

    await t.krok("verejná stránka ponuky bez prihlásenia", async () => {
      const anon = await t.novaStranka();
      await anon.context().clearCookies();
      await anon.evaluate(() => localStorage.clear()).catch(() => {});
      sleduj(anon);
      await anon.goto(`${t.base}/ponuka/${token}`, { waitUntil: "domcontentloaded" });
      await anon.getByText(`${z}-P`).first().waitFor({ timeout: 20000 });
      await anon.waitForTimeout(800);
      const pocet = await anon.evaluate(
        () => document.querySelectorAll('img[src="x"], svg[onload], body script:not([src])').length,
      );
      const text = await anon.locator("body").innerText();
      t.over(text.includes("<img src=x"), "verejná ponuka nezobrazila HTML ako text");
      t.over(!spustene.length, `spustil sa skript na verejnej ponuke: ${spustene.join(" | ")}`);
      t.log(`verejná ponuka: vložených značiek ${pocet}`);
      t.over(
        !(await anon.locator('img[src="x"], svg[onload]').count()),
        "verejná ponuka vložila značku z dát",
      );
    });

    await t.krok("PDF ponuky: HTML ako text, emoji a riadiace znaky ho nezhodia", async () => {
      await t.go(`/ponuky/${ponuka.id}`);
      // Okno s PDF headless prehliadač neotvorí (stiahne ho) — stačí adresa, ktorú otvára.
      const [poziadavka] = await Promise.all([
        page.context().waitForEvent("request", {
          predicate: (r) => r.url().includes("/storage/v1/object/sign/invoice-pdfs/"),
          timeout: 60000,
        }),
        page
          .getByRole("button", { name: /Vygenerovať PDF/ })
          .first()
          .click(),
      ]);
      const url = poziadavka.url();
      const pdf = Buffer.from(await (await fetch(url)).arrayBuffer());
      t.over(pdf.subarray(0, 5).toString() === "%PDF-", "PDF ponuky sa nestiahlo");
      const text = (await textPdf(pdf)).join("\n");
      t.over(text.includes("<img src=x"), "HTML z položky v PDF chýba (ako text)");
      t.over(text.includes("koniec"), `položka s emoji/riadiacimi znakmi v PDF chýba`);
    });

    /* ------------------------------------------------------ hľadanie */

    await t.krok("hľadanie so syntaxou PostgREST nezlyhá", async () => {
      await t.go("/ponuky");
      const pole = page.getByPlaceholder(/Hľadať/).first();
      await pole.waitFor({ timeout: 20000 });
      for (const h of [
        "a(b",
        "a)b",
        "a,b",
        '"',
        "\\",
        "*",
        "%",
        "_",
        "a.b:c",
        "or=(id.not.is.null)",
      ]) {
        await pole.fill(h);
        await page.waitForTimeout(700);
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      }
      t.over(
        !zlePoziadavky.length,
        `hľadanie vrátilo chybu: ${zlePoziadavky.slice(0, 4).join(" | ")}`,
      );
      // A nájde to, čo má — čiarka a zátvorky sa len ignorujú.
      await pole.fill(z);
      await page.getByText(`${z}-P`).first().waitFor({ timeout: 15000 });
    });

    /* ------------------------------------------------ Excel a CSV */

    await t.krok("Excel prijatých faktúr: meno dodávateľa ostane textom", async () => {
      await t.go("/prijate-faktury");
      await page
        .getByPlaceholder(/Dodávateľ/)
        .first()
        .fill(z);
      await page.getByText(`${z}-PF`).first().waitFor({ timeout: 20000 });
      await page.getByRole("button", { name: "Ďalšie akcie" }).first().click();
      const subor = await t.stiahni(
        () => page.getByRole("menuitem", { name: "Excel", exact: true }).click(),
        "vzorec-excel",
      );
      const XLSX = await modul("xlsx");
      const wb = XLSX.read(readFileSync(subor), { type: "buffer", cellFormula: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const bunky = Object.entries(ws).filter(([k]) => !k.startsWith("!"));
      const sVzorcom = bunky.filter(([, c]) => c.f);
      t.over(
        !sVzorcom.length,
        `Excel obsahuje vzorce: ${sVzorcom.map(([k, c]) => `${k}=${c.f}`).join(", ")}`,
      );
      t.over(
        bunky.some(([, c]) => String(c.v).includes("HYPERLINK")),
        "meno dodávateľa v Exceli chýba",
      );
    });

    await t.krok("ZIP prijatých faktúr: _suhrn.csv bez vzorca", async () => {
      await page.locator("thead input[type=checkbox]").first().check();
      const subor = await t.stiahni(
        () => page.getByRole("button", { name: /Stiahnuť ZIP/ }).click(),
        "vzorec-zip",
      );
      const JSZip = await modul("jszip");
      const zip = await JSZip.loadAsync(readFileSync(subor));
      const csv = (await zip.file("_suhrn.csv")?.async("string")) ?? "";
      const riadok = csv.split("\n").find((r) => r.includes(`${z}-PF`)) ?? "";
      t.over(riadok, "_suhrn.csv nemá testovaciu faktúru");
      const bunky = riadok.split(";").map((b) => b.replace(/^"|"$/g, ""));
      const zla = bunky.filter((b) => /^[=+\-@\t\r]/.test(b) && !/^-?\d+([.,]\d+)?$/.test(b));
      t.over(!zla.length, `_suhrn.csv má bunku, ktorú Excel spustí ako vzorec: ${zla.join(" | ")}`);
    });

    t.over(!spustene.length, `spustil sa skript z dát: ${spustene.join(" | ")}`);
  },
};
