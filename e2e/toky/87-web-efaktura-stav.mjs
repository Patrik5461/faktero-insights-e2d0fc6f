/*
  Stav eFaktúry na webe (QA firma Test) — rovnaké pravidlá ako appka (tok 85).

  Nič sa neposiela do Peppolu: tri faktúry sa založia cez REST a k nim riadky
  `efaktura_documents` + `efaktura_deliveries` tak, ako by ich zapísal server
  (bez `provider_message_id`, takže ich nočná úloha nechá na pokoji):
  - zlyhaná — ePošták hlási `deliveryFailure: participant_not_found`, stav
    pritom „pending“ (web ju kedysi ukazoval ako odoslanú),
  - `accepted` — len prevzatie dokladu ePoštákom (web ju kedysi ukazoval ako
    „doručenú“ / „Prijatú“), správne „eFaktúra odoslaná“,
  - zamietnutá odberateľom (`invoiceResponseStatus: RE`).
  Overí sa štítok v zozname faktúr, detail (stav v hlavičke, výrazné
  upozornenie s dôvodom a „Odoslať znova“ — okno sa len otvorí a zavrie),
  Odoslané eFaktúry, Doručenia a zvonček. Faktúry sa na konci zmažú natvrdo
  (doklady eFaktúry aj doručenia idú s nimi — ON DELETE CASCADE).
*/
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";

const PRED_HODINOU = () => new Date(Date.now() - 3600_000).toISOString();

async function zalozFakturu(t, pripona, dorucenie) {
  const cislo = `${t.znacka}-W${pripona}`.slice(-30);
  const f = await t.rest.vloz("invoices", {
    company_id: t.firmy.test,
    invoice_number: cislo,
    type: "regular",
    status: "issued",
    issue_date: t.dnes,
    delivery_date: t.dnes,
    due_date: t.dnes,
    currency: "EUR",
    subtotal: 100,
    vat_total: 23,
    total: 123,
    customer_name: `${t.znacka} eFaktúra web ${pripona}`,
  });
  t.uprac(`faktúra ${cislo}`, () => zmazFakturuNatvrdo(t, f.id));
  const doc = await t.rest.vloz("efaktura_documents", {
    company_id: t.firmy.test,
    invoice_id: f.id,
    document_number: cislo,
    issue_date: t.dnes,
    currency: "EUR",
    total: 123,
    status: "generated",
    format: "peppol_bis_3",
    schema_version: "1.0",
  });
  await t.rest.vloz("efaktura_deliveries", {
    company_id: t.firmy.test,
    document_id: doc.id,
    channel: "peppol",
    provider: "e2e",
    recipient_participant_id: `0245:${cislo}`,
    attempt_count: 1,
    sent_at: PRED_HODINOU(),
    ...dorucenie,
  });
  return { ...f, cislo, docId: doc.id };
}

const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ");

export default {
  popis: "web: stav eFaktúry — zoznam, detail s Odoslať znova, Odoslané, Doručenia, zvonček (Test)",
  limit: 240000,
  async spusti(t) {
    const page = t.page;
    await page.setViewportSize({ width: 1440, height: 900 });

    const [zlyhala, prevzata, zamietnuta] = await t.krok(
      "príprava: 3 faktúry so stavom eFaktúry",
      async () => [
        await zalozFakturu(t, "EFZ", {
          status: "pending",
          raw_response: {
            status: "recipient_not_found",
            deliveryFailure: {
              code: "participant_not_found",
              message: "Recipient is not registered in Peppol",
              errorCode: "PEPPOL_RECIPIENT_NOT_REGISTERED",
              detail: null,
            },
          },
        }),
        await zalozFakturu(t, "EFA", {
          status: "accepted",
          delivered_at: new Date(Date.now() - 3500_000).toISOString(),
          raw_response: { status: "accepted", deliveryFailure: null, invoiceResponseStatus: null },
        }),
        await zalozFakturu(t, "EFR", {
          status: "delivered",
          delivered_at: new Date(Date.now() - 3500_000).toISOString(),
          raw_response: { status: "delivered", deliveryFailure: null, invoiceResponseStatus: "RE" },
        }),
      ],
    );

    await t.krok("zoznam faktúr: štítok podľa spoločného stavu", async () => {
      await t.go(`/faktury?q=${encodeURIComponent(t.znacka)}`);
      const stitok = async (f) => {
        const riadok = page.locator("tr", { hasText: f.cislo }).first();
        await riadok.waitFor({ timeout: 30000 });
        const s = riadok.locator("[data-efaktura-stav]").first();
        await s.waitFor({ timeout: 15000 });
        return {
          stav: await s.getAttribute("data-efaktura-stav"),
          popis: await s.getAttribute("title"),
        };
      };
      const z = await stitok(zlyhala);
      t.over(z.stav === "zlyhala", `zlyhaná má štítok ${z.stav}`);
      t.over(
        /zlyhalo/.test(z.popis ?? "") && /Peppol/.test(z.popis ?? ""),
        `popis zlyhanej: ${z.popis}`,
      );
      const a = await stitok(prevzata);
      t.over(a.stav === "odoslana", `accepted má štítok ${a.stav} (má byť odoslaná)`);
      t.over(
        !/doručená|Prijatá/i.test(a.popis ?? ""),
        `accepted sa tvári ako doručená: ${a.popis}`,
      );
      const r = await stitok(zamietnuta);
      t.over(r.stav === "zamietnuta", `zamietnutá má štítok ${r.stav}`);
    });

    await t.krok("detail zlyhanej: upozornenie s dôvodom a Odoslať znova", async () => {
      await t.go(`/faktury/${zlyhala.id}`);
      const up = page.locator('[data-efaktura-upozornenie="zlyhala"]').first();
      await up.waitFor({ timeout: 30000 });
      const s = await text(up);
      t.over(/Odoslanie eFaktúry zlyhalo/.test(s), `chýba stav: ${s}`);
      t.over(/nie je zaregistrovaný v sieti Peppol/.test(s), `chýba dôvod: ${s}`);
      t.over(!/PEPPOL_RECIPIENT_NOT_REGISTERED/.test(s), "ukazuje technický kód namiesto vety");
      const hlavicka = page.locator('[data-efaktura-stav="zlyhala"]').first();
      t.over(await hlavicka.isVisible(), "hlavička neukazuje zlyhanú eFaktúru");
      t.over(
        (await page.getByRole("button", { name: "Odoslať eFaktúru znova" }).count()) > 0,
        "hlavná akcia nie je „Odoslať eFaktúru znova“",
      );
      // Okno odoslania sa len otvorí a zavrie — nič sa neposiela.
      await up.getByRole("button", { name: "Odoslať znova" }).click();
      const okno = page.getByRole("dialog", { name: "Odoslať eFaktúru" });
      await okno.waitFor({ timeout: 15000 });
      await okno.getByRole("button", { name: "Zrušiť" }).click();
      await okno.waitFor({ state: "hidden", timeout: 10000 });
    });

    await t.krok("detail accepted: odoslaná, bez upozornenia", async () => {
      await t.go(`/faktury/${prevzata.id}`);
      const s = page.locator("[data-efaktura-stav]").first();
      await s.waitFor({ timeout: 30000 });
      t.over(
        (await s.getAttribute("data-efaktura-stav")) === "odoslana",
        "accepted nie je odoslaná",
      );
      t.over((await s.innerText()).includes("eFaktúra odoslaná"), "chýba text „eFaktúra odoslaná“");
      t.over(
        (await page.locator("[data-efaktura-upozornenie]").count()) === 0,
        "accepted má upozornenie",
      );
    });

    await t.krok("detail zamietnutej: upozornenie bez Odoslať znova", async () => {
      await t.go(`/faktury/${zamietnuta.id}`);
      const up = page.locator('[data-efaktura-upozornenie="zamietnuta"]').first();
      await up.waitFor({ timeout: 30000 });
      const s = await text(up);
      t.over(/Odberateľ eFaktúru zamietol/.test(s) && /opravný doklad/.test(s), `zamietnutá: ${s}`);
      t.over(
        (await up.getByRole("button", { name: "Odoslať znova" }).count()) === 0,
        "zamietnutá ponúka Odoslať znova",
      );
    });

    await t.krok("Odoslané eFaktúry: stav doručenia a Odoslať znova", async () => {
      await t.go(`/efaktura/odoslane?q=${encodeURIComponent(t.znacka)}`);
      const riadok = (f) => page.locator("tr", { hasText: f.cislo }).first();
      await riadok(zlyhala).waitFor({ timeout: 30000 });
      const z = await text(riadok(zlyhala));
      t.over(/Odoslanie eFaktúry zlyhalo/.test(z), `Odoslané/zlyhaná: ${z}`);
      t.over(
        (await riadok(zlyhala).getByRole("button", { name: "Odoslať znova" }).count()) === 1,
        "pri zlyhanej chýba Odoslať znova",
      );
      const a = await text(riadok(prevzata));
      t.over(/eFaktúra odoslaná/.test(a) && !/Prijatá|doručená/.test(a), `Odoslané/accepted: ${a}`);
      const r = await text(riadok(zamietnuta));
      t.over(/Odberateľ eFaktúru zamietol/.test(r), `Odoslané/zamietnutá: ${r}`);
    });

    await t.krok("Doručenia: accepted nie je „Prijatá“, zlyhanie nie je „Čaká“", async () => {
      await t.go("/efaktura/dorucenia");
      const riadok = (f) => page.locator("tr", { hasText: `0245:${f.cislo}` }).first();
      await riadok(zlyhala).waitFor({ timeout: 30000 });
      const z = await text(riadok(zlyhala));
      t.over(/Odoslanie eFaktúry zlyhalo/.test(z) && !/Čaká/.test(z), `Doručenia/zlyhaná: ${z}`);
      const a = await text(riadok(prevzata));
      t.over(/eFaktúra odoslaná/.test(a) && !/Prijatá/.test(a), `Doručenia/accepted: ${a}`);
    });

    await t.krok("zvonček upozorní majiteľa na neodoslanú eFaktúru", async () => {
      await page
        .getByRole("button", { name: /^Notifikácie/ })
        .first()
        .click();
      await page
        .getByText(`eFaktúra ${zlyhala.cislo} neodišla`)
        .first()
        .waitFor({ timeout: 20000 });
      await page
        .getByText(`Odberateľ zamietol eFaktúru ${zamietnuta.cislo}`)
        .first()
        .waitFor({ timeout: 5000 });
      t.over(
        (await page.getByText(`eFaktúra ${prevzata.cislo} neodišla`).count()) === 0,
        "zvonček hlási aj odoslanú (accepted)",
      );
      await page.keyboard.press("Escape");
    });
  },
};
