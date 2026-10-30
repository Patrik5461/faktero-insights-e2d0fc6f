/*
  Banka celou cestou v QA firme test2:
  - leasing cez formulár (kalendár s istinou, úrokom a DPH) a úver s pohyblivou sadzbou,
  - výpis camt.053 s piatimi pohybmi do nového účtu → isté dvojice sa spárujú samy
    (faktúra podľa VS, splátka leasingu podľa VS), zostatok účtu = konečný zostatok výpisu,
  - platba bez VS čaká v Párovaní platieb „na rozhodnutie“ a zapíše sa ručne,
  - ten istý výpis druhýkrát nič nezdvojí,
  - adresa pre e-mailové notifikácie banky k nahranému účtu.
  Upratanie zmaže všetko, čo tok založil.
*/
import { overXsd, SCHEMY } from "../lib/xml.mjs";
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";

const IBAN = "SK3911000000002612345678"; // neexistujúci účet len pre E2E
const r2 = (n) => Math.round(n * 100) / 100;

function ntry({ suma, datum, vs, meno, protiucet, popis }) {
  const smer = suma >= 0 ? "CRDT" : "DBIT";
  const strana =
    suma >= 0
      ? `<Dbtr><Nm>${meno}</Nm></Dbtr>${protiucet ? `<DbtrAcct><Id><IBAN>${protiucet}</IBAN></Id></DbtrAcct>` : ""}`
      : `<Cdtr><Nm>${meno}</Nm></Cdtr>${protiucet ? `<CdtrAcct><Id><IBAN>${protiucet}</IBAN></Id></CdtrAcct>` : ""}`;
  return `
   <Ntry>
    <Amt Ccy="EUR">${Math.abs(suma).toFixed(2)}</Amt><CdtDbtInd>${smer}</CdtDbtInd><Sts>BOOK</Sts>
    <BookgDt><Dt>${datum}</Dt></BookgDt><ValDt><Dt>${datum}</Dt></ValDt>
    <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>${suma >= 0 ? "RCDT" : "ICDT"}</Cd><SubFmlyCd>ESCT</SubFmlyCd></Fmly></Domn></BkTxCd>
    <NtryDtls><TxDtls>
     <Refs><EndToEndId>${vs ? `/VS${vs}/SS/KS` : "NOTPROVIDED"}</EndToEndId></Refs>
     <RltdPties>${strana}</RltdPties>
     <RmtInf><Ustrd>${popis}</Ustrd></RmtInf>
    </TxDtls></NtryDtls>
   </Ntry>`;
}

function camt({ znacka, datum, pohyby, otvorenie }) {
  const zaver = r2(otvorenie + pohyby.reduce((s, p) => s + p.suma, 0));
  return {
    zaver,
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
 <BkToCstmrStmt>
  <GrpHdr><MsgId>${znacka}</MsgId><CreDtTm>${datum}T08:00:00</CreDtTm></GrpHdr>
  <Stmt>
   <Id>${znacka}</Id><ElctrncSeqNb>1</ElctrncSeqNb><CreDtTm>${datum}T08:00:00</CreDtTm>
   <Acct><Id><IBAN>${IBAN}</IBAN></Id><Ccy>EUR</Ccy></Acct>
   <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">${otvorenie.toFixed(2)}</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>${datum}</Dt></Dt></Bal>
   <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">${zaver.toFixed(2)}</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>${datum}</Dt></Dt></Bal>
   ${pohyby.map((p) => ntry({ ...p, datum })).join("")}
  </Stmt>
 </BkToCstmrStmt>
</Document>`,
  };
}

export default {
  popis: "banka: leasing a úver, camt.053 → párovanie, zostatok, návrh, duplicity, notifikácie",
  limit: 300000,
  firma: "test2",
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test2;
    const z = Date.now();
    const vsFa = `8${String(z).slice(-8)}`;
    const vsLeasing = `6${String(z).slice(-8)}`;
    const platcaB = `${t.znacka} Platca B`;

    // ------------------------------------------------------------ upratanie
    t.uprac("bankový účet, pohyby, notifikácie", async () => {
      const u = await t.rest.get(
        `bank_accounts?company_id=eq.${firma}&iban=eq.${IBAN}&select=id,bank_connection_id`,
      );
      for (const ucet of u.data ?? []) {
        await t.rest.delete(`banka_notifikacie_maily?bank_account_id=eq.${ucet.id}`);
        await t.rest.delete(`banka_notifikacie_adresy?bank_account_id=eq.${ucet.id}`);
        const tx = await t.rest.get(`bank_transactions?bank_account_id=eq.${ucet.id}&select=id`);
        for (const x of tx.data ?? []) {
          await t.rest.delete(`payments?bank_transaction_id=eq.${x.id}`);
          await t.rest.patch(`financing_installments?bank_transaction_id=eq.${x.id}`, {
            bank_transaction_id: null,
            paid_at: null,
            paid_amount: null,
          });
        }
        const a = await t.rest.delete(`bank_transactions?bank_account_id=eq.${ucet.id}`);
        if (a.status >= 300) throw new Error(`pohyby: ${a.status} ${a.text.slice(0, 160)}`);
        const b = await t.rest.delete(`bank_accounts?id=eq.${ucet.id}`);
        if (b.status >= 300) throw new Error(`účet: ${b.status} ${b.text.slice(0, 160)}`);
        if (ucet.bank_connection_id)
          await t.rest.delete(`bank_connections?id=eq.${ucet.bank_connection_id}`);
      }
    });
    t.uprac("zmluvy financovania", async () => {
      const r = await t.rest.get(
        `financing_contracts?company_id=eq.${firma}&name=like.${t.znacka}*&select=id`,
      );
      for (const c of r.data ?? []) {
        await t.rest.delete(`financing_rate_periods?contract_id=eq.${c.id}`);
        await t.rest.delete(`financing_installments?contract_id=eq.${c.id}`);
        const d = await t.rest.delete(`financing_contracts?id=eq.${c.id}`);
        if (d.status >= 300) throw new Error(`zmluva: ${d.status} ${d.text.slice(0, 160)}`);
      }
    });

    // ------------------------------------------------------------ príprava
    const faktura = (cislo, suma, vs, meno) =>
      t.rest.vloz("invoices", {
        company_id: firma,
        invoice_number: `${t.znacka}-${cislo}`,
        type: "regular",
        status: "issued",
        issue_date: t.dnes,
        delivery_date: t.dnes,
        due_date: t.dnes,
        currency: "EUR",
        subtotal: r2(suma / 1.23),
        vat_total: r2(suma - suma / 1.23),
        total: suma,
        variable_symbol: vs,
        customer_name: meno,
      });
    const faA = await t.krok("príprava: faktúry A (VS) a B (bez VS)", async () => {
      const a = await faktura("A", 45.67, vsFa, `${t.znacka} Platca A`);
      t.uprac("faktúra A", () => zmazFakturuNatvrdo(t, a.id));
      const b = await faktura("B", 211.11, `5${String(z).slice(-8)}`, platcaB);
      t.uprac("faktúra B", () => zmazFakturuNatvrdo(t, b.id));
      return { a, b };
    });

    const pole = (l) =>
      page
        .locator(
          `xpath=//label[normalize-space()="${l}"]/following-sibling::*[self::input or self::select][1]`,
        )
        .first();

    const leasing = await t.krok(
      "leasing cez formulár: kalendár s istinou, úrokom a DPH",
      async () => {
        await t.go("/financovanie/nova");
        await page.getByRole("button", { name: "Leasing", exact: true }).click();
        await pole("Názov").fill(`${t.znacka} leasing`);
        await pole("Leasingovka alebo banka").fill(`${t.znacka} Leasing a.s.`);
        await pole("Variabilný symbol splátok").fill(vsLeasing);
        await pole("Financovaná suma (istina)").fill("12000");
        await pole("Počet splátok").fill("24");
        await pole("Prvá splátka").fill(t.dnes);
        await pole("DPH v splátke").selectOption("23");
        await page.getByRole("button", { name: "Pevná", exact: true }).click();
        await page
          .locator(`xpath=//label[normalize-space()="Úrok % p. a."]/following-sibling::input[1]`)
          .first()
          .fill("6");
        await page.getByRole("button", { name: "Uložiť a vytvoriť kalendár" }).click();
        const c = await t.cakajNa("zmluva", async () => {
          const r = await t.rest.get(
            `financing_contracts?company_id=eq.${firma}&name=eq.${encodeURIComponent(`${t.znacka} leasing`)}&select=*`,
          );
          return r.data?.[0] ?? null;
        });
        const spl = await t.cakajNa("kalendár", async () => {
          const r = await t.rest.get(
            `financing_installments?contract_id=eq.${c.id}&select=*&order=number`,
          );
          return r.data?.length === 24 ? r.data : null;
        });
        t.over(spl.length === 24, `splátok ${spl.length}`);
        const istiny = r2(spl.reduce((s, x) => s + Number(x.principal_part), 0));
        t.over(istiny === 12000, `súčet istín ${istiny}`);
        const prva = spl[0];
        t.over(Number(prva.vat_amount) > 0, "splátka leasingu nemá DPH");
        t.log(
          `1. splátka ${prva.amount} = istina ${prva.principal_part} + úrok ${prva.interest_part} + DPH ${prva.vat_amount}`,
        );
        return { c, prva, spl };
      },
    );

    await t.krok("úver s pohyblivou sadzbou (EURIBOR + marža)", async () => {
      await t.go("/financovanie/nova");
      await page.getByRole("button", { name: "Úver", exact: true }).click();
      await pole("Názov").fill(`${t.znacka} úver`);
      await pole("Leasingovka alebo banka").fill(`${t.znacka} Banka a.s.`);
      await pole("Financovaná suma (istina)").fill("50000");
      await pole("Počet splátok").fill("60");
      await pole("Prvá splátka").fill(t.dnes);
      await page.getByRole("button", { name: "Pohyblivá", exact: true }).click();
      await pole("Marža % p. a.").fill("2");
      await page.getByRole("button", { name: "Uložiť a vytvoriť kalendár" }).click();
      const c = await t.cakajNa("úver", async () => {
        const r = await t.rest.get(
          `financing_contracts?company_id=eq.${firma}&name=eq.${encodeURIComponent(`${t.znacka} úver`)}&select=*`,
        );
        return r.data?.[0] ?? null;
      });
      t.log(
        `úver: ${c.rate_type} ${c.reference_index} marža ${c.rate_margin} → sadzba ${c.interest_rate}`,
      );
      t.over(c.rate_type === "pohybliva", `typ sadzby ${c.rate_type}`);
      t.over(
        Number(c.interest_rate) > 2 && Number(c.interest_rate) < 8,
        `celková sadzba ${c.interest_rate}`,
      );
      const spl = await t
        .cakajNa("kalendár úveru", async () => {
          const r = await t.rest.get(
            `financing_installments?contract_id=eq.${c.id}&select=principal_part,interest_part`,
          );
          return r.data?.length === 60 ? r.data : null;
        })
        .catch(
          async () =>
            (
              await t.rest.get(
                `financing_installments?contract_id=eq.${c.id}&select=principal_part,interest_part`,
              )
            ).data ?? [],
        );
      t.over(spl.length === 60, `splátok ${spl.length}`);
      t.over(
        r2(spl.reduce((s, x) => s + Number(x.principal_part), 0)) === 50000,
        "istiny úveru nesedia",
      );
    });

    // ------------------------------------------------------------ výpis
    const { xml, zaver } = camt({
      znacka: t.znacka,
      datum: t.dnes,
      otvorenie: 1000,
      pohyby: [
        { suma: 45.67, vs: vsFa, meno: `${t.znacka} Platca A`, popis: `faktura ${vsFa}` },
        { suma: 211.11, vs: null, meno: platcaB, popis: "uhrada faktury" },
        { suma: 33.33, vs: null, meno: `${t.znacka} Neznámy`, popis: "vklad" },
        {
          suma: -Number(leasing.prva.amount),
          vs: vsLeasing,
          meno: `${t.znacka} Leasing a.s.`,
          protiucet: "SK7709000000000000123456",
          popis: "splatka leasingu",
        },
        { suma: -12.5, vs: null, meno: "Banka", popis: "poplatok za vedenie uctu" },
      ],
    });
    await t.krok("výpis je platný camt.053", async () => {
      const chyba = await overXsd(xml, SCHEMY.camt053);
      t.over(!chyba, `camt: ${chyba}`);
    });

    const nahraj = async (ocakavane) => {
      await t.go("/bankove-ucty/import");
      await page.locator('input[type="file"]').setInputFiles({
        name: `${t.znacka}.xml`,
        mimeType: "application/xml",
        buffer: Buffer.from(xml, "utf8"),
      });
      const tl = page.getByRole("button", { name: /^Nahrať 5 pohybov$/ });
      await tl.waitFor({ timeout: 30000 });
      if (ocakavane === "existujuci") {
        const vyber = page
          .locator("select")
          .filter({ has: page.locator('option[value="__novy__"]') });
        const zvolene = await vyber.inputValue();
        t.over(zvolene !== "__novy__", "druhé nahratie neponúklo existujúci účet");
      }
      await tl.click();
      await page.waitForURL((u) => u.pathname === "/bankove-ucty", { timeout: 60000 });
    };

    const ucet = await t.krok("nahratie výpisu do nového účtu", async () => {
      await nahraj("novy");
      const u = await t.cakajNa("účet", async () => {
        const r = await t.rest.get(`bank_accounts?company_id=eq.${firma}&iban=eq.${IBAN}&select=*`);
        return r.data?.[0] ?? null;
      });
      const n = await t.rest.pocet(`bank_transactions?bank_account_id=eq.${u.id}`);
      t.over(n === 5, `pohybov ${n}`);
      return u;
    });

    await t.krok("zostatok účtu = konečný zostatok výpisu", async () => {
      const u = (await t.rest.get(`bank_accounts?id=eq.${ucet.id}&select=balance,booked_balance`))
        .data[0];
      t.over(
        Number(u.balance) === zaver && Number(u.booked_balance) === zaver,
        `zostatok ${u.balance}/${u.booked_balance}, výpis ${zaver}`,
      );
      await t.go("/bankove-ucty");
      const suma = zaver
        .toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        .replace(/\s/g, " ");
      const text = (await page.locator("main").innerText()).replace(/\s/g, " ");
      t.over(text.includes(suma), `na stránke účtov chýba zostatok ${suma}`);
    });

    await t.krok("isté dvojice sú spárované: faktúra A aj splátka leasingu", async () => {
      await t.cakajNa("faktúra A uhradená", async () => {
        const f = (await t.rest.get(`invoices?id=eq.${faA.a.id}&select=status`)).data?.[0];
        return f?.status === "paid";
      });
      const s = await t.cakajNa("splátka spárovaná", async () => {
        const r = await t.rest.get(`financing_installments?id=eq.${leasing.prva.id}&select=*`);
        return r.data?.[0]?.bank_transaction_id ? r.data[0] : null;
      });
      t.over(Number(s.paid_amount) === Number(leasing.prva.amount), `zaplatené ${s.paid_amount}`);
      const b = (await t.rest.get(`invoices?id=eq.${faA.b.id}&select=status`)).data?.[0];
      t.over(b?.status !== "paid", "faktúra B bez VS sa nesmie spárovať sama");
    });

    await t.krok("platba bez VS je v Párovaní na rozhodnutie a zapíše sa", async () => {
      await t.go("/faktury/parovanie");
      const riadok = page.locator("tr", { hasText: `${t.znacka}-B` }).first();
      await riadok.waitFor({ timeout: 40000 });
      t.over(
        (await riadok.innerText()).includes("na rozhodnutie"),
        "návrh nie je „na rozhodnutie“",
      );
      // Isté zhody z iných tokov nech ostanú — odznačiť všetko okrem B.
      for (const cb of await page.locator("tbody input[type=checkbox]").all()) await cb.uncheck();
      await riadok.locator("input[type=checkbox]").check();
      await page.getByRole("button", { name: /Zapísať úhrady \(1\)/ }).click();
      await t.cakajNa("faktúra B uhradená", async () => {
        const f = (await t.rest.get(`invoices?id=eq.${faA.b.id}&select=status`)).data?.[0];
        return f?.status === "paid";
      });
    });

    await t.krok("ten istý výpis druhýkrát nič nezdvojí", async () => {
      await nahraj("existujuci");
      const n = await t.rest.pocet(`bank_transactions?bank_account_id=eq.${ucet.id}`);
      t.over(n === 5, `po druhom nahratí ${n} pohybov`);
      const u = await t.rest.pocet(`bank_accounts?company_id=eq.${firma}&iban=eq.${IBAN}`);
      t.over(u === 1, `účtov ${u}`);
    });

    await t.krok("nespárované pohyby ostávajú nespárované", async () => {
      const r = await t.rest.get(
        `bank_transactions?bank_account_id=eq.${ucet.id}&matched_invoice_id=is.null&select=amount,vybavenie`,
      );
      const sumy = (r.data ?? []).map((x) => Number(x.amount)).sort((a, b) => a - b);
      t.log("nespárované:", sumy.join(", "));
      t.over(sumy.includes(33.33), "neznámy vklad 33,33 zmizol");
    });

    // Na koniec, nech chyba rozpadu nezastaví zvyšok toku.
    const kontrolaRozpadu = async () => {
      for (const x of leasing.spl) {
        const s = r2(Number(x.principal_part) + Number(x.interest_part) + Number(x.vat_amount));
        t.over(
          Math.abs(s - Number(x.amount)) < 0.011,
          `splátka ${x.number}: istina ${x.principal_part} + úrok ${x.interest_part} + DPH ${x.vat_amount} ≠ ${x.amount}`,
        );
      }
    };

    await t.krok("adresa pre notifikácie banky k nahranému účtu", async () => {
      await t.go("/bankove-ucty/notifikacie");
      const ucetVyber = page
        .locator(`xpath=//*[normalize-space()="Účet"]/following-sibling::select[1]`)
        .first();
      await ucetVyber.waitFor({ timeout: 20000 });
      await ucetVyber.selectOption(ucet.id);
      await page.getByRole("button", { name: "Vytvoriť adresu" }).click();
      const a = await t.cakajNa("adresa", async () => {
        const r = await t.rest.get(
          `banka_notifikacie_adresy?bank_account_id=eq.${ucet.id}&select=token,active`,
        );
        return r.data?.[0] ?? null;
      });
      t.over(/^[a-z0-9]{16}$/.test(a.token) && a.active, `adresa ${a.token}`);
      await page.getByText(`banka-${a.token}@`).first().waitFor({ timeout: 15000 });
    });

    await t.krok("rozpad splátky leasingu: istina + úrok + DPH = splátka", kontrolaRozpadu);
  },
};
