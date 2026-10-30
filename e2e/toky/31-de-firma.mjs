/*
  Nemecká firma celou cestou, v nemeckom rozhraní.

  Tok si v QA účte založí dočasnú firmu „<značka> TEST 30.10 GmbH“ (krajina DE,
  Regelbesteuerung, USt-IdNr.) cez formulár Unternehmensverwaltung a na konci ju
  zmaže celú — aj s dokladmi a súbormi (Löschen → „Endgültig löschen“). Zvyšky
  z prerušeného behu zmaže na začiatku.

  Overuje:
  - Rechnung a náležitosti § 14 Abs. 4 UStG v PDF (Steuernummer/USt-IdNr.,
    Leistungsdatum, sumy po sadzbách 19 % / 7 %, päta GmbH, jednotka „Stk.“),
  - innergemeinschaftliche Lieferung (§ 4 Nr. 1b), služba do EÚ
    (Steuerschuldnerschaft), Ausfuhr (§ 4 Nr. 1a), tuzemské § 13b — pri
    oslobodení 0 %, nie „RC“,
  - kurz BMF (USD, dodanie v septembri 2026 → 1,1513 podľa BMF),
  - XRechnung (UBL 2.1 XSD, CustomizationID 3.0) a ZUGFeRD vložené v PDF (CII XSD),
  - UStVA (Kennzahlen 81/86/41/43/21/60/83) pri Soll aj Ist (polovičná úhrada),
  - ZM CSV pre BZSt (L a S),
  - DATEV Buchungsstapel (EXTF 700/21/13, SKR03 aj SKR04, cudzia mena),
  - Rechnungskorrektur (názov, odkaz na pôvodnú faktúru, UStVA po oprave),
  - Kleinunternehmer § 19 (bez USt., UStVA sa nepodáva, nástenka),
  - rozhranie v nemčine (žiadne slovenské paragrafy v režime DPH, mesiac).

  Kontroly opráv z vetvy vlna/t4-de: kým nie je nasadená, spusti tok s
  E2E_BEZ_OPRAV_T4DE=1 — vtedy sa z nich stanú len upozornenia.
*/
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { textPdf } from "../lib/pdf.mjs";
import { overXsd } from "../lib/xml.mjs";
import { REPO_DIR, HLAVNE_REPO } from "../lib/prostredie.mjs";

const MENO_FIRMY = (znacka) => `${znacka} TEST 30.10 GmbH`;

function schema(...casti) {
  for (const k of [REPO_DIR, HLAVNE_REPO]) {
    const c = path.join(k, "src/lib/faktero/schemy", ...casti);
    if (existsSync(c)) return c;
  }
  throw new Error(`schéma ${casti.join("/")} chýba`);
}

/** ZUGFeRD/Factur-X príloha z PDF (vložený súbor, FlateDecode). */
function prilohaPdf(cesta) {
  const d = readFileSync(cesta);
  const m = /\/Type \/EmbeddedFile[\s\S]*?\/Length (\d+)\s*>>\s*stream\r?\n/.exec(
    d.toString("latin1"),
  );
  if (!m) return null;
  const zac = m.index + m[0].length;
  return inflateSync(d.subarray(zac, zac + Number(m[1]))).toString("utf8");
}

async function zmazFirmu(t, page, f) {
  await t.go("/firmy", page);
  const riadok = page.locator("tr", { hasText: f.name });
  await riadok.getByRole("button", { name: /Löschen/ }).click();
  const dd = page.getByRole("dialog");
  await dd.locator("input").fill(f.name);
  await dd.getByRole("button", { name: /Endgültig löschen/i }).click();
  await t.cakajNa("firma zmazaná", async () => {
    const r = await t.rest.get(`companies?id=eq.${f.id}&select=id`);
    return r.status === 200 && !r.data?.length;
  });
}

async function zalozFirmu(t, page, nazov) {
  // Zvyšky z predošlých behov (spadnutý beh, prerušené upratanie).
  const stare = await t.rest.get(`companies?name=like.E2E-*TEST%2030.10%20GmbH&select=id,name`);
  for (const x of stare.data ?? []) await zmazFirmu(t, page, x);

  await t.go("/firmy");
  await page
    .getByRole("button", { name: /Unternehmen hinzufügen/ })
    .first()
    .click();
  const d = page.getByRole("dialog");
  await d.getByText("Land der Registrierung").waitFor();
  await page.waitForTimeout(500);
  await d.locator("select").last().selectOption("DE");
  await page.waitForTimeout(300);
  const pole = (label, v) =>
    d.locator("label", { hasText: label }).locator("input").first().fill(v);
  await pole("Steuernummer", "143/123/45678");
  await pole("USt-IdNr", "DE811907980");
  await d.getByRole("checkbox").first().check();
  await pole("Straße", "Teststraße 5");
  await pole("Ort", "München");
  await pole("PLZ", "80331");
  await d.locator("input").first().fill(nazov);
  await page.waitForTimeout(1200);
  // Zavrie našepkávač názvu, aby neprekryl tlačidlo.
  await d.getByText("Land der Registrierung").click();
  await Promise.all([
    page.waitForURL(/dashboard/, { timeout: 30000 }),
    d.getByRole("button", { name: "Unternehmen erstellen" }).click(),
  ]);
  const f = (await t.rest.get(`companies?name=eq.${encodeURIComponent(nazov)}&select=*`)).data?.[0];
  t.over(f, "firma sa nezaložila");
  t.uprac("firma", async () => {
    // Keď stránka toku spadla, upratuje sa v novej (aj tá musí byť po nemecky).
    let p = page;
    if (p.isClosed()) {
      p = await t.novaStranka();
      await p.context().addCookies([{ name: "faktero_jazyk", value: "de", url: t.base }]);
    }
    await zmazFirmu(t, p, f);
  });
  return f;
}

async function vystavDe(
  t,
  page,
  {
    odberatel,
    text,
    polozky = [],
    rezim,
    plnenie,
    mena,
    dodanie,
    cesta = "/faktury/nova",
    tlacidlo,
  },
) {
  if (cesta) await t.go(cesta);
  await page.locator("#odberatel-dokladu").waitFor();
  if (odberatel) {
    await page.click("#odberatel-dokladu");
    await page.getByPlaceholder(/Nach Name/).fill(odberatel);
    await page.locator("button", { hasText: odberatel }).first().click({ timeout: 15000 });
  }
  await page.waitForTimeout(800);
  if (mena) await page.locator('select:has(option[value="USD"])').first().selectOption(mena);
  if (dodanie) await page.fill("#datum-dodania", dodanie);
  if (rezim) {
    const rc = page.getByRole("checkbox", { name: /Reverse-Charge/ }).first();
    if (!(await rc.isChecked())) await rc.check();
    await page.locator('select:has(option[value="eu_b2b"])').selectOption(rezim);
  }
  if (plnenie) await page.locator('select:has(option[value="sluzba"])').selectOption(plnenie);
  if (text) await page.getByPlaceholder(/Zum Beispiel: Wir berechnen/).fill(text);
  for (let i = 0; i < polozky.length; i++) {
    let riadky = page.locator('tr:has(input[placeholder="Positionsbezeichnung"])');
    if ((await riadky.count()) <= i) {
      await page
        .getByRole("button", { name: /Position hinzufügen/ })
        .first()
        .click();
      riadky = page.locator('tr:has(input[placeholder="Positionsbezeichnung"])');
    }
    const r = riadky.nth(i);
    const [nazov, mn, cena, dph] = polozky[i];
    await r.locator('input[placeholder="Positionsbezeichnung"]').fill(nazov);
    const cisla = r.locator('input[type="number"]');
    await cisla.nth(0).fill(String(mn));
    await cisla.nth(1).fill(String(cena));
    if (dph !== undefined) await r.locator("select").first().selectOption(String(dph));
  }
  const predtym = page.url();
  await (
    tlacidlo
      ? page.getByRole("button", { name: tlacidlo, exact: true })
      : page.locator("#invoice-submit")
  ).click();
  await page
    .waitForURL((u) => /\/faktury\/[0-9a-f-]{36}$/.test(u.pathname) && u.href !== predtym, {
      timeout: 30000,
    })
    .catch(() => {
      throw new Error(
        `po uložení som neprešiel na detail (${page.url()}) ${t.hlasky.slice(-3).join(" | ")}`,
      );
    });
  const id = page.url().match(/\/faktury\/([0-9a-f-]{36})/)[1];
  return (await t.rest.get(`invoices?id=eq.${id}&select=*`)).data[0];
}

/** PDF otvorenej faktúry ako text (medzery zlúčené). */
async function pdfFaktury(t, page, meno) {
  const b = () => page.getByRole("button", { name: /^(PDF herunterladen|PDF erstellen)$/ }).first();
  await b().waitFor();
  const s = await t.stiahni(() => b().click(), meno);
  return { subor: s, text: (await textPdf(s)).join("\n").replace(/\s+/g, " ") };
}

/** UStVA CSV → { kz: [základ, daň] }. */
function citajUstva(csv) {
  const v = {};
  for (const r of csv.split(/\r?\n/).slice(2)) {
    const [kz, , zaklad, dan] = r.split(";");
    if (kz) v[kz] = [zaklad, dan];
  }
  return v;
}

export default {
  popis:
    "nemecká firma: Rechnung, § 13b/EÚ/Ausfuhr, BMF, XRechnung/ZUGFeRD, UStVA, ZM, DATEV, Kleinunternehmer",
  limit: 420000,
  async spusti(t) {
    const page = t.page;
    await page.context().addCookies([{ name: "faktero_jazyk", value: "de", url: t.base }]);
    const bezOprav = process.env.E2E_BEZ_OPRAV_T4DE === "1";
    /** Kontrola opravy z vetvy vlna/t4-de — pred nasadením len upozornenie. */
    const poOprave = (podmienka, sprava) => {
      if (podmienka) return;
      if (bezOprav) t.upozornenia.push(`(oprava t4-de) ${sprava}`);
      else throw new Error(sprava);
    };
    const blizko = (a, b, s) =>
      t.over(Math.abs(Number(a) - b) < 0.005, `${s}: ${a}, čakal som ${b}`);

    const f = await t.krok("založenie nemeckej firmy cez formulár", async () => {
      const x = await zalozFirmu(t, page, MENO_FIRMY(t.znacka));
      t.over(x.country === "DE", `krajina ${x.country}`);
      t.over(x.vat_scheme === "de_regel", `režim ${x.vat_scheme}`);
      t.over(x.dic === "143/123/45678" && x.ic_dph === "DE811907980", "Steuernummer/USt-IdNr.");
      t.over(x.de_versteuerung === "soll" && x.kurz_de_zdroj === "bmf", "predvolené Soll a BMF");
      const r = await t.rest.patch(`companies?id=eq.${x.id}`, {
        registergericht: "Amtsgericht München",
        handelsregister_nr: "HRB 123456",
        geschaeftsfuehrer: "Max Mustermann",
        email: "efaktura-qa@faktero.sk",
        phone: "+49 89 1234567",
      });
      t.over(r.status < 300, `údaje firmy: ${r.status} ${r.text.slice(0, 200)}`);
      await t.rest.vloz("company_bank_accounts", {
        company_id: x.id,
        iban: "DE89370400440532013000",
        swift: "COBADEFFXXX",
        is_default: true,
        name: "Commerzbank",
      });
      return x;
    });

    const zak = (o) => t.rest.vloz("customers", { company_id: f.id, ...o });
    const kDe = await zak({
      name: `${t.znacka} Kunde GmbH`,
      street: "Hauptstraße 1",
      city: "Berlin",
      zip: "10115",
      country: "DE",
      ic_dph: "DE123456789",
      email: "efaktura-qa+de@faktero.sk",
    });
    const kAt = await zak({
      name: `${t.znacka} Kunde Wien GmbH`,
      street: "Ring 1",
      city: "Wien",
      zip: "1010",
      country: "AT",
      ic_dph: "ATU12345678",
      email: "efaktura-qa+at@faktero.sk",
    });
    const kCh = await zak({
      name: `${t.znacka} Kunde Zürich AG`,
      street: "Bahnhofstr. 1",
      city: "Zürich",
      zip: "8001",
      country: "CH",
    });

    const fa = {};
    fa.tuzemsko = await t.krok("Rechnung 19 % + 7 % a náležitosti § 14 UStG", async () => {
      await t.go("/faktury/nova");
      await page.locator("#odberatel-dokladu").waitFor();
      poOprave(
        !/slowakisch/i.test(await page.locator("main").innerText()),
        "formulár nemeckej firmy hovorí o slovenskej DPH / slovenskom priznaní",
      );
      const x = await vystavDe(t, page, {
        cesta: null,
        odberatel: kDe.name,
        text: "Lieferung laut Auftrag",
        polozky: [
          ["Beratung", 2, 100, 19],
          ["Buch", 3, 10, 7],
        ],
      });
      poOprave(
        !t.hlasky.some((h) => /Firmen-ID|IČO/.test(h)),
        "nemecká firma dostala výzvu doplniť IČO",
      );
      blizko(x.subtotal, 230, "základ");
      blizko(x.vat_total, 40.1, "USt.");
      blizko(x.total, 270.1, "spolu");
      t.over(x.language === "de", `jazyk dokladu ${x.language}`);
      await page.waitForTimeout(1500);
      const detail = await page.locator("main").innerText();
      poOprave(!/DUZP/.test(detail), "v detaile ostala skratka DUZP");
      poOprave(!/XML für Pohoda/.test(detail), "nemecká firma má v detaile XML pre Pohodu");
      const { subor, text } = await pdfFaktury(t, page, "tuzemsko");
      for (const s of [
        "RECHNUNG",
        `Nr. ${x.invoice_number}`,
        "Steuernummer 143/123/45678",
        "DE811907980",
        "DE123456789",
        "RECHNUNGSDATUM",
        "LIEFERDATUM",
        "19 % 200,00 EUR 38,00 EUR",
        "7 % 30,00 EUR 2,10 EUR",
        "270,10 EUR",
        "Amtsgericht München, HRB 123456",
        "Geschäftsführer: Max Mustermann",
        "DE89370400440532013000",
      ])
        t.over(text.includes(s), `v PDF chýba „${s}“`);
      poOprave(/ Stk\. /.test(text) && !/ ks /.test(text), "jednotka v nemeckom PDF nie je „Stk.“");
      const zf = prilohaPdf(subor);
      t.over(zf && zf.includes("CrossIndustryInvoice"), "PDF nemá vloženú ZUGFeRD faktúru");
      const chyba = await overXsd(
        Buffer.from(zf),
        schema("cii-d16b", "CrossIndustryInvoice_100pD16B.xsd"),
      );
      t.over(!chyba, `ZUGFeRD neprešlo CII XSD: ${chyba}`);
      t.over(zf.includes("GrandTotalAmount>270.10<"), "ZUGFeRD má inú sumu než PDF");
      return x;
    });

    await t.krok("XRechnung (UBL 2.1, XRechnung 3.0)", async () => {
      await page.getByRole("button", { name: "Weitere Aktionen" }).first().click();
      const s = await t.stiahni(
        () =>
          page
            .getByRole("menuitem", { name: /XRechnung/ })
            .first()
            .click(),
        "xrechnung",
      );
      await page.keyboard.press("Escape").catch(() => {});
      const xml = readFileSync(s);
      t.over(xml.toString().includes("xrechnung_3.0"), "XRechnung nemá CustomizationID 3.0");
      const chyba = await overXsd(xml, schema("ubl-2.1", "maindoc", "UBL-Invoice-2.1.xsd"));
      t.over(!chyba, `XRechnung neprešla UBL XSD: ${chyba}`);
    });

    fa.euTovar = await t.krok("innergemeinschaftliche Lieferung", async () => {
      const x = await vystavDe(t, page, {
        odberatel: kAt.name,
        text: "Warenlieferung",
        rezim: "eu_b2b",
        plnenie: "tovar",
        polozky: [["Ware", 1, 1000.6]],
      });
      t.over(x.reverse_charge_type === "eu_b2b" && x.eu_plnenie === "tovar", "režim dodania");
      blizko(x.vat_total, 0, "USt.");
      const { text } = await pdfFaktury(t, page, "eu-tovar");
      t.over(text.includes("§ 4 Nr. 1b UStG"), "v PDF chýba § 4 Nr. 1b UStG");
      t.over(
        text.includes("ATU12345678") && text.includes("DE811907980"),
        "v PDF chýbajú obe USt-IdNr.",
      );
      poOprave(
        !/Reverse-Charge|\bRC\b/.test(text),
        "oslobodené dodanie do EÚ je v PDF ako Reverse-Charge",
      );
      return x;
    });

    fa.euSluzba = await t.krok("služba do EÚ (Steuerschuldnerschaft)", async () => {
      const x = await vystavDe(t, page, {
        odberatel: kAt.name,
        text: "Beratungsleistung",
        rezim: "eu_b2b",
        plnenie: "sluzba",
        polozky: [["Beratung", 1, 500]],
      });
      const { text } = await pdfFaktury(t, page, "eu-sluzba");
      t.over(
        text.includes("Steuerschuldnerschaft des Leistungsempfängers"),
        "chýba veta o Steuerschuldnerschaft",
      );
      return x;
    });

    fa.vyvoz = await t.krok("Ausfuhr do Švajčiarska", async () => {
      const x = await vystavDe(t, page, {
        odberatel: kCh.name,
        text: "Ausfuhr",
        rezim: "export",
        plnenie: "tovar",
        polozky: [["Maschine", 1, 2000]],
      });
      const { text } = await pdfFaktury(t, page, "vyvoz");
      t.over(text.includes("§ 4 Nr. 1a UStG"), "v PDF chýba § 4 Nr. 1a UStG");
      poOprave(!/Reverse-Charge|\bRC\b/.test(text), "vývoz je v PDF ako Reverse-Charge");
      return x;
    });

    fa.rc13b = await t.krok("tuzemské § 13b", async () => {
      const x = await vystavDe(t, page, {
        odberatel: kDe.name,
        text: "Bauleistung",
        rezim: "domestic_69",
        polozky: [["Bauleistung", 1, 3000]],
      });
      const { text } = await pdfFaktury(t, page, "13b");
      t.over(/§ ?13b UStG/.test(text), "v PDF chýba § 13b UStG");
      return x;
    });

    await t.krok("kurz BMF pri faktúre v USD", async () => {
      const pred = t.hlasky.length;
      const x = await vystavDe(t, page, {
        odberatel: kDe.name,
        text: "Lizenz USD",
        mena: "USD",
        dodanie: "2026-09-15",
        polozky: [["Lizenz", 1, 1151.3, 19]],
      });
      // BMF Umsatzsteuer-Umrechnungskurs USD 09/2026 = 1,1513 (Datenportal BMF).
      t.over(x.exchange_rate_source === "bmf", `zdroj kurzu ${x.exchange_rate_source}`);
      blizko(x.exchange_rate, 1.1513, "kurz");
      blizko(x.subtotal_eur, 1000, "základ v EUR");
      blizko(x.vat_total_eur, 190, "USt. v EUR");
      await page.waitForTimeout(800);
      poOprave(
        !t.hlasky.slice(pred).some((h) => /§ 73|uplynulo/.test(h)),
        "nemecká firma dostala slovenské upozornenie o 15-dňovej lehote (§ 73)",
      );
      fa.usd = x;
    });

    // UStVA a ZM za mesiac vystavenia
    const mesiac = new Date().toLocaleString("de-DE", {
      month: "long",
      timeZone: "Europe/Berlin",
    });
    const ustva = async (meno) => {
      await t.go("/uctovnictvo/vykazy");
      await page.getByText("UStVA-Übersicht").first().waitFor({ timeout: 30000 });
      await page
        .locator(`select:has(option:text("${mesiac}"))`)
        .first()
        .selectOption({ label: mesiac });
      await page.waitForTimeout(2500);
      const s = await t.stiahni(
        () => page.getByRole("button", { name: /^CSV$/ }).first().click(),
        meno,
      );
      return citajUstva(readFileSync(s, "utf8"));
    };
    await t.krok("UStVA pri Soll-Versteuerung", async () => {
      const u = await ustva("ustva-soll");
      const cak = {
        81: ["200,00", "38,00"],
        86: ["30,00", "2,10"],
        41: ["1000,00", ""],
        43: ["2000,00", ""],
        21: ["500,00", ""],
        60: ["3000,00", ""],
        83: ["", "40,10"],
      };
      for (const [kz, [z, d]] of Object.entries(cak))
        t.over(u[kz]?.[0] === z && u[kz]?.[1] === d, `KZ ${kz}: ${u[kz]}, čakal som ${z}/${d}`);
      t.over(Object.keys(u).length === 7, `v UStVA sú riadky navyše: ${Object.keys(u)}`);
    });

    await t.krok("ZM CSV pre BZSt", async () => {
      await page
        .locator(`select:has(option:text("${mesiac}"))`)
        .nth(1)
        .selectOption({ label: mesiac });
      await page.getByText(/Sonstige Leistungen monatlich melden/).click();
      await page.waitForTimeout(2000);
      const s = await t.stiahni(
        () => page.getByRole("button", { name: /CSV für das BZSt/ }).click(),
        "zm",
      );
      const riadky = readFileSync(s, "latin1").trim().split(/\r\n/);
      t.over(riadky[0] === "#v1.0", `hlavička ZM ${riadky[0]}`);
      t.over(riadky.includes("AT,U12345678,1000,L"), `ZM bez riadku L: ${riadky.join(" | ")}`);
      t.over(riadky.includes("AT,U12345678,500,S"), `ZM bez riadku S: ${riadky.join(" | ")}`);
      t.over(riadky.length === 4, `ZM má ${riadky.length} riadkov`);
    });

    await t.krok("UStVA pri Ist-Versteuerung (polovičná úhrada)", async () => {
      await t.rest.patch(`companies?id=eq.${f.id}`, { de_versteuerung: "ist" });
      await t.rest.vloz("payments", {
        company_id: f.id,
        invoice_id: fa.tuzemsko.id,
        amount: 135.05,
        paid_at: t.dnes,
      });
      const u = await ustva("ustva-ist");
      t.over(u["81"]?.join("/") === "100,00/19,00", `Ist KZ 81: ${u["81"]}`);
      t.over(u["86"]?.join("/") === "15,00/1,05", `Ist KZ 86: ${u["86"]}`);
      t.over(u["41"]?.[0] === "1000,00", `Ist KZ 41 (podľa dodania): ${u["41"]}`);
      t.over(u["83"]?.[1] === "20,05", `Ist KZ 83: ${u["83"]}`);
      await t.rest.patch(`companies?id=eq.${f.id}`, { de_versteuerung: "soll" });
    });

    const datev = async (osnova) => {
      await t.rest.patch(`companies?id=eq.${f.id}`, {
        uctovanie_nastavenia: {
          datev: { beraternummer: "29098", mandantennummer: "55003", osnova },
        },
      });
      await t.go("/exporty");
      await page.getByRole("button", { name: "Ausgangsrechnungen", exact: true }).first().click();
      // Zoznam sa načíta až po výbere agendy — bez riadkov „Alle auswählen“ nič nevyberie.
      await page
        .locator("tr", { hasText: fa.usd.invoice_number })
        .first()
        .waitFor({ timeout: 20000 });
      // Zoznam sa po načítaní programu načíta ešte raz a výber zahodí — preto znova, kým neostane.
      await t.cakajNa("výber dokladov na export", async () => {
        const vsetko = page.getByRole("checkbox", { name: "Alle auswählen" }).first();
        await vsetko.check({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(700);
        return vsetko.isChecked().catch(() => false);
      });
      const oz = page.getByRole("checkbox", { name: /Als übergeben markieren/ }).first();
      if (await oz.isChecked().catch(() => false)) await oz.uncheck();
      const s = await t.stiahni(
        () =>
          page
            .getByRole("button", { name: /^Für DATEV.*herunterladen/ })
            .first()
            .click(),
        `datev-${osnova}`,
      );
      t.over(path.basename(s).includes("EXTF_"), `názov súboru ${path.basename(s)}`);
      return readFileSync(s, "latin1").split("\r\n").filter(Boolean);
    };
    await t.krok("DATEV Buchungsstapel SKR03", async () => {
      const r = await datev("SKR03");
      const h = r[0].split(";");
      t.over(
        h[0] === '"EXTF"' && h[1] === "700" && h[2] === "21" && h[4] === "13",
        `hlavička ${h.slice(0, 5)}`,
      );
      t.over(
        h[10] === "29098" && h[11] === "55003" && h[26] === '"03"',
        `Berater/Mandant/SKR ${h[10]} ${h[11]} ${h[26]}`,
      );
      t.over(r[1].split(";").length === 125, `stĺpcov ${r[1].split(";").length}`);
      const zap = r.slice(2).map((x) => x.split(";"));
      const ucty = zap.map((z) => `${z[0]}|${z[6]}|${z[7]}`);
      for (const c of [
        "238,00|10000|8400",
        "32,10|10000|8300",
        "1000,60|10000|8125",
        "500,00|10000|8336",
        "2000,00|10000|8120",
        "3000,00|10000|8337",
      ])
        t.over(ucty.includes(c), `DATEV SKR03 bez zápisu ${c}: ${ucty.join(" ")}`);
      const usd = zap.find((z) => z[2] === '"USD"');
      t.over(usd && usd[3] === "1,151300" && usd[4] === "1190,00", `USD zápis ${usd?.slice(0, 7)}`);
    });
    await t.krok("DATEV Buchungsstapel SKR04", async () => {
      const r = await datev("SKR04");
      t.over(r[0].split(";")[26] === '"04"', "hlavička nie je SKR04");
      const gk = r.slice(2).map((x) => x.split(";")[7]);
      for (const u of ["4400", "4300", "4125", "4336", "4120", "4337"])
        t.over(gk.includes(u), `SKR04 bez účtu ${u}: ${gk.join(" ")}`);
      poOprave(
        !/október|september|november/.test(await page.locator("main").innerText()),
        "na stránke exportov je slovenský názov mesiaca",
      );
    });

    await t.krok("Rechnungskorrektur", async () => {
      await t.go(`/faktury/${fa.tuzemsko.id}`);
      await page.getByRole("button", { name: "Weitere Aktionen" }).first().click();
      await page
        .getByRole("menuitem", { name: "Rechnungskorrektur ausstellen", exact: true })
        .first()
        .click();
      await page.waitForURL(/\/faktury\/nova/);
      await page.waitForTimeout(1500);
      const x = await vystavDe(t, page, {
        cesta: null,
        tlacidlo: "Rechnungskorrektur ausstellen",
      });
      t.over(x.type === "credit_note", `typ ${x.type}`);
      blizko(x.total, -270.1, "suma opravy");
      const { text } = await pdfFaktury(t, page, "korektura");
      t.over(text.includes("RECHNUNGSKORREKTUR"), "PDF nie je Rechnungskorrektur");
      t.over(
        text.includes(`Berichtigt Rechnung Nr. ${fa.tuzemsko.invoice_number}`),
        "chýba odkaz na pôvodnú faktúru",
      );
      t.over(!/GUTSCHRIFT/.test(text), "nemecká firma má v PDF Gutschrift");
      poOprave(!/Dobropis k faktúre/.test(text), "úvod Rechnungskorrektur je po slovensky");
      const u = await ustva("ustva-korektura");
      t.over(
        u["81"]?.[0] === "0,00" && u["86"]?.[0] === "0,00",
        `po oprave KZ 81/86: ${u["81"]} ${u["86"]}`,
      );
      t.over(u["83"]?.[1] === "0,00", `po oprave KZ 83: ${u["83"]}`);
    });

    await t.krok("Kleinunternehmer § 19", async () => {
      const r = await t.rest.patch(`companies?id=eq.${f.id}`, {
        vat_scheme: "de_kleinunternehmer",
        vat_payer: false,
      });
      t.over(r.status < 300, `prepnutie na KU: ${r.status}`);
      // Zmena prišla „z iného zariadenia“ — formulár ju musí zistiť sám.
      const x = await vystavDe(t, page, {
        odberatel: kDe.name,
        text: "Leistung KU",
        polozky: [["Leistung", 1, 500]],
      });
      poOprave(Number(x.vat_total) === 0, `faktúra Kleinunternehmera má USt. ${x.vat_total}`);
      const { text } = await pdfFaktury(t, page, "ku");
      poOprave(text.includes("§ 19 UStG"), "v PDF Kleinunternehmera chýba § 19 UStG");
      await t.go("/uctovnictvo/vykazy");
      await page
        .getByText(/Kleinunternehmer geben keine UStVA ab/)
        .first()
        .waitFor({ timeout: 30000 });
      await t.go("/dashboard");
      await page
        .getByText(/umsatzsteuerpflichtig\./)
        .first()
        .waitFor({ timeout: 30000 });
      poOprave(
        await page.getByText("Sie sind nicht umsatzsteuerpflichtig.").first().isVisible(),
        "nástenka Kleinunternehmera tvrdí, že je platiteľ (podľa USt-IdNr.)",
      );
    });
  },
};
