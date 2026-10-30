/*
  Sklad pri faktúrach a zákazka s bločkom (chyby z testu 30. 10. 2026):

  - zálohová faktúra po odoslaní nesmie vydať tovar (vydá ho až vyúčtovacia),
  - dobropis po odoslaní tovar na sklad VRÁTI (predtým ho vydal druhýkrát),
  - storno dobropisu tovar zase vydá,
  - zákazka s priradeným bločkom sa nedá zmazať a bloček je v jej nákladoch.

  Skladová karta „E2E sklad“ v QA firme Test sa zakladá raz a ostáva — pohyby
  skladu sú nemenné a nedajú sa zmazať, preto tok po sebe necháva len vyrovnané
  pohyby (príjem dorovná stav, storno vráti dobropis). Doklady a zákazka sa
  mažú natvrdo.
*/
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";

const SKU = "E2E-SKLAD";

async function stav(t, kartaId) {
  const r = await t.rest.get(`stock_levels?stock_item_id=eq.${kartaId}&select=quantity`);
  if (r.status !== 200) throw new Error(`stav skladu: ${r.status} ${r.text.slice(0, 200)}`);
  return (r.data ?? []).reduce((s, x) => s + Number(x.quantity), 0);
}

async function doklad(t, firma, typ, cislo, mnozstvo, kartaId) {
  const f = await t.rest.vloz("invoices", {
    company_id: firma,
    invoice_number: cislo,
    type: typ,
    status: "issued",
    issue_date: t.dnes,
    delivery_date: t.dnes,
    due_date: t.dnes,
    currency: "EUR",
    subtotal: mnozstvo,
    vat_total: 0,
    total: mnozstvo,
    customer_name: `${t.znacka} Sklad`,
  });
  t.uprac(`doklad ${cislo}`, async () => {
    // Odoslaný doklad so skladovou položkou sa nedá zmazať — najprv koncept (storno pohyb).
    await t.rest.patch(`invoices?id=eq.${f.id}`, { status: "draft" });
    await zmazFakturuNatvrdo(t, f.id);
  });
  await t.rest.vloz("invoice_items", {
    invoice_id: f.id,
    position: 0,
    name: `${t.znacka} skladová položka`,
    quantity: mnozstvo,
    unit: "ks",
    unit_price: 1,
    vat_rate: 0,
    subtotal: mnozstvo,
    vat_amount: 0,
    total: mnozstvo,
    stock_item_id: kartaId,
  });
  return f;
}

export default {
  popis: "sklad: záloha nevydá, dobropis vráti; zákazka s bločkom",
  limit: 120000,
  async spusti(t) {
    const firma = t.firmy.test;

    const karta = await t.krok("príprava: skladová karta a stav", async () => {
      let k = (await t.rest.get(`stock_items?company_id=eq.${firma}&sku=eq.${SKU}&select=id`))
        .data?.[0];
      if (!k)
        k = await t.rest.vloz("stock_items", { company_id: firma, sku: SKU, track_stock: true });
      if ((await stav(t, k.id)) < 10) {
        const sklad = (
          await t.rest.get(`warehouses?company_id=eq.${firma}&select=id&order=created_at&limit=1`)
        ).data?.[0];
        t.over(sklad, "QA firma nemá sklad");
        await t.rest.vloz("stock_movements", {
          company_id: firma,
          warehouse_id: sklad.id,
          stock_item_id: k.id,
          type: "prijem",
          quantity: 10,
          unit_price: 1,
          note: "E2E doplnenie stavu",
        });
      }
      return k;
    });

    const pred = await stav(t, karta.id);

    await t.krok("zálohová faktúra po odoslaní nevydá tovar", async () => {
      const z = await doklad(t, firma, "proforma", `${t.znacka}-ZAL`, 3, karta.id);
      const r = await t.rest.patch(`invoices?id=eq.${z.id}`, { status: "sent" });
      t.over(r.status < 300, `odoslanie zálohy: ${r.status} ${r.text.slice(0, 200)}`);
      const po = await stav(t, karta.id);
      t.over(po === pred, `stav ${pred} → ${po}, záloha hýbe skladom`);
    });

    await t.krok("dobropis po odoslaní vráti tovar, storno ho vydá", async () => {
      const d = await doklad(t, firma, "credit_note", `${t.znacka}-DOB`, -2, karta.id);
      await t.rest.patch(`invoices?id=eq.${d.id}`, { status: "sent" });
      const po = await stav(t, karta.id);
      t.over(po === pred + 2, `po dobropise ${po}, čakal som ${pred + 2}`);
      await t.rest.patch(`invoices?id=eq.${d.id}`, { status: "cancelled" });
      const storno = await stav(t, karta.id);
      t.over(storno === pred, `po storne dobropisu ${storno}, čakal som ${pred}`);
    });

    await t.krok("zákazka s bločkom: nedá sa zmazať, bloček je v nákladoch", async () => {
      const z = await t.rest.vloz("jobs", {
        company_id: firma,
        name: `${t.znacka} zákazka`,
        job_number: `${t.znacka}-ZAK`,
      });
      t.uprac("zákazka", async () => {
        const r = await t.rest.delete(`jobs?id=eq.${z.id}`);
        if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
      });
      const b = await t.rest.vloz("expense_documents", {
        company_id: firma,
        supplier_name: `${t.znacka} Stavebniny`,
        document_number: `${t.znacka}-ZB`,
        issue_date: t.dnes,
        net_amount: 40,
        vat_amount: 9.2,
        total_amount: 49.2,
        vat_rate: 23,
        payment_method: "karta",
        job_id: z.id,
      });
      t.uprac("bloček", async () => {
        const r = await t.rest.delete(`expense_documents?id=eq.${b.id}`);
        if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
      });
      const zmaz = await t.rest.delete(`jobs?id=eq.${z.id}`);
      const este = await t.rest.get(`jobs?id=eq.${z.id}&select=id`);
      t.over(este.data?.length === 1, `zákazka s bločkom sa zmazala (${zmaz.status})`);
      const bl = await t.rest.get(`expense_documents?id=eq.${b.id}&select=job_id`);
      t.over(bl.data?.[0]?.job_id === z.id, "bloček sa od zákazky odpojil");

      await t.go(`/zakazky/${z.id}`);
      await t.page.getByText(`${t.znacka}-ZB`).first().waitFor({ timeout: 20000 });
      const text = await t.page.locator("main").innerText();
      t.over(/40,00\s*€/.test(text), "náklad bločku 40,00 € na zákazke chýba");
    });
  },
};
