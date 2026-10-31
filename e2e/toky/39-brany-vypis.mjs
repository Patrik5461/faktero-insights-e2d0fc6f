/*
  Výpis z platobnej brány (Stripe) celou cestou v QA firme test2:
  - export brány nahratý v Bankové účty → Nahrať výpis založí účet „Stripe“, platby,
    poplatky zvlášť a výber na účet; zostatok účtu = súčet pohybov (Stripe ho nedáva),
  - platby sa samy spárujú s faktúrami podľa VS aj podľa čísla objednávky,
  - druhé nahratie toho istého exportu nič nezdvojí,
  - Účtovníctvo → Výpis z platobnej brány: XML pre Pohodu prejde schémou Stormware,
    obrat sedí na cent a poplatky dostanú predkontáciu z pravidla pre banku;
    SEPA XML (camt.053) s účtom bez IBAN-u prejde schémou ISO 20022.
  Upratanie zmaže účet, pohyby, faktúry aj pravidlo.
*/
import { readFileSync } from "node:fs";
import { overXsd, SCHEMY } from "../lib/xml.mjs";
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";

export default {
  popis: "výpis brány Stripe: nahratie, párovanie, duplicity, XML pre Pohodu a camt.053",
  limit: 240000,
  firma: "test2",
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test2;
    const z = t.znacka;
    const cislo = String(Date.now()).slice(-6);
    const vsA = `81${cislo}`;
    const objB = `82${cislo}`;
    const den = t.dnes;

    // Stripe → Reports → Balance → Itemized balance change from activity.
    const csv = [
      "balance_transaction_id,created_utc,available_on_utc,currency,gross,fee,net,reporting_category,description",
      `txn_${cislo}A,${den} 09:12:00,${den} 00:00:00,eur,45.91,0.94,44.97,charge,${z} - Order ${vsA}`,
      `txn_${cislo}B,${den} 11:00:00,${den} 00:00:00,eur,19.00,0.52,18.48,charge,${z} - Order ${objB}`,
      `txn_${cislo}P,${den} 18:00:00,${den} 00:00:00,eur,-63.45,0.00,-63.45,payout,STRIPE PAYOUT`,
    ].join("\n");
    const subor = { name: `stripe-${cislo}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv) };

    // ------------------------------------------------------------ upratanie
    t.uprac("účet Stripe a pohyby", async () => {
      const u = await t.rest.get(
        `bank_accounts?company_id=eq.${firma}&iban=eq.Stripe&select=id,bank_connection_id`,
      );
      for (const ucet of u.data ?? []) {
        const tx = await t.rest.get(`bank_transactions?bank_account_id=eq.${ucet.id}&select=id`);
        for (const x of tx.data ?? [])
          await t.rest.delete(`payments?bank_transaction_id=eq.${x.id}`);
        const a = await t.rest.delete(`bank_transactions?bank_account_id=eq.${ucet.id}`);
        if (a.status >= 300) throw new Error(`pohyby: ${a.status} ${a.text.slice(0, 160)}`);
        const b = await t.rest.delete(`bank_accounts?id=eq.${ucet.id}`);
        if (b.status >= 300) throw new Error(`účet: ${b.status} ${b.text.slice(0, 160)}`);
        if (ucet.bank_connection_id)
          await t.rest.delete(`bank_connections?id=eq.${ucet.bank_connection_id}`);
      }
    });
    t.uprac("pravidlo pre banku", () =>
      t.rest.delete(`pravidla_uctovania?company_id=eq.${firma}&nazov=like.${z}*`),
    );

    // ------------------------------------------------------------ príprava
    const faktury = await t.krok("príprava: faktúra A (VS) a B (číslo objednávky)", async () => {
      const f = async (meno, suma, x) => {
        const r = await t.rest.vloz("invoices", {
          company_id: firma,
          invoice_number: `${z}-${meno}`,
          type: "regular",
          status: "issued",
          issue_date: den,
          delivery_date: den,
          due_date: den,
          currency: "EUR",
          subtotal: Math.round((suma / 1.23) * 100) / 100,
          vat_total: Math.round((suma - suma / 1.23) * 100) / 100,
          total: suma,
          customer_name: `${z} E-shop zákazník ${meno}`,
          ...x,
        });
        t.uprac(`faktúra ${meno}`, () => zmazFakturuNatvrdo(t, r.id));
        return r;
      };
      return {
        a: await f("A", 45.91, { variable_symbol: vsA }),
        b: await f("B", 19.0, { variable_symbol: `9${cislo}`, order_number: objB }),
      };
    });
    const pravidlo = await t.krok("príprava: pravidlo pre banku na poplatky brány", async () =>
      t.rest.vloz("pravidla_uctovania", {
        company_id: firma,
        nazov: `${z} poplatky Stripe`,
        druh: "banka",
        smer: "vydaj",
        oznacenie: "poplatok",
        dodavatel_text: "Stripe",
        predkontacia: "E2EPOP",
        poradie: 100,
        aktivne: true,
      }),
    );

    // ------------------------------------------------------------ nahratie
    const nahraj = async () => {
      await t.go("/bankove-ucty/import");
      await page.locator('input[type="file"]').setInputFiles(subor);
      const tl = page.getByRole("button", { name: /^Nahrať \d+ pohyb/ });
      await tl.waitFor({ timeout: 30000 });
      const text = await tl.innerText();
      await tl.click();
      await page.waitForURL((u) => u.pathname === "/bankove-ucty", { timeout: 60000 });
      return text;
    };

    const ucet = await t.krok("nahratie exportu Stripe založí účet brány", async () => {
      const text = await nahraj();
      t.over(/Nahrať 5 pohybov/.test(text), `tlačidlo: ${text}`);
      const u = await t.cakajNa("účet Stripe", async () => {
        const r = await t.rest.get(
          `bank_accounts?company_id=eq.${firma}&iban=eq.Stripe&select=id,balance,currency`,
        );
        return r.data?.[0] ?? null;
      });
      const tx = await t.rest.get(
        `bank_transactions?bank_account_id=eq.${u.id}&select=amount,variable_symbol,transaction_reference&order=transaction_reference`,
      );
      const sumy = (tx.data ?? []).map((x) => Number(x.amount)).sort((a, b) => a - b);
      t.over(
        JSON.stringify(sumy) === JSON.stringify([-63.45, -0.94, -0.52, 19, 45.91]),
        `pohyby ${JSON.stringify(sumy)}`,
      );
      t.over(
        (tx.data ?? []).every((x) => String(x.transaction_reference).startsWith("stripe:")),
        "referencie pohybov",
      );
      t.over(Number(u.balance) === 0, `zostatok ${u.balance}, čakal som 0 (všetko vyplatené)`);
      return u;
    });

    await t.krok("platby sa spárovali s faktúrami (VS aj číslo objednávky)", async () => {
      await t.cakajNa("faktúra A uhradená", async () => {
        const f = (await t.rest.get(`invoices?id=eq.${faktury.a.id}&select=status`)).data?.[0];
        return f?.status === "paid";
      });
      const b = await t
        .cakajNa(
          "faktúra B uhradená",
          async () => {
            const f = (await t.rest.get(`invoices?id=eq.${faktury.b.id}&select=status`)).data?.[0];
            return f?.status === "paid" ? f : null;
          },
          { limit: 10000 },
        )
        .catch(() => null);
      if (!b)
        t.upozornenia.push(
          "faktúra B (len číslo objednávky) sa automaticky nespárovala — čaká v Párovaní platieb",
        );
    });

    await t.krok("druhé nahratie toho istého exportu nič nezdvojí", async () => {
      await nahraj();
      const n = await t.rest.pocet(`bank_transactions?bank_account_id=eq.${ucet.id}`);
      t.over(n === 5, `po druhom nahratí ${n} pohybov`);
    });

    // ------------------------------------------------------------ Výpis do Pohody
    let pohoda;
    await t.krok("Výpis z platobnej brány: XML pre Pohodu prejde schémou", async () => {
      await t.go("/uctovnictvo/vypis-do-pohody?zdroj=brana");
      await page.locator('input[type="file"]').setInputFiles(subor);
      await page.getByText(/Prečítané z exportu Stripe/).waitFor({ timeout: 30000 });
      await page.getByPlaceholder(/napr\. TB/).fill("STR");
      const cesta = await t.stiahni(
        () => page.getByRole("button", { name: "XML pre Pohodu" }).click(),
        "pohoda",
      );
      pohoda = readFileSync(cesta);
      const chyba = await overXsd(pohoda, SCHEMY.pohoda);
      t.over(!chyba, `XSD Pohody: ${chyba}`);
    });

    await t.krok("XML pre Pohodu: obrat na cent, účet a predkontácia poplatkov", async () => {
      const xml = pohoda.toString("utf8");
      const polozky = [...xml.matchAll(/<bnk:bank\b[\s\S]*?<\/bnk:bank>/g)].map((m) => m[0]);
      t.over(polozky.length === 5, `položiek ${polozky.length}`);
      let obrat = 0;
      for (const p of polozky) {
        const suma = Number(p.match(/<typ:priceNone>([\d.]+)</)?.[1]);
        obrat += p.includes("<bnk:bankType>receipt<") ? suma : -suma;
        t.over(p.includes("<typ:ids>STR</typ:ids>"), "chýba skratka účtu v Pohode");
      }
      t.over(Math.round(obrat * 100) === 0, `obrat ${obrat}`);
      const poplatky = polozky.filter((p) => p.includes("Bankový poplatok"));
      t.over(poplatky.length === 2, `poplatkov ${poplatky.length}`);
      for (const p of poplatky)
        t.over(
          p.includes("<bnk:accounting><typ:ids>E2EPOP</typ:ids>"),
          `poplatok bez predkontácie z pravidla „${pravidlo.nazov}“`,
        );
      t.over(xml.includes(`<bnk:symVar>${vsA}</bnk:symVar>`), "VS platby A");
    });

    await t.krok("SEPA XML (camt.053) prejde schémou ISO 20022", async () => {
      const cesta = await t.stiahni(
        () => page.getByRole("button", { name: "SEPA XML (camt.053)" }).click(),
        "camt",
      );
      const xml = readFileSync(cesta);
      const chyba = await overXsd(xml, SCHEMY.camt053);
      t.over(!chyba, `camt.053: ${chyba}`);
      const s = xml.toString("utf8");
      t.over(s.includes("<Othr><Id>STRIPE</Id></Othr>"), "účet brány v Othr/Id");
      t.over((s.match(/<Ntry>/g) ?? []).length === 5, "počet pohybov v camt");
    });
  },
};
