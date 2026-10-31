/*
  Česká firma (QA Česká, CZK): výkazy k DPH a exporty pre české programy.

  Doklady sa zapíšu cez REST do aktuálneho mesiaca — všetky druhy, ktoré
  výkazy rozlišujú (A.1 prenesenie § 92a, A.2 služba z EÚ, A.4 plátca aj
  neplátca nad 10 000 Kč, A.5 dobropis a doklad k platbe, B.1, B.2, B.3
  s bločkom, prijatá s členením PN mimo výkazov, dodanie do EÚ v eurách, vývoz). Výkazy (DPHDP3, DPHKH1, DPHSHV)
  sa stiahnu z /uctovnictvo/vykazy pred zápisom a po ňom: XML musí prejsť
  schémami MOJE daně a rozdiel súm musí sedieť s dokladmi (priznanie na celé
  koruny ±1, kontrolné hlásenie na halier). Potom exporty vystavených dokladov
  do Pohody (bez classificationKVDPH), Money S3 a ISDOC proti XSD, ABRA Flexi
  ako dobre utvorené XML. Nič sa neoznačí ako podané ani odovzdané; všetko sa
  na konci zmaže.
*/
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cestaModulu } from "../lib/prostredie.mjs";
import { overXsd, SCHEMY, textXml } from "../lib/xml.mjs";
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";
import { zmazPrijatu } from "../lib/zauctovanie.mjs";

const r2 = (n) => Math.round(n * 100) / 100;
const KURZ_EUR = 25; // CZK za 1 € — pevný, aby sa sumy dali spočítať vopred

/** Vety podania: [{ veta: "VetaA4", a: { dic_odb: "…", … } }]. */
function vety(xml) {
  return [...String(xml).matchAll(/<(Veta\w+)\s([^>]*?)\/>/g)].map((m) => ({
    veta: m[1],
    a: Object.fromEntries([...m[2].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]])),
  }));
}
/** Atribúty všetkých viet daného mena zlúčené (DPHDP3: Veta1…Veta6, KH: VetaA5, VetaC…). */
function polia(xml, ...mena) {
  const o = {};
  for (const v of vety(xml)) if (!mena.length || mena.includes(v.veta)) Object.assign(o, v.a);
  return o;
}
const cislo = (v) => Number(v ?? 0) || 0;

export default {
  popis: "CZ: výkazy DPHDP3/DPHKH1/DPHSHV pred a po dokladoch + exporty Pohoda/Money/ISDOC/Flexi",
  limit: 300000,
  firma: "cz",
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.cz;
    const [rok, mesiac] = t.dnes.split("-").map(Number);

    /* ------------------------------------------------ výkazy z obrazovky */
    async function stiahniVykazy(nazov) {
      await t.go("/uctovnictvo/vykazy");
      const main = page.locator("main");
      // Slovenské rozhranie po slovensky (od vlny 31. 10.), české po česky.
      await main
        .getByText(/^(Priznanie k DPH|Přiznání k DPH)$/)
        .first()
        .waitFor({ timeout: 30000 });
      await main.locator('input[type="number"]').first().fill(String(rok));
      const vyber = main.locator("select");
      await vyber.nth(0).selectOption("mesiac");
      if ((await vyber.nth(1).inputValue()) !== String(mesiac)) {
        const odpoved = page.waitForResponse(
          (r) => r.url().includes("_serverFn") && r.request().method() === "POST",
          { timeout: 30000 },
        );
        await vyber.nth(1).selectOption(String(mesiac));
        await odpoved;
      }
      // Hlavička podania: kód FÚ je povinný, kód predmetu plnenia pre A.1/B.1.
      await main.getByPlaceholder(/451/).fill("451");
      const kod = main.locator("select").filter({ has: page.locator('option[value="4a"]') });
      if ((await kod.inputValue()) !== "4") {
        const odpoved = page.waitForResponse(
          (r) => r.url().includes("_serverFn") && r.request().method() === "POST",
          { timeout: 30000 },
        );
        await kod.selectOption("4");
        await odpoved;
      }
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await main
        .getByText(/Kontrolné hlásenie —|Kontrolní hlášení —/)
        .first()
        .waitFor({ timeout: 30000 });
      const xml = main.getByRole("button", { name: /^XML$/ });
      const von = {};
      for (let i = 0; i < (await xml.count()); i++) {
        const b = xml.nth(i);
        if (!(await b.isVisible().catch(() => false))) continue;
        const subor = await t.stiahni(() => b.click(), `${nazov}${i + 1}`);
        const meno = path.basename(subor);
        const druh = /dphdp3/.test(meno)
          ? "dp3"
          : /dphkh1/.test(meno)
            ? "kh"
            : /dphshv/.test(meno)
              ? "shv"
              : null;
        if (druh) von[druh] = readFileSync(subor, "utf8");
      }
      t.over(von.dp3 && von.kh, `stiahli sa len ${Object.keys(von).join(", ")}`);
      return von;
    }

    const pred = await t.krok("výkazy pred zápisom dokladov", () => stiahniVykazy("pred"));

    /* ------------------------------------------------------- príprava */
    const odberatel = async (x) => {
      const o = await t.rest.vloz("customers", { company_id: firma, ...x });
      t.uprac(`kontakt ${x.name}`, async () => {
        const r = await t.rest.delete(`customers?id=eq.${o.id}`);
        if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
      });
      return o;
    };
    const faktura = async (o, hlavicka, polozky) => {
      const c = await t.rest.rpc("faktero_next_invoice_number", {
        _company_id: firma,
        _issue_date: t.dnes,
        _type: hlavicka.type ?? "regular",
        _series_id: null,
      });
      t.over(c.status === 200, `číslo dokladu: ${c.status} ${c.text.slice(0, 160)}`);
      const riadky = polozky.map(([nazov, zaklad, sadzba], i) => ({
        name: `${t.znacka} ${nazov}`,
        quantity: zaklad < 0 ? -1 : 1,
        unit: "ks",
        unit_price: Math.abs(zaklad),
        vat_rate: sadzba,
        subtotal: zaklad,
        vat_amount: r2((zaklad * sadzba) / 100),
        total: r2(zaklad + (zaklad * sadzba) / 100),
        position: i,
      }));
      const subtotal = r2(riadky.reduce((a, r) => a + r.subtotal, 0));
      const vat_total = r2(riadky.reduce((a, r) => a + r.vat_amount, 0));
      const mena = hlavicka.currency ?? "CZK";
      const f = await t.rest.vloz("invoices", {
        company_id: firma,
        customer_id: o.id,
        type: "regular",
        status: "issued",
        invoice_number: c.data.invoice_number,
        sequence_number: c.data.sequence_number,
        number_series_id: c.data.series_id,
        issue_date: t.dnes,
        delivery_date: t.dnes,
        due_date: t.dnes,
        currency: mena,
        language: "cs",
        payment_method: "bank_transfer",
        customer_name: o.name,
        customer_street: o.street,
        customer_city: o.city,
        customer_zip: o.zip,
        customer_country: o.country,
        customer_ico: o.ico ?? null,
        customer_dic: o.dic ?? null,
        customer_ic_dph: o.ic_dph ?? null,
        intro_note: `${t.znacka} výkazy CZ`,
        subtotal,
        vat_total,
        total: r2(subtotal + vat_total),
        ...(mena !== "CZK"
          ? {
              exchange_rate: KURZ_EUR,
              exchange_rate_date: t.dnes,
              exchange_rate_source: "cnb",
              subtotal_eur: r2(subtotal * KURZ_EUR),
              vat_total_eur: r2(vat_total * KURZ_EUR),
              total_eur: r2((subtotal + vat_total) * KURZ_EUR),
            }
          : {}),
        ...hlavicka,
      });
      t.uprac(`doklad ${f.invoice_number}`, () => zmazFakturuNatvrdo(t, f.id));
      const p = await t.rest.post(
        "invoice_items",
        riadky.map((r) => ({ ...r, invoice_id: f.id })),
      );
      t.over(p.status < 300, `položky ${f.invoice_number}: ${p.status} ${p.text.slice(0, 200)}`);
      return f;
    };
    const prijata = async (x) => {
      const p = await t.rest.vloz("purchase_invoices", {
        company_id: firma,
        supplier_iban: "CZ6508000000192000145399",
        variable_symbol: String(Date.now()).slice(-9),
        issue_date: t.dnes,
        delivery_date: t.dnes,
        due_date: t.dnes,
        currency: "CZK",
        payment_method: "prevod",
        status: "received",
        type: "regular",
        // Autopilot ich nemá zaúčtovať ani pýtať návrh od AI.
        auto_uctovanie_at: new Date().toISOString(),
        ...x,
        amount_total: r2(x.amount_without_vat + x.vat_amount),
      });
      t.uprac(`prijatá ${x.invoice_number}`, () => zmazPrijatu(t, p.id));
      return p;
    };

    const d = await t.krok("príprava: odberatelia a doklady cez REST", async () => {
      const platca = await odberatel({
        name: `${t.znacka} Plátce s.r.o.`,
        street: "Vodičkova 12",
        city: "Praha",
        zip: "11000",
        country: "CZ",
        ico: "27082440",
        dic: "CZ27082440",
        ic_dph: "CZ27082440",
      });
      // Neplátca: ARES mu dá DIČ, nie IČ DPH — v KH ide nad hranicou tiež do A.4.
      const neplatca = await odberatel({
        name: `${t.znacka} Neplátce s.r.o.`,
        street: "Dlouhá 1",
        city: "Brno",
        zip: "60200",
        country: "CZ",
        ico: "12345679",
        dic: "CZ12345679",
      });
      const de = await odberatel({
        name: `${t.znacka} Kunde GmbH`,
        street: "Teststraße 1",
        city: "Berlin",
        zip: "10115",
        country: "DE",
        ic_dph: "DE123456789",
      });
      const us = await odberatel({
        name: `${t.znacka} Customer Inc`,
        street: "1 Main St",
        city: "New York",
        zip: "10001",
        country: "US",
      });
      const v = {};
      v.a4 = await faktura(platca, {}, [
        ["služba", 10000, 21],
        ["kniha", 1000, 12],
      ]);
      v.a4n = await faktura(neplatca, {}, [["služba", 9000, 21]]);
      v.pdp = await faktura(platca, { reverse_charge: true, reverse_charge_type: "domestic_69" }, [
        ["montáž", 20000, 0],
      ]);
      v.euSl = await faktura(
        de,
        { reverse_charge: true, reverse_charge_type: "eu_b2b", eu_plnenie: "sluzba" },
        [["Beratung", 3000, 0]],
      );
      v.euTov = await faktura(
        de,
        {
          reverse_charge: true,
          reverse_charge_type: "eu_b2b",
          eu_plnenie: "tovar",
          currency: "EUR",
        },
        [["Ware", 400, 0]],
      );
      v.vyvoz = await faktura(
        us,
        { reverse_charge: true, reverse_charge_type: "export", eu_plnenie: "tovar" },
        [["zboží", 3000, 0]],
      );
      v.dobropis = await faktura(platca, { type: "credit_note", opravuje_fakturu_id: v.a4.id }, [
        ["vrácení", -2000, 21],
      ]);
      v.zf = await faktura(platca, { type: "proforma", status: "paid", paid_at: t.dnes }, [
        ["záloha", 5000, 21],
      ]);
      v.ddp = await faktura(
        platca,
        { type: "advance_payment", status: "paid", paid_at: t.dnes, advance_invoice_id: v.zf.id },
        [["záloha", 5000, 21]],
      );

      const p = {};
      p.b2 = await prijata({
        supplier_name: `${t.znacka} Dodavatel s.r.o.`,
        supplier_ico: "27082440",
        supplier_dic: "CZ27082440",
        supplier_ic_dph: "CZ27082440",
        invoice_number: `${t.znacka}-B2`,
        amount_without_vat: 20000,
        vat_amount: 4200,
      });
      p.b3 = await prijata({
        supplier_name: `${t.znacka} Knihy s.r.o.`,
        supplier_ico: "27082440",
        supplier_ic_dph: "CZ27082440",
        invoice_number: `${t.znacka}-B3`,
        amount_without_vat: 1000,
        vat_amount: 120,
      });
      p.b1 = await prijata({
        supplier_name: `${t.znacka} Stavby s.r.o.`,
        supplier_ico: "27082440",
        supplier_ic_dph: "CZ27082440",
        invoice_number: `${t.znacka}-B1`,
        amount_without_vat: 5000,
        vat_amount: 0,
        dph_rezim: "samozdanenie",
      });
      // Členenie „nezahrnovať do priznania“ (PN): do odpočtu ani do B.2 nepatrí.
      p.pn = await prijata({
        supplier_name: `${t.znacka} Nezahrnovat s.r.o.`,
        supplier_ico: "27082440",
        supplier_ic_dph: "CZ27082440",
        invoice_number: `${t.znacka}-PN`,
        amount_without_vat: 15000,
        vat_amount: 3150,
        pohoda_clenenie_dph: "PN",
      });
      p.a2 = await prijata({
        supplier_name: `${t.znacka} Software GmbH`,
        supplier_ic_dph: "DE987654321",
        invoice_number: `${t.znacka}-A2`,
        amount_without_vat: 2000,
        vat_amount: 0,
      });
      const b = await t.rest.vloz("expense_documents", {
        company_id: firma,
        status: "processed",
        source: "web",
        auto_uctovanie_at: new Date().toISOString(),
        supplier_name: `${t.znacka} Obchod s.r.o.`,
        supplier_ic_dph: "CZ27082440",
        document_number: `${t.znacka}-BL`,
        issue_date: t.dnes,
        net_amount: 500,
        vat_amount: 105,
        total_amount: 605,
        vat_rate: 21,
        currency: "CZK",
        payment_method: "karta",
      });
      t.uprac("bloček", async () => {
        const r = await t.rest.delete(`expense_documents?id=eq.${b.id}`);
        if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
      });
      return { v, p };
    });

    const po = await t.krok("výkazy po zápise dokladov", () => stiahniVykazy("po"));

    await t.krok("XML výkazov proti schémam MOJE daně", async () => {
      for (const [druh, schema] of [
        ["dp3", SCHEMY.czDp3],
        ["kh", SCHEMY.czKh1],
        ["shv", SCHEMY.czShv],
      ]) {
        t.over(po[druh], `po zápise chýba ${druh}`);
        const chyba = await overXsd(po[druh], schema);
        t.over(!chyba, `${druh} neprešlo schémou: ${chyba}`);
      }
      const firmaR = (await t.rest.get(`companies?id=eq.${firma}&select=dic`)).data?.[0];
      t.over(
        po.dp3.includes(`dic="${String(firmaR?.dic ?? "").replace(/\D/g, "")}"`),
        "v priznaní chýba DIČ firmy",
      );
      t.over(
        new RegExp(`mesic="${mesiac}"`).test(po.dp3) && po.dp3.includes(`rok="${rok}"`),
        "priznanie nie je za aktuálny mesiac",
      );
    });

    await t.krok("DPHDP3: rozdiel riadkov sedí s dokladmi (±1 Kč)", async () => {
      const a = polia(pred.dp3, "Veta1", "Veta2", "Veta3", "Veta4", "Veta6");
      const b = polia(po.dp3, "Veta1", "Veta2", "Veta3", "Veta4", "Veta6");
      const ocakavane = {
        // A.4 + A.4 neplátca + dobropis + doklad k platbe
        obrat23: 10000 + 9000 - 2000 + 5000,
        dan23: 2100 + 1890 - 420 + 1050,
        obrat5: 1000,
        dan5: 120,
        pln_rez_pren: 20000,
        pln_sluzby: 3000,
        dod_zb: 400 * KURZ_EUR,
        pln_vyvoz: 3000,
        rez_pren23: 5000,
        dan_rpren23: 1050,
        p_sl23_e: 2000,
        dan_psl23_e: 420,
        pln23: 20000 + 500,
        odp_tuz23_nar: 4200 + 105,
        pln5: 1000,
        odp_tuz5_nar: 120,
        nar_zdp23: 5000 + 2000,
        od_zdp23: 1050 + 420,
      };
      const chyby = [];
      for (const [k, v] of Object.entries(ocakavane)) {
        const rozdiel = cislo(b[k]) - cislo(a[k]);
        if (Math.abs(rozdiel - v) > 1) chyby.push(`${k}: +${rozdiel}, čakal som +${v}`);
      }
      const dan = 2100 + 1890 - 420 + 1050 + 120 + 1050 + 420;
      const odp = 4200 + 105 + 120 + 1050 + 420;
      const vlastna = (x) => cislo(x.dano_da) - cislo(x.dano_no);
      if (Math.abs(cislo(b.dan_zocelk) - cislo(a.dan_zocelk) - dan) > 2)
        chyby.push(`dan_zocelk +${cislo(b.dan_zocelk) - cislo(a.dan_zocelk)}, čakal som +${dan}`);
      if (Math.abs(cislo(b.odp_zocelk) - cislo(a.odp_zocelk) - odp) > 2)
        chyby.push(`odp_zocelk +${cislo(b.odp_zocelk) - cislo(a.odp_zocelk)}, čakal som +${odp}`);
      if (Math.abs(vlastna(b) - vlastna(a) - (dan - odp)) > 3)
        chyby.push(`vlastná povinnosť +${vlastna(b) - vlastna(a)}, čakal som +${dan - odp}`);
      t.over(!chyby.length, chyby.join("; "));
    });

    await t.krok("DPHKH1: riadky dokladov a súhrny na halier", async () => {
      const { v, p } = d;
      const riadok = (veta, doklad) =>
        vety(po.kh).find((x) => x.veta === veta && x.a.c_evid_dd === doklad)?.a;
      const chyby = [];
      const over = (popis, a, ocak) => {
        if (!a) return chyby.push(`${popis}: riadok chýba`);
        for (const [k, x] of Object.entries(ocak))
          if (String(a[k]) !== String(x)) chyby.push(`${popis}.${k} = ${a[k]}, čakal som ${x}`);
      };
      over("A.4 plátca", riadok("VetaA4", v.a4.invoice_number), {
        dic_odb: "27082440",
        zakl_dane1: "10000.00",
        dan1: "2100.00",
        zakl_dane2: "1000.00",
        dan2: "120.00",
      });
      over("A.4 neplátca", riadok("VetaA4", v.a4n.invoice_number), {
        dic_odb: "12345679",
        zakl_dane1: "9000.00",
        dan1: "1890.00",
      });
      over("A.1", riadok("VetaA1", v.pdp.invoice_number), {
        dic_odb: "27082440",
        zakl_dane1: "20000.00",
        kod_pred_pl: "4",
      });
      over("B.2", riadok("VetaB2", p.b2.invoice_number), {
        dic_dod: "27082440",
        zakl_dane1: "20000.00",
        dan1: "4200.00",
        pomer: "N",
      });
      over("B.1", riadok("VetaB1", p.b1.invoice_number), {
        dic_dod: "27082440",
        zakl_dane1: "5000.00",
        dan1: "1050.00",
      });
      over("A.2", riadok("VetaA2", p.a2.invoice_number), {
        k_stat: "DE",
        vatid_dod: "987654321",
        zakl_dane1: "2000.00",
        dan1: "420.00",
      });
      // Pod hranicou, dobropis (|2 420| < 10 000) a doklad k platbe 6 050 Kč idú súhrnne.
      for (const [veta, popis, ocak] of [
        ["VetaA5", "A.5", { zakl_dane1: -2000 + 5000, dan1: -420 + 1050 }],
        ["VetaB3", "B.3", { zakl_dane1: 500, dan1: 105, zakl_dane2: 1000, dan2: 120 }],
      ]) {
        const a = polia(pred.kh, veta);
        const b = polia(po.kh, veta);
        for (const [k, x] of Object.entries(ocak))
          if (Math.abs(r2(cislo(b[k]) - cislo(a[k])) - x) > 0.001)
            chyby.push(`${popis}.${k} +${r2(cislo(b[k]) - cislo(a[k]))}, čakal som +${x}`);
      }
      for (const cislo_ of [
        v.dobropis.invoice_number,
        v.ddp.invoice_number,
        v.euSl.invoice_number,
        p.pn.invoice_number,
      ])
        if (vety(po.kh).some((x) => x.a.c_evid_dd === cislo_))
          chyby.push(`${cislo_} nemá mať v KH vlastný riadok`);
      // Kontrolné riadky C = súčty oddielov A a B.
      const cA = polia(pred.kh, "VetaC");
      const cB = polia(po.kh, "VetaC");
      for (const [k, x] of Object.entries({
        obrat23: 10000 + 9000 - 2000 + 5000,
        obrat5: 1000,
        pln23: 20000 + 500,
        pln5: 1000,
        pln_rez_pren: 20000,
        rez_pren23: 5000,
        celk_zd_a2: 2000,
      }))
        if (Math.abs(r2(cislo(cB[k]) - cislo(cA[k])) - x) > 0.001)
          chyby.push(`C.${k} +${r2(cislo(cB[k]) - cislo(cA[k]))}, čakal som +${x}`);
      t.over(!chyby.length, chyby.join("; "));
    });

    await t.krok("DPHSHV: služba (kód 3) a tovar v eurách (kód 0) pre DE odberateľa", async () => {
      const riadky = vety(po.shv).filter((x) => x.veta === "VetaR" && x.a.c_vat === "123456789");
      const kod = (k) => riadky.find((x) => x.a.k_pln_eu === String(k))?.a;
      const pred3 = vety(pred.shv ?? "").filter(
        (x) => x.veta === "VetaR" && x.a.c_vat === "123456789",
      );
      t.over(!pred3.length, "DE123456789 bolo v hlásení už pred zápisom — test by nič nedokázal");
      t.over(
        kod(3)?.pln_hodnota === "3000" && kod(3)?.pln_pocet === "1",
        `kód 3: ${JSON.stringify(kod(3))}`,
      );
      t.over(
        kod(0)?.pln_hodnota === String(400 * KURZ_EUR) && kod(0)?.k_stat === "DE",
        `kód 0 (tovar 400 € × ${KURZ_EUR}): ${JSON.stringify(kod(0))}`,
      );
    });

    /* ------------------------------------------------------- exporty */
    const zaciatok = new Date().toISOString();
    t.uprac("história exportov", async () => {
      const r = await t.rest.delete(
        `export_jobs?company_id=eq.${firma}&created_at=gte.${zaciatok}`,
      );
      if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
    });
    const vystavene = Object.values(d.v).filter((f) => f.type !== "proforma");
    const exportuj = async (format, meno) => {
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
      for (const f of vystavene) {
        const riadok = sekcia.locator("tr", { hasText: f.invoice_number }).first();
        await riadok.waitFor({ timeout: 20000 });
        await riadok.locator('input[type="checkbox"]').check();
      }
      const oznacit = sekcia.getByLabel(/Označiť ako odovzdané/);
      if (await oznacit.isChecked().catch(() => false)) await oznacit.uncheck();
      return t.stiahni(
        () => sekcia.getByRole("button", { name: "Exportovať", exact: true }).click(),
        meno,
      );
    };

    await t.krok("export Pohoda XML: schéma Stormware, CZ bez classificationKVDPH", async () => {
      const buf = readFileSync(await exportuj("pohoda_xml", "pohoda"));
      const chyba = await overXsd(buf, SCHEMY.pohoda);
      t.over(!chyba, `Pohoda XML neprešlo schémou: ${chyba}`);
      const text = textXml(buf);
      /*
        Od 31. 10. 2026 dostane § 92a aj česká firma bez nastavenia predvolené
        členenie UDpdp (česká Pohoda ho má) — do Pohody idú všetky doklady.
      */
      for (const f of vystavene)
        t.over(text.includes(f.invoice_number), `v Pohode chýba ${f.invoice_number}`);
      t.over(text.includes("UDpdp"), "§ 92a nemá predvolené členenie UDpdp");
      t.over(!text.includes("classificationKVDPH"), "česká Pohoda nemá členenie KV DPH");
      t.over(
        text.includes(`Daňový doklad k přijaté platbě ${d.v.ddp.invoice_number}`),
        "doklad k platbe nemá český text",
      );
      t.over(!text.includes("222/2004"), "v CZ exporte je slovenský zákon");
      // Faktúra v eurách: cudzia mena s kurzom ČNB 25 za 1 €.
      t.over(/<typ:rate>25(\.0+)?<\/typ:rate>/.test(text), "v Pohode chýba kurz 25 CZK/€");
    });

    await t.krok("export Money S3 XML proti schéme", async () => {
      const buf = readFileSync(await exportuj("money_s3_xml", "money"));
      const chyba = await overXsd(buf, SCHEMY.moneyS3);
      t.over(!chyba, `Money S3 neprešlo schémou: ${chyba}`);
      const text = textXml(buf);
      t.over(/JazykVerze="CZ"/.test(text), 'česká firma musí ísť do Money s JazykVerze="CZ"');
      /*
        Money S3 berie číslo dokladu najviac na 10 znakov — doklad k platbe
        z predvoleného radu (DDP + 8 číslic) vynechá a povie prečo.
      */
      const dlhe = vystavene.filter((f) => f.invoice_number.length > 10);
      for (const f of vystavene.filter((x) => !dlhe.includes(x)))
        t.over(
          text.includes(`<Doklad>${f.invoice_number}</Doklad>`),
          `v Money chýba ${f.invoice_number}`,
        );
      for (const f of dlhe)
        await t.cakajNa(`hláška o vynechanom ${f.invoice_number}`, async () =>
          t.hlasky.some((h) => h.includes(f.invoice_number) && /10 znakov/.test(h)),
        );
    });

    await t.krok("export ISDOC (ZIP): každý doklad proti ISDOC 6.0.2", async () => {
      const subor = await exportuj("isdoc_zip", "isdoc");
      const JSZip = (await import(pathToFileURL(cestaModulu("jszip")).href)).default;
      const zip = await JSZip.loadAsync(readFileSync(subor));
      const mena = Object.keys(zip.files).filter((n) => n.endsWith(".isdoc"));
      t.over(mena.length >= vystavene.length, `v ZIP je ${mena.length} súborov ISDOC`);
      for (const n of mena) {
        const xml = await zip.file(n).async("nodebuffer");
        const chyba = await overXsd(xml, SCHEMY.isdoc);
        t.over(!chyba, `${n} neprešlo schémou ISDOC: ${chyba}`);
      }
      const eur = await zip
        .file(mena.find((n) => n.includes(d.v.euTov.invoice_number)))
        .async("string");
      t.over(
        /<LocalCurrencyCode>CZK<\/LocalCurrencyCode>/.test(eur),
        "ISDOC: domáca mena nie je CZK",
      );
      t.over(
        /<ForeignCurrencyCode>EUR<\/ForeignCurrencyCode>/.test(eur),
        "ISDOC: chýba cudzia mena EUR",
      );
    });

    await t.krok("export ABRA Flexi XML", async () => {
      const buf = readFileSync(await exportuj("flexi_xml", "flexi"));
      const text = textXml(buf);
      t.over(/^\s*(<\?xml[^>]*>\s*)?<winstrom\b/.test(text), "Flexi XML nezačína <winstrom>");
      t.over(
        !(await overXsd(buf, SCHEMY.czShv)).includes("nedá prečítať"),
        "Flexi XML nie je dobre utvorené",
      );
      // Doklad k prijatej platbe Flexi nedostane (zakladá sa k zálohe), cudzia mena ide s kurzom.
      for (const f of vystavene.filter((x) => x.type !== "advance_payment"))
        t.over(
          text.includes(`<kod>${f.invoice_number}</kod>`),
          `vo Flexi chýba ${f.invoice_number}`,
        );
      t.over(
        /<mena>code:EUR<\/mena>\s*<kurz>25<\/kurz>/.test(text),
        "vo Flexi chýba faktúra v EUR s kurzom 25",
      );
    });
  },
};
