/*
  Stav eFaktúry v mobilnej appke (QA firma Test, 390 px).

  Nič sa neposiela do Peppolu: tri faktúry sa založia cez REST a k nim riadky
  `efaktura_documents` + `efaktura_deliveries` tak, ako by ich zapísal server
  po odoslaní a doťahovaní stavu (bez `provider_message_id`, takže ich nočná
  úloha nechá na pokoji):
  - doručená (delivered),
  - zlyhaná — ePošták hlási `deliveryFailure: participant_not_found`, stav
    pritom vyzerá ako „pending“ (to by sa inak tvárilo ako odoslaná),
  - zamietnutá odberateľom (`invoiceResponseStatus: RE`).
  Overí sa odznak v zozname, filtre „eFaktúra: odoslané / chyba“, sekcia v
  detaile (stav, dôvod ľudskou rečou, čas, kanál) a bez signálu posledný
  známy stav z pamäte s poznámkou. Faktúry sa na konci zmažú natvrdo (doklady
  eFaktúry idú s nimi — ON DELETE CASCADE).
  So `E2E_SNIMKY=<priečinok>` uloží snímky zoznamu a detailov.
*/
import { mkdirSync } from "node:fs";
import path from "node:path";
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";
import { otvorApku, tlacidlo, tukni, zalozka } from "../lib/apka.mjs";

const PRED_HODINOU = () => new Date(Date.now() - 3600_000).toISOString();

async function zalozFakturu(t, pripona, dorucenie) {
  const cislo = `${t.znacka}-${pripona}`.slice(-30);
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
    customer_name: `${t.znacka} eFaktúra ${pripona}`,
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
    recipient_participant_id: "0245:0000000000",
    attempt_count: 1,
    sent_at: PRED_HODINOU(),
    ...dorucenie,
  });
  return { ...f, cislo };
}

/** Riadok zoznamu podľa čísla faktúry a stav jeho odznaku (alebo null). */
async function odznak(page, cislo) {
  const riadok = page.getByRole("button", { name: new RegExp(cislo) }).first();
  await riadok.waitFor({ timeout: 20000 });
  return riadok
    .locator("[data-efaktura-stav]")
    .first()
    .getAttribute("data-efaktura-stav", { timeout: 2000 })
    .catch(() => null);
}

async function hladaj(page, text) {
  const pole = page.getByPlaceholder(/Hľadať číslo alebo odberateľa|^Hľadať$/).first();
  if (!(await pole.isVisible().catch(() => false))) await tlacidlo(page, /^Hľadať$/).click();
  await pole.fill(text);
}

async function otvorDetail(page, cislo) {
  await tukni(page.getByRole("button", { name: new RegExp(cislo) }).first());
  await page.locator("[data-efaktura-sekcia]").first().waitFor({ timeout: 20000 });
  // Sekcia sa po otvorení dopýta čerstvý stav — chvíľu počkať, kým dobehne.
  await page.waitForTimeout(1200);
  return (await page.locator("[data-efaktura-sekcia]").first().innerText()).replace(/\s+/g, " ");
}

export default {
  popis:
    "appka: stav eFaktúry v zozname a detaile vystavených, filter, posledný známy stav offline",
  limit: 240000,
  async spusti(t) {
    const snimky = process.env.E2E_SNIMKY || null;
    if (snimky) mkdirSync(snimky, { recursive: true });
    const snimka = async (page, meno) => {
      if (snimky)
        await page.screenshot({ path: path.join(snimky, `85-${meno}.png`), fullPage: true });
    };

    const [dorucena, zlyhala, zamietnuta] = await t.krok(
      "príprava: 3 faktúry so stavom eFaktúry",
      async () => [
        await zalozFakturu(t, "EFD", {
          status: "delivered",
          delivered_at: new Date(Date.now() - 3500_000).toISOString(),
          raw_response: { status: "delivered", deliveryFailure: null, invoiceResponseStatus: null },
        }),
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
        await zalozFakturu(t, "EFR", {
          status: "delivered",
          delivered_at: new Date(Date.now() - 3500_000).toISOString(),
          raw_response: { status: "delivered", deliveryFailure: null, invoiceResponseStatus: "RE" },
        }),
      ],
    );

    const page = await otvorApku(t);

    await t.krok("zoznam: odznak eFaktúry pri každej faktúre", async () => {
      await zalozka(page, 1);
      await hladaj(page, t.znacka);
      t.over(
        (await odznak(page, dorucena.cislo)) === "dorucena",
        "doručená nemá odznak „dorucena“",
      );
      t.over((await odznak(page, zlyhala.cislo)) === "zlyhala", "zlyhaná nemá odznak „zlyhala“");
      t.over(
        (await odznak(page, zamietnuta.cislo)) === "zamietnuta",
        "zamietnutá nemá odznak „zamietnuta“",
      );
      const popis = await page
        .locator('[data-efaktura-stav="zlyhala"]')
        .first()
        .getAttribute("aria-label");
      t.over(/zlyhalo/.test(popis ?? ""), `odznak nemá popis pre čítačku: ${popis}`);
      await snimka(page, "zoznam");
    });

    await t.krok("filter eFaktúra: chyba / odoslané", async () => {
      const chip = (meno) => page.getByRole("button", { name: meno, exact: true }).first();
      await tukni(chip("eFaktúra: chyba"));
      await page.waitForTimeout(500);
      const vidno = async (c) =>
        page
          .getByRole("button", { name: new RegExp(c) })
          .first()
          .isVisible()
          .catch(() => false);
      t.over(await vidno(zlyhala.cislo), "filter chyba: chýba zlyhaná");
      t.over(await vidno(zamietnuta.cislo), "filter chyba: chýba zamietnutá");
      t.over(!(await vidno(dorucena.cislo)), "filter chyba: ukazuje doručenú");
      await snimka(page, "filter-chyba");
      await tukni(chip("eFaktúra: odoslané"));
      await page.waitForTimeout(500);
      t.over(await vidno(dorucena.cislo), "filter odoslané: chýba doručená");
      t.over(!(await vidno(zlyhala.cislo)), "filter odoslané: ukazuje zlyhanú");
      await tukni(chip("Všetky"));
    });

    await t.krok("detail: zlyhaná s dôvodom ľudskou rečou", async () => {
      const text = await otvorDetail(page, zlyhala.cislo);
      t.over(/Odoslanie eFaktúry zlyhalo/.test(text), `chýba stav: ${text}`);
      t.over(/nie je zaregistrovaný v sieti Peppol/.test(text), `chýba dôvod: ${text}`);
      t.over(/Kanál\s*Peppol/.test(text), `chýba kanál: ${text}`);
      t.over(/Odoslaná\s*\d/.test(text), `chýba čas odoslania: ${text}`);
      t.over(!/PEPPOL_RECIPIENT_NOT_REGISTERED/.test(text), "ukazuje technický kód namiesto vety");
      await snimka(page, "detail-zlyhala");
      await tukni(tlacidlo(page, /^Späť$/));
    });

    await t.krok("detail: doručená a zamietnutá odberateľom", async () => {
      const d = await otvorDetail(page, dorucena.cislo);
      t.over(/eFaktúra doručená/.test(d) && /Doručená\s*\d/.test(d), `doručená: ${d}`);
      await snimka(page, "detail-dorucena");
      await tukni(tlacidlo(page, /^Späť$/));
      const z = await otvorDetail(page, zamietnuta.cislo);
      t.over(/Odberateľ eFaktúru zamietol/.test(z), `zamietnutá: ${z}`);
      t.over(/opravný doklad/.test(z), `zamietnutá bez rady: ${z}`);
      await snimka(page, "detail-zamietnuta");
      await tukni(tlacidlo(page, /^Späť$/));
    });

    await t.krok("bez signálu: posledný známy stav s poznámkou", async () => {
      const ctx = page.context();
      await ctx.setOffline(true);
      try {
        // Znovu otvorený zoznam sa vezme z pamäte telefónu.
        await zalozka(page, 0);
        await zalozka(page, 1);
        await hladaj(page, t.znacka);
        t.over(
          (await odznak(page, zlyhala.cislo)) === "zlyhala",
          "bez signálu zmizol odznak zlyhanej",
        );
        let text = await otvorDetail(page, zlyhala.cislo);
        /* Poznámka má byť hneď (appka sa bez signálu nepýta) — najviac 3 s.
           Dlhšie čakanie by zakrylo opakovanie dotazu v postgrest (~7 s). */
        await page
          .locator("[data-efaktura-sekcia]")
          .getByText(/Bez pripojenia — posledný známy stav/)
          .first()
          .waitFor({ timeout: 3000 })
          .catch(() => {});
        text = (await page.locator("[data-efaktura-sekcia]").first().innerText()).replace(
          /\s+/g,
          " ",
        );
        t.over(/Odoslanie eFaktúry zlyhalo/.test(text), `offline bez stavu: ${text}`);
        t.over(/Bez pripojenia — posledný známy stav/.test(text), `offline bez poznámky: ${text}`);
        await snimka(page, "detail-offline");
      } finally {
        await ctx.setOffline(false);
      }
    });
  },
};
