/*
  Banka: nahratie malého camt.053 do QA firmy → automatické spárovanie
  s faktúrou (VS + suma) → odpárovanie v detaile pohybu → upratanie
  (pohyby, účet, pripojenie aj faktúra sa zmažú).
*/
import { overXsd, SCHEMY } from "../lib/xml.mjs";
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";

const IBAN_VYPISU = "SK7709000000000000123456"; // neexistujúci účet len pre E2E

function camt({ vs, suma, datum, znacka }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
 <BkToCstmrStmt>
  <GrpHdr><MsgId>${znacka}</MsgId><CreDtTm>${datum}T08:00:00</CreDtTm></GrpHdr>
  <Stmt>
   <Id>${znacka}</Id><ElctrncSeqNb>1</ElctrncSeqNb><CreDtTm>${datum}T08:00:00</CreDtTm>
   <Acct><Id><IBAN>${IBAN_VYPISU}</IBAN></Id><Ccy>EUR</Ccy></Acct>
   <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">0.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>${datum}</Dt></Dt></Bal>
   <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">${suma}</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>${datum}</Dt></Dt></Bal>
   <Ntry>
    <Amt Ccy="EUR">${suma}</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts>
    <BookgDt><Dt>${datum}</Dt></BookgDt><ValDt><Dt>${datum}</Dt></ValDt>
    <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>RCDT</Cd><SubFmlyCd>ESCT</SubFmlyCd></Fmly></Domn></BkTxCd>
    <NtryDtls><TxDtls>
     <Refs><EndToEndId>/VS${vs}/SS/KS</EndToEndId></Refs>
     <RltdPties><Dbtr><Nm>${znacka} Platiteľ</Nm></Dbtr></RltdPties>
     <RmtInf><Ustrd>${znacka} uhrada faktury ${vs}</Ustrd></RmtInf>
    </TxDtls></NtryDtls>
   </Ntry>
  </Stmt>
 </BkToCstmrStmt>
</Document>`;
}

export default {
  popis: "banka: camt.053 → automatické spárovanie s faktúrou → odpárovanie a upratanie",
  limit: 150000,
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test;
    const vs = `9${String(Date.now()).slice(-8)}`;
    const suma = "45.67";

    const fa = await t.krok("príprava: neuhradená faktúra", async () => {
      const f = await t.rest.vloz("invoices", {
        company_id: firma,
        invoice_number: `${t.znacka}-BANKA`,
        type: "regular",
        status: "issued",
        issue_date: t.dnes,
        delivery_date: t.dnes,
        due_date: t.dnes,
        currency: "EUR",
        subtotal: 37.13,
        vat_total: 8.54,
        total: Number(suma),
        variable_symbol: vs,
        customer_name: `${t.znacka} Platiteľ`,
        intro_note: "E2E test párovania",
      });
      t.uprac("faktúra", () => zmazFakturuNatvrdo(t, f.id));
      return f;
    });

    // Upratanie bankových dát — aj keď test spadne skôr.
    t.uprac("bankový účet a pohyby", async () => {
      const u = await t.rest.get(
        `bank_accounts?company_id=eq.${firma}&iban=eq.${IBAN_VYPISU}&select=id,bank_connection_id`,
      );
      for (const ucet of u.data ?? []) {
        const tx = await t.rest.get(`bank_transactions?bank_account_id=eq.${ucet.id}&select=id`);
        for (const x of tx.data ?? [])
          await t.rest.delete(`payments?bank_transaction_id=eq.${x.id}`);
        const a = await t.rest.delete(`bank_transactions?bank_account_id=eq.${ucet.id}`);
        if (a.status >= 300) throw new Error(`pohyby: ${a.status} ${a.text.slice(0, 160)}`);
        const b = await t.rest.delete(`bank_accounts?id=eq.${ucet.id}`);
        if (b.status >= 300) throw new Error(`účet: ${b.status} ${b.text.slice(0, 160)}`);
        if (ucet.bank_connection_id) {
          const c = await t.rest.delete(`bank_connections?id=eq.${ucet.bank_connection_id}`);
          if (c.status >= 300) throw new Error(`pripojenie: ${c.status} ${c.text.slice(0, 160)}`);
        }
      }
    });

    const xml = camt({ vs, suma, datum: t.dnes, znacka: t.znacka });
    await t.krok("testovací výpis je platný camt.053", async () => {
      const chyba = await overXsd(xml, SCHEMY.camt053);
      t.over(!chyba, `vlastný camt.053 neprešiel schémou: ${chyba}`);
    });

    await t.krok("nahratie výpisu", async () => {
      await t.go("/bankove-ucty/import");
      await page.locator('input[type="file"]').setInputFiles({
        name: `${t.znacka}.xml`,
        mimeType: "application/xml",
        buffer: Buffer.from(xml, "utf8"),
      });
      const nahraj = page.getByRole("button", { name: /^Nahrať 1 pohybov$/ });
      await nahraj.waitFor({ timeout: 30000 });
      await nahraj.click();
      await page.waitForURL((u) => u.pathname === "/bankove-ucty", { timeout: 30000 });
    });

    const pohyb = await t.krok("faktúra je automaticky spárovaná", async () => {
      const tx = await t.cakajNa("pohyb spárovaný s faktúrou", async () => {
        const r = await t.rest.get(
          `bank_transactions?company_id=eq.${firma}&matched_invoice_id=eq.${fa.id}&select=id,amount,variable_symbol`,
        );
        return r.data?.[0] ?? null;
      });
      t.over(Number(tx.amount) === Number(suma), `suma pohybu ${tx.amount}`);
      const f = (await t.rest.get(`invoices?id=eq.${fa.id}&select=status,paid_at`)).data?.[0];
      t.over(f?.status === "paid", `faktúra má stav ${f?.status}, čakal som paid`);
      return tx;
    });

    await t.krok("odpárovanie v detaile pohybu", async () => {
      await t.go("/bankove-ucty/transakcie");
      const riadok = page.locator("tr", { hasText: `${t.znacka} Platiteľ` }).first();
      await riadok.getByText("detail", { exact: true }).click();
      await page.getByRole("button", { name: "Odpárovať" }).first().click();
      await t.potvrd(page, "Odpárovať");
      await t.cakajNa("zrušené párovanie", async () => {
        const r = await t.rest.get(`bank_transactions?id=eq.${pohyb.id}&select=matched_invoice_id`);
        return r.data?.[0] && !r.data[0].matched_invoice_id;
      });
      const f = (await t.rest.get(`invoices?id=eq.${fa.id}&select=status`)).data?.[0];
      t.over(f?.status !== "paid", `po odpárovaní je faktúra stále ${f?.status}`);
      const pl = await t.rest.get(`payments?invoice_id=eq.${fa.id}&select=id`);
      t.over((pl.data ?? []).length === 0, "po odpárovaní ostala úhrada");
    });
  },
};
