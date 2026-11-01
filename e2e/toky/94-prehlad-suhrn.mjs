/*
  Prehľad (`prehlad_suhrn`, opravy B4 z 1. 11. 2026):
  - S-01: neuhradená faktúra staršia ako 13 mesiacov sa na Prehľade neztratí;
  - S-02: faktúra v cudzej mene s kurzom sa prepočíta (značka „prepočítané“),
    bez kurzu ostane mimo súčtu a vráti sa po menách v `bez_prepoctu`;
  - S-03: karta „Po splatnosti“ má vlastný počet odberateľov.
  Zapisuje len do QA firmy Test a po sebe zmaže, čo založil.
*/
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";

const r2 = (n) => Math.round(n * 100) / 100;

export default {
  popis: "Prehľad: staré neuhradené, cudzia mena s kurzom a bez kurzu, dlžníci po splatnosti",
  bezPrehliadaca: true,
  limit: 90000,
  async spusti(t) {
    const firma = t.firmy.test;
    const suhrn = async () => {
      const r = await t.rest.rpc("prehlad_suhrn", {
        p_company_id: firma,
        p_dnes: t.dnes,
        p_mena: "EUR",
      });
      t.over(r.status === 200, `prehlad_suhrn: ${r.status} ${r.text.slice(0, 200)}`);
      return r.data;
    };

    const pred = await t.krok("súhrn pred zápisom má nové kľúče", async () => {
      const s = await suhrn();
      for (const k of [
        "dlznikov_po_splatnosti",
        "bez_prepoctu",
        "prepocitane",
        "vydavky_blocky_rok",
      ])
        t.over(k in s, `chýba kľúč ${k}`);
      return s;
    });

    await t.krok("príprava: stará neuhradená, USD s kurzom a USD bez kurzu", async () => {
      const o = await t.rest.vloz("customers", {
        company_id: firma,
        name: `${t.znacka} Dlžník s.r.o.`,
        street: "Testovacia 1",
        city: "Bratislava",
        zip: "81101",
        country: "SK",
      });
      t.uprac("odberateľ", async () => {
        const r = await t.rest.delete(`customers?id=eq.${o.id}`);
        if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
      });
      const pred2r = new Date(Date.now() - 2 * 365 * 86400000).toISOString().slice(0, 10);
      const zaloz = async (popis, { datum, splatnost, mena, suma, kurz }) => {
        const c = await t.rest.rpc("faktero_next_invoice_number", {
          _company_id: firma,
          _issue_date: datum,
          _type: "regular",
          _series_id: null,
        });
        t.over(c.status === 200, `číslo (${popis}): ${c.status} ${c.text.slice(0, 160)}`);
        const f = await t.rest.vloz("invoices", {
          company_id: firma,
          customer_id: o.id,
          type: "regular",
          status: "issued",
          invoice_number: c.data.invoice_number,
          sequence_number: c.data.sequence_number,
          number_series_id: c.data.series_id,
          issue_date: datum,
          delivery_date: datum,
          due_date: splatnost,
          currency: mena,
          exchange_rate: kurz ?? null,
          payment_method: "bank_transfer",
          customer_name: o.name,
          customer_country: "SK",
          intro_note: `${t.znacka} ${popis}`,
          subtotal: suma,
          vat_total: 0,
          total: suma,
        });
        t.uprac(`faktúra ${f.invoice_number}`, () => zmazFakturuNatvrdo(t, f.id));
        return f;
      };
      const splatnaStara = new Date(Date.now() - (2 * 365 - 14) * 86400000)
        .toISOString()
        .slice(0, 10);
      const oTyzden = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      await zaloz("stará neuhradená", {
        datum: pred2r,
        splatnost: splatnaStara,
        mena: "EUR",
        suma: 100,
      });
      // ECB: 1,1 USD za 1 € → 110 USD = 100 €.
      await zaloz("USD s kurzom", {
        datum: t.dnes,
        splatnost: oTyzden,
        mena: "USD",
        suma: 110,
        kurz: 1.1,
      });
      await zaloz("USD bez kurzu", { datum: t.dnes, splatnost: oTyzden, mena: "USD", suma: 50 });
    });

    await t.krok("súčty: stará je v pohľadávkach, USD prepočítané, bez kurzu mimo", async () => {
      const po = await suhrn();
      t.over(
        po.neuhradene_pocet === pred.neuhradene_pocet + 2,
        `neuhradených ${pred.neuhradene_pocet} → ${po.neuhradene_pocet}, čakal som +2 (stará + USD s kurzom)`,
      );
      t.over(
        r2(po.neuhradene_suma - pred.neuhradene_suma) === 200,
        `neuhradené +${r2(po.neuhradene_suma - pred.neuhradene_suma)} €, čakal som +200 € (100 + 110 USD / 1,1)`,
      );
      t.over(
        po.po_splatnosti_pocet === pred.po_splatnosti_pocet + 1,
        "stará faktúra po splatnosti chýba",
      );
      t.over(
        po.dlznikov_po_splatnosti === pred.dlznikov_po_splatnosti + 1,
        `dlžníci po splatnosti ${pred.dlznikov_po_splatnosti} → ${po.dlznikov_po_splatnosti}`,
      );
      t.over(po.prepocitane === true, "chýba značka prepočítané");
      const usdPred = Number(pred.bez_prepoctu?.pohladavky?.USD ?? 0);
      const usdPo = Number(po.bez_prepoctu?.pohladavky?.USD ?? 0);
      t.over(r2(usdPo - usdPred) === 50, `bez prepočtu USD ${usdPred} → ${usdPo}, čakal som +50`);
      t.over(
        po.bez_prepoctu.faktury === pred.bez_prepoctu.faktury + 1,
        "počet faktúr bez prepočtu",
      );
    });
  },
};
