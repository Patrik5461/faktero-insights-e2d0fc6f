/*
  Nespracovaný doklad na telefóne 390 px (QA firma Test), klasický aj kompaktný
  vzhľad: stránka nie je širšia ako okno a tlačidlo AI na konci stránky nekryje
  žiadny ovládač.

  Príčina pôvodnej chyby: tabuľka položiek má `min-w-[30rem]` v posúvacom obale
  a skrytý popis stĺpca „Akcie“ (sr-only, position: absolute) sa oň neopieral —
  obal ho neorezal a stránka mala scrollWidth 481 px. Preto tu treba aspoň
  jednu položku. Doklad sa založí cez REST a na konci zmaže; QA účtu sa
  vzhľad vráti.
*/
import { metadataUctu } from "./64-nahlad-strana.mjs";
import { posuvStranky, prekryteAi } from "./70-mobil-ai-hlavicka.mjs";
import { prihlasRest, qaHeslo } from "../lib/prostredie.mjs";

export default {
  popis: "nespracovaný doklad na 390 px: bez posuvu do strany, AI nekryje ovládače",
  limit: 180000,
  async spusti(t) {
    const firma = t.firmy.test;
    const cislo = `${t.znacka}-NM`.slice(-30);
    const doklad = await t.krok("príprava: nespracovaný doklad s položkami", () =>
      t.rest.vloz("nespracovane_doklady", {
        company_id: firma,
        zdroj: "nahratie",
        stav: "vytazene",
        druh: "faktura",
        udaje: {
          cislo,
          dodavatel: { nazov: `${t.znacka} Dodávateľ s.r.o.`, ico: "", dic: "", icDph: "" },
          datumVystavenia: t.dnes,
          mena: "EUR",
          celkom: 24.6,
          rozpis: [{ sadzba: 23, zaklad: 20, dph: 4.6 }],
          polozky: [
            {
              name: "Kancelársky papier A4",
              quantity: 2,
              unit: "ks",
              unit_price: 5,
              vat_rate: 23,
              total: 12.3,
            },
            {
              name: "Toner do tlačiarne",
              quantity: 1,
              unit: "ks",
              unit_price: 10,
              vat_rate: 23,
              total: 12.3,
            },
          ],
        },
      }),
    );
    t.uprac("nespracovaný doklad", () => t.rest.delete(`nespracovane_doklady?id=eq.${doklad.id}`));

    const { jwt } = await prihlasRest(qaHeslo());
    const m = await metadataUctu(jwt);
    t.uprac("vzhľad v účte", () =>
      metadataUctu(jwt, {
        dizajn: m.dizajn ?? null,
        vzhlad_nespracovanych: m.vzhlad_nespracovanych ?? null,
      }),
    );

    for (const vzhlad of ["klasicky", "kompaktny"]) {
      await t.krok(`${vzhlad}: bez posuvu do strany, AI nič nekryje`, async () => {
        await metadataUctu(jwt, {
          dizajn: vzhlad === "kompaktny" ? "kompaktny" : "faktero",
          vzhlad_nespracovanych: vzhlad,
        });
        const page = await t.novaStranka({ mobil: true });
        await page.context().addInitScript(
          (d) => {
            try {
              localStorage.setItem("faktero.dizajn", d);
            } catch {
              /* bez úložiska */
            }
          },
          vzhlad === "kompaktny" ? "kompaktny" : "faktero",
        );
        await t.go(`/nespracovane/${doklad.id}`, page);
        await page
          .getByText("Kancelársky papier A4")
          .first()
          .waitFor({ timeout: 30000 })
          .catch(() => {});
        await page
          .locator('input[value="Kancelársky papier A4"]')
          .first()
          .waitFor({ timeout: 30000 })
          .catch(() => {});
        await page.waitForTimeout(1000);
        const posuv = await posuvStranky(page);
        t.over(posuv <= 1, `stránka je širšia ako okno o ${posuv} px`);
        const r = await prekryteAi(page, []);
        if (r.ai) t.over(!r.zle.length, `AI tlačidlo kryje: ${r.zle.join(", ")}`);
      });
    }
  },
};
