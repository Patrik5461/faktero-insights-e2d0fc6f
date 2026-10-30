/*
  Hromadný príkaz z veľkého výberu: 300+ prijatých faktúr (dávky id), ktoré
  do príkazu nesmú — koncept, na kontrolu, cudzia, celá zaplatená zálohou —
  okno vymenuje, čiastočná záloha sa odpočíta. pain.001 proti ISO aj EPC.
*/
import { readFileSync } from "node:fs";
import { overXsd, SCHEMY } from "../lib/xml.mjs";

const VYPLN = 300;
const IBAN = "SK7709000000000000123456";

export default {
  popis: "hromadný príkaz: 300+ faktúr, vynechané koncept/kontrola/cudzia/záloha",
  limit: 240000,
  firma: "test2",
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test2;
    const dodavatel = `${t.znacka} Príkaz s.r.o.`;
    const teraz = new Date().toISOString();

    t.uprac("prijaté faktúry", async () => {
      await t.rest.patch(
        `purchase_invoices?company_id=eq.${firma}&supplier_name=eq.${encodeURIComponent(dodavatel)}`,
        { advance_invoice_id: null },
      );
      const z = await t.rest.delete(
        `purchase_invoices?company_id=eq.${firma}&supplier_name=eq.${encodeURIComponent(dodavatel)}`,
      );
      if (z.status >= 300) throw new Error(`${z.status} ${z.text.slice(0, 200)}`);
    });

    const zaklad = (cislo, zmeny = {}) => ({
      company_id: firma,
      supplier_name: dodavatel,
      supplier_ico: "50000001",
      supplier_iban: IBAN,
      invoice_number: `${t.znacka}-${cislo}`,
      variable_symbol: null,
      issue_date: t.dnes,
      delivery_date: t.dnes,
      due_date: t.dnes,
      amount_without_vat: 100,
      vat_amount: 23,
      amount_total: 123,
      currency: "EUR",
      payment_method: "prevod",
      status: "received",
      type: "regular",
      auto_uctovanie_at: teraz,
      na_kontrolu_at: null,
      odberatel_nesedi: null,
      advance_invoice_id: null,
      advance_amount: null,
      ...zmeny,
    });

    const zaloha = await t.krok("príprava: zaplatená zálohová faktúra", () =>
      t.rest.vloz(
        "purchase_invoices",
        zaklad("ZAL", {
          type: "proforma",
          status: "paid",
          amount_without_vat: 100,
          vat_amount: 0,
          amount_total: 100,
        }),
      ),
    );

    await t.krok(`príprava: ${VYPLN + 5} faktúr`, async () => {
      const riadky = [
        zaklad("KONCEPT", { status: "draft" }),
        zaklad("KONTROLA", { na_kontrolu_at: teraz }),
        zaklad("CUDZIA", { odberatel_nesedi: { meno: "Iná firma s.r.o." } }),
        zaklad("CELA-ZALOHA", {
          amount_without_vat: 100,
          vat_amount: 0,
          amount_total: 100,
          advance_invoice_id: zaloha.id,
        }),
        zaklad("CIASTOCNA", {
          amount_without_vat: 140,
          vat_amount: 0,
          amount_total: 140,
          advance_amount: 40,
        }),
      ];
      for (let i = 0; i < VYPLN; i++)
        riadky.push(zaklad(`V${i}`, { variable_symbol: String(700000 + i) }));
      for (let i = 0; i < riadky.length; i += 150) {
        const r = await t.rest.post("purchase_invoices", riadky.slice(i, i + 150), {
          hlavicky: { Prefer: "return=minimal" },
        });
        if (r.status >= 300) throw new Error(`INSERT ${r.status} ${r.text.slice(0, 300)}`);
      }
    });

    let textOkna = "";
    const okno = page.getByRole("dialog", { name: "Hromadný príkaz na úhradu" });
    const subor = await t.krok("výber všetkých a príkaz", async () => {
      await t.go("/prijate-faktury");
      await page.getByPlaceholder("Dodávateľ…").fill(t.znacka);
      await page.locator("tbody tr", { hasText: t.znacka }).first().waitFor({ timeout: 30000 });
      // Počkať, kým filter dobehne na všetky riadky (zoznam sa kreslí po stovkách).
      await page.waitForTimeout(2500);
      await page.locator("thead input[type=checkbox]").first().check();
      await page
        .getByRole("button", { name: /Hromadný príkaz na úhradu/ })
        .first()
        .click();
      await okno.waitFor();
      await okno.getByRole("button", { name: "Stiahnuť XML" }).waitFor({ timeout: 30000 });
      // Okno sa po stiahnutí zavrie — text sa prečíta skôr.
      await page.waitForTimeout(1500);
      textOkna = (await okno.innerText()).replace(/\s+/g, " ");
      return await t.stiahni(
        () => okno.getByRole("button", { name: "Stiahnuť XML" }).click(),
        "pain001",
      );
    });

    await t.krok("okno vymenuje vynechané", async () => {
      const text = textOkna;
      for (const c of ["KONCEPT", "KONTROLA", "CUDZIA", "CELA-ZALOHA"])
        t.over(
          text.includes(`${t.znacka}-${c}`),
          `v zozname vynechaných chýba ${c}: ${text.slice(0, 400)}`,
        );
      t.over(text.includes("Do príkazu nepôjde 4"), `vynechaných nie je 4: ${text.slice(0, 600)}`);
      t.over(text.includes(`${t.znacka}-CIASTOCNA −40,00`), "čiastočná záloha sa neodpočítala");
    });

    await t.krok("pain.001 — počet, sumy, schémy", async () => {
      const xml = readFileSync(subor, "utf8");
      const iso = await overXsd(xml, SCHEMY.pain001);
      t.over(!iso, `ISO: ${iso}`);
      const epc = await overXsd(xml, SCHEMY.pain001Sepa);
      t.over(!epc, `EPC: ${epc}`);
      const n = (xml.match(/<CdtTrfTxInf>/g) ?? []).length;
      t.over(n === VYPLN + 1, `platieb ${n}, čakal som ${VYPLN + 1}`);
      t.over(
        /<InstdAmt Ccy="EUR">100\.00<\/InstdAmt>/.test(xml),
        "čiastočná záloha: chýba platba 100.00",
      );
      const ctrl = Number(/<GrpHdr>[\s\S]*?<CtrlSum>([\d.]+)<\/CtrlSum>/.exec(xml)?.[1]);
      t.over(Math.abs(ctrl - (VYPLN * 123 + 100)) < 0.005, `CtrlSum ${ctrl}`);
    });
  },
};
