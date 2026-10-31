/*
  Pravidlá účtovania a fronta webhookov v databáze (QA firma test2), bez prehliadača:
  - spúšťače: bloček, prijatá faktúra, vystavená faktúra, bankový pohyb „bez dokladu“
    a transakčná daň; druh `null` platí pre bločky aj prijaté, nie pre vystavené,
  - priorita: pravidlo podľa partnera (IČO, názov, VS) má prednosť pred pravidlom podľa
    predmetu mailu aj s menším poradím; medzi partnerskými rozhoduje poradie,
  - pravidlo podľa VS zaberie aj na VS odvodený z čísla faktúry (chyba do 30. 10. 2026),
  - neaktívne pravidlo nič nedoplní, ručne zadaný kód pravidlo neprepíše,
  - „Uplatniť na doklady“ (RPC) doplní pravidlo aj starším dokladom,
  - webhook_outbox: invoice.paid a bank_transaction.created odídu z fronty cronom
    a prijímač, ktorý vracia 404, sa skúša znova podľa rozvrhu (od 31. 10.: 8 pokusov za ~2 dni).
  Upratanie zmaže všetko, čo tok založil.
*/
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";

const WEBHOOK_URL = "https://www.faktero.sk/api/public/e2e-webhook-neexistuje";

export default {
  popis: "pravidlá účtovania (spúšťače, priorita, VS z čísla, banka) a fronta webhookov",
  limit: 240000,
  firma: "test2",
  bezPrehliadaca: true,
  async spusti(t) {
    const firma = t.firmy.test2;
    const z = t.znacka;
    const cislo = String(Date.now()).slice(-7);
    const ico = (n) => `9${cislo}${n}`; // 9 číslic, v registri neexistuje
    const vsPravidla = `7${cislo}`;
    const r2 = (n) => Math.round(n * 100) / 100;

    // ------------------------------------------------------------ upratanie
    const zmaz = async (cesta) => {
      const r = await t.rest.delete(cesta);
      if (r.status >= 300) throw new Error(`${cesta}: ${r.status} ${r.text.slice(0, 160)}`);
    };
    t.uprac("pravidlá a predlohy", async () => {
      await zmaz(`pravidla_uctovania?company_id=eq.${firma}&nazov=like.${z}*`);
      await zmaz(`predlohy_uctovania?company_id=eq.${firma}&nazov=like.${z}*`);
    });
    t.uprac("bločky", () => zmaz(`expense_documents?company_id=eq.${firma}&note=like.${z}*`));
    t.uprac("prijaté faktúry", () =>
      zmaz(`purchase_invoices?company_id=eq.${firma}&supplier_name=like.${z}*`),
    );
    t.uprac("webhook", () => zmaz(`webhooks?company_id=eq.${firma}&url=eq.${WEBHOOK_URL}`));

    const pravidlo = (nazov, x) =>
      t.rest.vloz("pravidla_uctovania", {
        company_id: firma,
        nazov: `${z} ${nazov}`,
        poradie: 100,
        aktivne: true,
        ...x,
      });
    const blocek = (x) =>
      t.rest.vloz("expense_documents", {
        company_id: firma,
        issue_date: t.dnes,
        total_amount: 12.3,
        payment_method: "karta",
        note: `${z} bloček`,
        ...x,
      });
    const prijata = (x) =>
      t.rest.vloz("purchase_invoices", {
        company_id: firma,
        invoice_number: `${z}-${Math.random().toString(36).slice(2, 8)}`,
        issue_date: t.dnes,
        due_date: t.dnes,
        amount_without_vat: 100,
        vat_amount: 23,
        amount_total: 123,
        ...x,
      });

    // ------------------------------------------------------------ pravidlá
    const P = await t.krok("založenie pravidiel všetkých druhov", async () => ({
      blocekIco: await pravidlo("bloček IČO", {
        druh: "blocek",
        dodavatel_ico: ico(1),
        predkontacia: "E2EB",
        pokladna: "E2",
        poznamka: "PHM #MM#/#YYYY#",
      }),
      oboje: await pravidlo("bloček aj prijatá podľa názvu", {
        druh: null,
        dodavatel_text: `${z} Lipa`,
        predkontacia: "E2EN",
      }),
      predmet: await pravidlo("predmet mailu", {
        druh: "prijata",
        predmet_text: `${z}-predmet`,
        predkontacia: "E2EP",
        poradie: 1,
      }),
      dobropis: await pravidlo("dobropis Lipa", {
        druh: "prijata",
        dodavatel_text: `${z} Lipa`,
        typ_dokladu: "credit_note",
        predkontacia: "E2ED",
        poradie: 50,
      }),
      vs: await pravidlo("stály VS", {
        druh: "prijata",
        variabilny_symbol: vsPravidla,
        predkontacia: "E2EVS",
        kv_clenenie: "B2",
      }),
      icoA: await pravidlo("IČO poradie 20", {
        druh: "prijata",
        dodavatel_ico: ico(2),
        predkontacia: "E2EA",
        poradie: 20,
      }),
      icoB: await pravidlo("IČO poradie 10", {
        druh: "prijata",
        dodavatel_ico: ico(2),
        predkontacia: "E2EB2",
        poradie: 10,
      }),
      vystavena: await pravidlo("vystavená IČO", {
        druh: "vystavena",
        dodavatel_ico: ico(3),
        predkontacia: "E2EV",
        clenenie_dph: "UD",
      }),
      neaktivne: await pravidlo("neaktívne", {
        druh: "blocek",
        dodavatel_ico: ico(4),
        predkontacia: "E2EX",
        aktivne: false,
      }),
      banka: await pravidlo("banka bez dokladu", {
        druh: "banka",
        bez_dokladu: true,
        dodavatel_text: `${z} Poplatok`,
        smer: "vydaj",
        poznamka: "Vedenie účtu #MM#",
      }),
    }));

    // ------------------------------------------------------------ bločky
    await t.krok("bloček: pravidlo podľa IČO doplní kódy, pokladňu a poznámku", async () => {
      const d = await blocek({ supplier_ico: ico(1), supplier_name: `${z} Pumpa` });
      t.over(d.pravidlo_id === P.blocekIco.id, `pravidlo ${d.pravidlo_id}`);
      t.over(d.pohoda_predkontacia === "E2EB", `predkontácia ${d.pohoda_predkontacia}`);
      t.over(d.pohoda_pokladna === "E2", `pokladňa ${d.pohoda_pokladna}`);
      const mm = t.dnes.slice(5, 7);
      const rok = t.dnes.slice(0, 4);
      t.over(String(d.note ?? "").includes(`PHM ${mm}/${rok}`), `poznámka s premennými: ${d.note}`);
    });
    await t.krok("bloček: pravidlo bez druhu (bločky aj prijaté) podľa názvu", async () => {
      const d = await blocek({ supplier_name: `${z} Lipa s.r.o.` });
      t.over(d.pravidlo_id === P.oboje.id, `pravidlo ${d.pravidlo_id}`);
    });
    await t.krok("bloček: ručne zadaný kód pravidlo neprepíše", async () => {
      const d = await blocek({ supplier_ico: ico(1), pohoda_predkontacia: "RUCNE" });
      t.over(d.pravidlo_id === P.blocekIco.id, `pravidlo ${d.pravidlo_id}`);
      t.over(d.pohoda_predkontacia === "RUCNE", `predkontácia ${d.pohoda_predkontacia}`);
    });
    await t.krok("bloček: neaktívne pravidlo nezaberie", async () => {
      const d = await blocek({ supplier_ico: ico(4) });
      t.over(!d.pravidlo_id && !d.pohoda_predkontacia, `pravidlo ${d.pravidlo_id}`);
    });

    // ------------------------------------------------------------ prijaté
    await t.krok("prijatá: partner (názov) má prednosť pred predmetom s poradím 1", async () => {
      const d = await prijata({ supplier_name: `${z} Lipa s.r.o.`, predmet_mailu: `${z}-predmet` });
      t.over(d.pravidlo_id === P.oboje.id, `vybralo ${d.pravidlo_id}, čakal som „podľa názvu“`);
      const e = await prijata({ supplier_name: `${z} Iný`, predmet_mailu: `Fa ${z}-predmet` });
      t.over(e.pravidlo_id === P.predmet.id, `predmet: ${e.pravidlo_id}`);
      t.over(e.pohoda_predkontacia === "E2EP", `predkontácia ${e.pohoda_predkontacia}`);
    });
    await t.krok("prijatá: dobropis dostane pravidlo pre typ dobropis", async () => {
      const d = await prijata({
        supplier_name: `${z} Lipa s.r.o.`,
        amount_without_vat: -10,
        vat_amount: -2.3,
        amount_total: -12.3,
        opravuje_cislo: "FA-1",
      });
      t.over(d.pravidlo_id === P.dobropis.id, `dobropis: ${d.pravidlo_id}`);
    });
    await t.krok("prijatá: z dvoch pravidiel na to isté IČO vyhrá menšie poradie", async () => {
      const d = await prijata({ supplier_name: `${z} Dodávateľ`, supplier_ico: ico(2) });
      t.over(d.pravidlo_id === P.icoB.id, `vybralo ${d.pohoda_predkontacia}`);
    });
    await t.krok("prijatá: pravidlo podľa VS zaberie aj na VS z čísla faktúry", async () => {
      const d = await prijata({ supplier_name: `${z} Nájom`, invoice_number: vsPravidla });
      t.over(d.variable_symbol === vsPravidla, `VS ${d.variable_symbol}`);
      t.over(d.pravidlo_id === P.vs.id, "VS odvodený z čísla pravidlo nevidel");
      t.over(d.kv_clenenie === "B2", `KV ${d.kv_clenenie}`);
      const e = await prijata({
        supplier_name: `${z} Nájom 2`,
        variable_symbol: `00${vsPravidla}`,
      });
      t.over(e.pravidlo_id === P.vs.id, "VS s úvodnými nulami");
    });
    await t.krok(
      "prijatá: zmena dodávateľa na doklade bez pravidla ho dodatočne doplní",
      async () => {
        const d = await prijata({ supplier_name: `${z} Zatiaľ nikto` });
        t.over(!d.pravidlo_id, "bez pravidla");
        const r = await t.rest.patch(`purchase_invoices?id=eq.${d.id}`, { supplier_ico: ico(2) });
        t.over(r.status < 300, `úprava ${r.status}`);
        t.over(r.data?.[0]?.pravidlo_id === P.icoB.id, `po úprave ${r.data?.[0]?.pravidlo_id}`);
      },
    );

    // ------------------------------------------------------------ vystavené
    await t.krok("vystavená: pravidlo pre vystavené, bločkové na ňu nesadne", async () => {
      const mk = async (cust, cislo) => {
        const f = await t.rest.vloz("invoices", {
          company_id: firma,
          invoice_number: `${z}-${cislo}`,
          type: "regular",
          status: "issued",
          issue_date: t.dnes,
          delivery_date: t.dnes,
          due_date: t.dnes,
          currency: "EUR",
          subtotal: 100,
          vat_total: 23,
          total: 123,
          customer_name: cust.name,
          customer_ico: cust.ico,
        });
        t.uprac(`faktúra ${cislo}`, () => zmazFakturuNatvrdo(t, f.id));
        return f;
      };
      const f = await mk({ name: `${z} Odberateľ`, ico: ico(3) }, "V1");
      t.over(f.pravidlo_id === P.vystavena.id, `vystavená: ${f.pravidlo_id}`);
      t.over(
        f.pohoda_predkontacia === "E2EV" && f.pohoda_clenenie_dph === "UD",
        `kódy ${f.pohoda_predkontacia}/${f.pohoda_clenenie_dph}`,
      );
      const g = await mk({ name: `${z} Lipa s.r.o.`, ico: ico(1) }, "V2");
      t.over(!g.pravidlo_id, `na vystavenú zabralo ${g.pravidlo_id}`);
      return f;
    });

    // ------------------------------------------------------------ uplatnenie spätne
    await t.krok("„Uplatniť na doklady“ doplní pravidlo aj staršiemu dokladu", async () => {
      const d = await blocek({ supplier_ico: ico(5), supplier_name: `${z} Starý` });
      t.over(!d.pravidlo_id, "bloček nemal mať pravidlo");
      const p = await pravidlo("dodatočné", {
        druh: "blocek",
        dodavatel_ico: ico(5),
        predkontacia: "E2ES",
      });
      const r = await t.rest.rpc("uplatni_pravidla_uctovania", { _company: firma });
      t.over(r.status === 200 && Number(r.data) >= 1, `RPC ${r.status} ${r.text.slice(0, 120)}`);
      const po = (
        await t.rest.get(`expense_documents?id=eq.${d.id}&select=pravidlo_id,pohoda_predkontacia`)
      ).data?.[0];
      t.over(
        po?.pravidlo_id === p.id && po?.pohoda_predkontacia === "E2ES",
        `po RPC ${JSON.stringify(po)}`,
      );
    });

    await t.krok("predloha zaúčtovania sa uloží a prečíta", async () => {
      const p = await t.rest.vloz("predlohy_uctovania", {
        company_id: firma,
        nazov: `${z} predloha`,
        druh: "prijata",
        predkontacia: "E2EPR",
        poradie: 100,
      });
      t.over(p?.id, "predloha");
    });

    // ------------------------------------------------------------ banka + webhooky
    const hook = await t.krok(
      "webhook na udalosti invoice.paid a bank_transaction.created",
      async () =>
        t.rest.vloz("webhooks", {
          company_id: firma,
          url: WEBHOOK_URL,
          events: ["invoice.paid", "bank_transaction.created"],
          active: true,
        }),
    );

    const ucet = await t.krok("bankový účet (nahraný výpis)", async () => {
      const spojenie = await t.rest.vloz("bank_connections", {
        company_id: firma,
        provider: "import",
        status: "connected",
        metadata: { zdroj: "e2e" },
      });
      t.uprac("bankové spojenie", () => zmaz(`bank_connections?id=eq.${spojenie.id}`));
      const u = await t.rest.vloz("bank_accounts", {
        company_id: firma,
        bank_connection_id: spojenie.id,
        iban: `E2E${cislo}`,
        account_name: `${z} účet`,
        currency: "EUR",
      });
      t.uprac("bankový účet a pohyby", async () => {
        await zmaz(`bank_transactions?bank_account_id=eq.${u.id}`);
        await zmaz(`bank_accounts?id=eq.${u.id}`);
      });
      return u;
    });

    const pohyby = await t.krok("pohyb podľa pravidla „bez dokladu“ a transakčná daň", async () => {
      const pohyb = (x) =>
        t.rest.vloz("bank_transactions", {
          company_id: firma,
          bank_account_id: ucet.id,
          booking_date: t.dnes,
          currency: "EUR",
          transaction_reference: `e2e:${cislo}:${Math.random().toString(36).slice(2)}`,
          ...x,
        });
      const a = await pohyb({
        amount: -4.5,
        counterparty: `${z} Poplatok banke`,
        description: "Poplatok",
      });
      t.over(a.vybavenie === "bez_dokladu", `vybavenie ${a.vybavenie}`);
      t.over(a.vybavenie_pravidlo_id === P.banka.id, "iné pravidlo");
      t.over(
        a.vybavenie_poznamka === `Vedenie účtu ${t.dnes.slice(5, 7)}`,
        `poznámka ${a.vybavenie_poznamka}`,
      );
      // Príjem od tej istej protistrany pravidlo pre výdaj nevybaví.
      const b = await pohyb({
        amount: 4.5,
        counterparty: `${z} Poplatok banke`,
        description: "vrátenie",
      });
      t.over(!b.vybavenie, `príjem vybavený: ${b.vybavenie}`);
      const c = await pohyb({
        amount: -0.4,
        counterparty: "Tatra banka",
        description: "Transakčná daň 30.09.2026",
      });
      t.over(c.vybavenie === "transakcna_dan", `daň: ${c.vybavenie}`);
      return [a, b, c];
    });

    const faktura = await t.krok("faktúra uhradená → udalosť invoice.paid", async () => {
      const f = await t.rest.vloz("invoices", {
        company_id: firma,
        invoice_number: `${z}-W1`,
        type: "regular",
        status: "issued",
        issue_date: t.dnes,
        delivery_date: t.dnes,
        due_date: t.dnes,
        currency: "EUR",
        subtotal: r2(50 / 1.23),
        vat_total: r2(50 - 50 / 1.23),
        total: 50,
        customer_name: `${z} Platiteľ`,
      });
      t.uprac("faktúra W1", () => zmazFakturuNatvrdo(t, f.id));
      const r = await t.rest.patch(`invoices?id=eq.${f.id}`, {
        status: "paid",
        paid_at: new Date().toISOString(),
      });
      t.over(r.status < 300, `úhrada ${r.status} ${r.text.slice(0, 120)}`);
      return f;
    });

    await t.krok("cron doručí z fronty obe udalosti, po 404 naplánuje ďalší pokus", async () => {
      const logy = await t.cakajNa(
        "záznamy v webhook_delivery_logs",
        async () => {
          const r = await t.rest.get(
            `webhook_delivery_logs?webhook_id=eq.${hook.id}&select=event_type,status,attempt_count,response_status,error_message,payload,next_attempt_at`,
          );
          const l = r.data ?? [];
          const zaplatena = l.find(
            (x) => x.event_type === "invoice.paid" && x.payload?.data?.invoice_id === faktura.id,
          );
          const pohyb = l.find(
            (x) =>
              x.event_type === "bank_transaction.created" && x.payload?.data?.id === pohyby[0].id,
          );
          return zaplatena && pohyb && zaplatena.status !== "pending" && pohyb.status !== "pending"
            ? { zaplatena, pohyb }
            : null;
        },
        { limit: 150000, krok: 5000 },
      );
      for (const l of [logy.zaplatena, logy.pohyb]) {
        // Po prvom zlyhaní sa nevzdá — ďalší pokus o ~1 min (webhook-opakovanie.ts).
        t.over(l.status === "retrying", `${l.event_type}: stav ${l.status}`);
        t.over(l.attempt_count >= 1, `${l.event_type}: pokusov ${l.attempt_count}`);
        t.over(
          l.next_attempt_at && Date.parse(l.next_attempt_at) > Date.now() - 120000,
          `${l.event_type}: chýba ďalší pokus (${l.next_attempt_at})`,
        );
        t.over(
          l.response_status === 404 || l.error_message,
          `${l.event_type}: odpoveď ${l.response_status}`,
        );
      }
      t.over(Number(logy.zaplatena.payload.data.total) === 50, "suma v payload");
      t.over(
        logy.pohyb.payload.data.amount === -4.5,
        `pohyb v payload ${logy.pohyb.payload.data.amount}`,
      );
    });
  },
};
