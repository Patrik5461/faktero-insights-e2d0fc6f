/*
  Stráže v databáze okolo dokladov, bez prehliadača (QA firmy test2 a Test):
  - uzamknuté obdobie platí aj na bločky (test2 má uzávierku do 30. 9. 2026):
    spracovaný bloček v ňom sa nedá založiť, zmeniť sumu ani zmazať; zaúčtovanie
    a úhrada ostávajú voľné; nespracovaný bloček sa zámku netýka, kým sa nespracuje;
  - uloz_upravu_faktury odmietne zmazanú faktúru (HTTP 410);
  - zmazaná odoslaná faktúra si číslo podrží, neodoslaná ho uvoľní.
  Upratanie zmaže všetko, čo tok založil.
*/
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";

export default {
  popis: "zámok obdobia na bločkoch, úprava zmazanej faktúry, číslo odoslanej zmazanej faktúry",
  limit: 120000,
  firma: "test2",
  bezPrehliadaca: true,
  async spusti(t) {
    const z = t.znacka;
    const test2 = t.firmy.test2;
    const firmaTest = t.firmy.test;

    const { data: firma } = await t.rest.get(`companies?id=eq.${test2}&select=locked_until`);
    const zamok = firma?.[0]?.locked_until;
    t.over(zamok && zamok >= "2026-09-15", `test2 nemá uzávierku aspoň do 15. 9. 2026 (${zamok})`);
    const vZamku = "2026-09-15";

    t.uprac("bločky", async () => {
      // Spracované v zamknutom období sa zmazať nedajú — najprv späť na nespracované nejde tiež,
      // preto ich tok v zamknutom období ako spracované vôbec nezakladá.
      const r = await t.rest.delete(`expense_documents?company_id=eq.${test2}&note=like.${z}*`);
      if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 160)}`);
    });
    const blocek = (x) =>
      t.rest.post("expense_documents", {
        company_id: test2,
        total_amount: 10,
        payment_method: "karta",
        note: `${z} bloček`,
        ...x,
      });
    const jeZamok = (r) => r.status >= 400 && /uzamknut/i.test(r.text);

    await t.krok("spracovaný bloček do uzavretého obdobia sa nezaloží", async () => {
      const r = await blocek({ status: "processed", issue_date: vZamku });
      t.over(jeZamok(r), `zápis prešiel alebo iná chyba: ${r.status} ${r.text.slice(0, 200)}`);
    });

    await t.krok("nespracovaný bloček áno, spracovať ho už nie, zmazať áno", async () => {
      const r = await blocek({ status: "new", issue_date: vZamku });
      t.over(r.status < 300, `nespracovaný sa nezaložil: ${r.status} ${r.text.slice(0, 200)}`);
      const id = r.data[0].id;
      const sprac = await t.rest.patch(`expense_documents?id=eq.${id}`, { status: "processed" });
      t.over(jeZamok(sprac), `spracovanie prešlo: ${sprac.status} ${sprac.text.slice(0, 200)}`);
      const zmaz = await t.rest.delete(`expense_documents?id=eq.${id}`);
      t.over(
        zmaz.status < 300 && zmaz.data?.length === 1,
        `nespracovaný sa nezmazal: ${zmaz.status}`,
      );
    });

    await t.krok(
      "bloček po uzávierke: zmeniť áno, presunúť do uzavretého obdobia nie",
      async () => {
        const r = await blocek({ status: "processed", issue_date: t.dnes });
        t.over(r.status < 300, `bloček sa nezaložil: ${r.status} ${r.text.slice(0, 200)}`);
        const id = r.data[0].id;
        const suma = await t.rest.patch(`expense_documents?id=eq.${id}`, { total_amount: 11 });
        t.over(
          suma.status < 300,
          `zmena sumy po uzávierke neprešla: ${suma.status} ${suma.text.slice(0, 200)}`,
        );
        const presun = await t.rest.patch(`expense_documents?id=eq.${id}`, { issue_date: vZamku });
        t.over(jeZamok(presun), `presun do zamknutého obdobia prešiel: ${presun.status}`);
        const volne = await t.rest.patch(`expense_documents?id=eq.${id}`, {
          payment_method: "hotovost",
          note: `${z} bloček upravený`,
        });
        t.over(
          volne.status < 300,
          `úhrada/poznámka neprešla: ${volne.status} ${volne.text.slice(0, 200)}`,
        );
      },
    );

    // ---------------------------------------------------------- faktúry (Test)
    const dalsieCislo = async () => {
      const r = await t.rest.rpc("faktero_next_invoice_number", {
        _company_id: firmaTest,
        _issue_date: t.dnes,
        _type: "regular",
      });
      t.over(r.status === 200, `generátor čísla: ${r.status} ${r.text.slice(0, 200)}`);
      return r.data.invoice_number;
    };

    const faktura = await t.krok("zmazaná faktúra na skúšku", async () => {
      const cislo = await dalsieCislo();
      const f = await t.rest.vloz("invoices", {
        company_id: firmaTest,
        invoice_number: cislo,
        issue_date: t.dnes,
        due_date: t.dnes,
        delivery_date: t.dnes,
        customer_name: `${z} Odberateľ`,
        intro_note: `${z} zmazaná`,
        status: "issued",
      });
      t.uprac(`faktúra ${cislo}`, () => zmazFakturuNatvrdo(t, f.id));
      const zmaz = await t.rest.patch(`invoices?id=eq.${f.id}`, {
        deleted_at: new Date().toISOString(),
      });
      t.over(zmaz.status < 300, `mäkké zmazanie: ${zmaz.status}`);
      return f;
    });

    await t.krok("uloz_upravu_faktury odmietne zmazanú faktúru", async () => {
      const r = await t.rest.rpc("uloz_upravu_faktury", {
        p_id: faktura.id,
        p_hlavicka: { notes: `${z} nemá prejsť` },
        p_polozky: [],
        p_povodne_upravena: null,
      });
      t.over(
        r.status === 410 && /zmazaná/.test(r.text),
        `úprava prešla alebo iná chyba: ${r.status} ${r.text.slice(0, 200)}`,
      );
    });

    await t.krok("neodoslaná zmazaná faktúra číslo uvoľní, odoslaná ho podrží", async () => {
      const volne = await dalsieCislo();
      t.over(
        volne === faktura.invoice_number,
        `neodoslaná zmazaná ${faktura.invoice_number} neuvoľnila číslo (generátor dal ${volne})`,
      );
      const odosl = await t.rest.patch(`invoices?id=eq.${faktura.id}`, {
        sent_at: new Date().toISOString(),
      });
      t.over(
        odosl.status < 300,
        `označenie odoslania: ${odosl.status} ${odosl.text.slice(0, 160)}`,
      );
      const dalsie = await dalsieCislo();
      t.over(
        dalsie !== faktura.invoice_number,
        `odoslaná zmazaná faktúra ${faktura.invoice_number} uvoľnila číslo pre ďalšiu`,
      );
    });
  },
};
