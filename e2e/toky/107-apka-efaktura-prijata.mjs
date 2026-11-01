/*
  „eFaktúra prijatá“ pri prijatých faktúrach v mobilnej appke (QA firma test2, 390 px).

  Obdoba toku 85 (stav odoslanej eFaktúry) pre prijaté doklady:
  - v zozname Doklady → Prijaté faktúry má faktúra z eFaktúry odznak
    „eFaktúra prijatá“ (tu s chybami kontroly → červený), obyčajná nemá;
  - filter „eFaktúra: prijaté“ ukáže len faktúry z eFaktúry;
  - detail má sekciu eFaktúry: od koho, Peppol ID, kanál, kedy prišla a kedy
    sa zaevidovala, výsledok automatickej kontroly s kódom pravidla;
  - „Zobraziť pôvodnú eFaktúru“ otvorí náhľad (PDF vykreslené z UBL);
  - bez signálu ostane posledný známy stav z pamäte s poznámkou.

  Nič sa neposiela do Peppolu ani nezaevidúva: prijatá faktúra sa založí cez
  REST (source = efaktura) a k nej riadok `efaktura_received_documents` s
  väzbou `matched_supplier_invoice_id` tak, ako ho zapíše zaevidovanie. XML je
  skopírované z inej doručenej eFaktúry test2, s vlastným číslom a vlastným
  `providerMessageId` (jedinečný index efaktura_received_sprava_uniq).
  `upozornenie_odoslane_at` je vyplnené hneď, aby firme neodišiel e-mail.
  Upratanie (aj po páde): podvrhnutý riadok eFaktúry a obe prijaté faktúry.
  So `E2E_SNIMKY=<priečinok>` uloží snímky na 390 px.
*/
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { otvorApku, tlacidlo, tukni, zalozka } from "../lib/apka.mjs";
import { prijataCezRest } from "../lib/zauctovanie.mjs";

async function snimka(page, meno) {
  const kam = process.env.E2E_SNIMKY;
  if (!kam) return;
  mkdirSync(kam, { recursive: true });
  await page.screenshot({ path: path.join(kam, `107-${meno}.png`), fullPage: true });
}

const PRED_HODINOU = () => new Date(Date.now() - 3600_000).toISOString();

export default {
  popis: "appka: eFaktúra prijatá — odznak, filter, sekcia v detaile, náhľad a offline",
  limit: 240000,
  async spusti(t) {
    const firma = t.firmy.test2;
    const cislo = `${t.znacka.replace(/[^\w]/g, "")}EFR`.slice(-20);
    const cisloObycajnej = `${t.znacka.replace(/[^\w]/g, "")}OBY`.slice(-20);
    const dodavatel = `${t.znacka} eDodávateľ s.r.o.`;

    const vzor = await t.krok("príprava: XML doručenej eFaktúry test2", async () => {
      const r = await t.rest.get(
        `efaktura_received_documents?company_id=eq.${firma}&xml_payload=not.is.null&document_number=not.is.null&select=document_number,sender_name,xml_payload,total,vat_total,currency,parsed_data&order=received_at.desc&limit=1`,
      );
      const v = r.data?.[0];
      t.over(!!v, "test2 nemá žiadnu doručenú eFaktúru s XML — nie je z čoho podvrhnúť");
      return v;
    });
    if (!vzor) return;

    // Prijaté faktúry: jedna z eFaktúry, jedna obyčajná (ručne). Upratanie zaregistruje helper.
    const zEfaktury = await t.krok("príprava: prijatá faktúra z eFaktúry", () =>
      prijataCezRest(
        t,
        { invoice_number: cislo, supplier_name: dodavatel, source: "efaktura" },
        "test2",
      ),
    );
    const obycajna = await t.krok("príprava: obyčajná prijatá faktúra", () =>
      prijataCezRest(
        t,
        { invoice_number: cisloObycajnej, supplier_name: `${t.znacka} Ručný dodávateľ` },
        "test2",
      ),
    );

    const zamen = (s) =>
      String(s)
        .split(`>${vzor.document_number}<`)
        .join(`>${cislo}<`)
        .split(`>${vzor.sender_name}<`)
        .join(`>${dodavatel}<`);
    const prijata = await t.krok("príprava: podvrhnutá eFaktúra s väzbou na faktúru", () =>
      t.rest.vloz("efaktura_received_documents", {
        company_id: firma,
        channel: "peppol",
        sender_name: dodavatel,
        sender_participant_id: "0245:0000000000",
        document_number: cislo,
        issue_date: t.dnes,
        due_date: t.dnes,
        currency: vzor.currency ?? "EUR",
        total: vzor.total,
        vat_total: vzor.vat_total,
        xml_payload: zamen(vzor.xml_payload),
        parsed_data: {
          ...(vzor.parsed_data ?? {}),
          providerMessageId: `e2e-${t.znacka}-${randomUUID()}`,
        },
        status: "matched",
        matched_supplier_invoice_id: zEfaktury.id,
        received_at: PRED_HODINOU(),
        processed_at: new Date().toISOString(),
        kontrola_chyby: 1,
        kontrola_varovania: 1,
        skontrolovane_at: PRED_HODINOU(),
        kontrola_vysledok: {
          verzia: 1,
          platny: false,
          orezane: 0,
          pocetChyb: 1,
          pocetVarovani: 1,
          pocetPravidiel: 153,
          nalezy: [
            {
              kod: "BR-CO-15",
              zavaznost: "chyba",
              oblast: "en16931",
              popis: "Celková suma s DPH sa nerovná súčtu základu a DPH.",
              parametre: {},
            },
            {
              kod: "PEPPOL-EN16931-R003",
              zavaznost: "varovanie",
              oblast: "peppol",
              popis: "Chýba odkaz na objednávku.",
              parametre: {},
            },
          ],
        },
        // Firme nesmie odísť e-mail o „novej“ eFaktúre.
        upozornenie_odoslane_at: new Date().toISOString(),
      }),
    );
    // Registrované po faktúrach → upratuje sa skôr (opačné poradie).
    t.uprac("podvrhnutá prijatá eFaktúra", async () => {
      const r = await t.rest.delete(`efaktura_received_documents?id=eq.${prijata.id}`);
      if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
    });

    const page = await otvorApku(t, { firma: "test2" });
    const riadok = (c) => page.getByRole("button", { name: new RegExp(c) }).first();
    const chip = (meno) => page.getByRole("button", { name: meno, exact: true }).first();
    const hladaj = async () => {
      const pole = page.getByPlaceholder("Hľadať dodávateľa, číslo alebo VS");
      await pole.waitFor({ timeout: 30000 });
      await pole.fill(t.znacka);
      await page.waitForTimeout(400);
    };
    const doPrijatych = async () => {
      await zalozka(page, 3);
      await tukni(chip("Prijaté faktúry"));
      await hladaj();
    };

    await t.krok("zoznam: odznak eFaktúra prijatá len pri faktúre z eFaktúry", async () => {
      await doPrijatych();
      await riadok(cislo).waitFor({ timeout: 30000 });
      const odznak = riadok(cislo).locator("[data-efaktura-prijata]");
      t.over((await odznak.count()) === 1, "faktúra z eFaktúry nemá odznak");
      t.over(
        (await odznak.getAttribute("data-efaktura-prijata")) === "chyby",
        "odznak nie je červený, hoci kontrola našla chybu",
      );
      const popis = await odznak.getAttribute("aria-label");
      t.over(/eFaktúra prijatá/.test(popis ?? ""), `odznak nemá popis pre čítačku: ${popis}`);
      t.over(
        (await riadok(cisloObycajnej).locator("[data-efaktura-prijata]").count()) === 0,
        "obyčajná prijatá faktúra má odznak eFaktúry",
      );
      const posun = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      t.over(posun <= 1, `zoznam je širší ako okno o ${posun} px`);
      await snimka(page, "zoznam");
    });

    await t.krok("filter eFaktúra: prijaté", async () => {
      await tukni(chip("eFaktúra: prijaté"));
      await page.waitForTimeout(500);
      const vidno = async (c) =>
        riadok(c)
          .isVisible()
          .catch(() => false);
      t.over(await vidno(cislo), "filter: chýba faktúra z eFaktúry");
      t.over(!(await vidno(cisloObycajnej)), "filter: ukazuje obyčajnú faktúru");
      await snimka(page, "filter");
      await tukni(chip("Všetky"));
    });

    const sekcia = page.locator("[data-efaktura-prijata-sekcia]").first();
    const textSekcie = async () => (await sekcia.innerText()).replace(/\s+/g, " ");

    await t.krok("detail: od koho, kanál, časy a výsledok kontroly", async () => {
      await tukni(riadok(cislo));
      await sekcia.waitFor({ timeout: 20000 });
      // Kontrola s kódom pravidla príde až s dopytom pri otvorení.
      await sekcia.getByText("BR-CO-15").first().waitFor({ timeout: 20000 });
      const text = await textSekcie();
      t.over(/eFaktúra prijatá/.test(text), `chýba nadpis stavu: ${text}`);
      t.over(text.includes(dodavatel), `chýba odosielateľ: ${text}`);
      t.over(/0245:0000000000/.test(text), `chýba Peppol ID: ${text}`);
      t.over(/Kanál Peppol cez ePoštáka/.test(text), `chýba kanál: ${text}`);
      t.over(/Prišla \d/.test(text), `chýba čas príchodu: ${text}`);
      t.over(/Zaevidovaná \d/.test(text), `chýba čas zaevidovania: ${text}`);
      t.over(/našla chyby \(1\) a varovania \(1\)/.test(text), `chýba výsledok kontroly: ${text}`);
      const posun = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      t.over(posun <= 1, `detail je širší ako okno o ${posun} px`);
      await sekcia.scrollIntoViewIfNeeded();
      await snimka(page, "detail");
    });

    await t.krok("náhľad pôvodnej eFaktúry", async () => {
      await tukni(tlacidlo(page, /^Zobraziť pôvodnú eFaktúru$/));
      await page.locator("[data-efaktura-detail]").waitFor({ timeout: 20000 });
      await page.locator("[data-efaktura-detail] canvas").first().waitFor({ timeout: 60000 });
      const text = await page.locator("[data-efaktura-detail]").innerText();
      t.over(!/nepodarilo/i.test(text), `náhľad zlyhal: ${text.slice(0, 300)}`);
      t.over(
        !(await tlacidlo(page, /^Zaevidovať$/)
          .isVisible()
          .catch(() => false)),
        "zaevidovaná eFaktúra ponúka Zaevidovať",
      );
      await snimka(page, "nahlad");
      await tukni(tlacidlo(page, /^Späť$/));
      await sekcia.waitFor({ timeout: 10000 });
    });

    await t.krok("bez signálu: posledný známy stav s poznámkou", async () => {
      const ctx = page.context();
      await ctx.setOffline(true);
      try {
        // Návrat zo zoznamu ho načíta znova — bez signálu z pamäte telefónu.
        await tukni(tlacidlo(page, /^Späť$/));
        // Zoznam z pamäte telefónu ohlási hláška (dotaz na server zlyhal).
        await page
          .getByText(/zobrazené naposledy načítané prijaté faktúry/)
          .first()
          .waitFor({ timeout: 30000 });
        await hladaj();
        await riadok(cislo).waitFor({ timeout: 30000 });
        t.over(
          (await riadok(cislo).locator("[data-efaktura-prijata]").count()) === 1,
          "bez signálu zmizol odznak",
        );
        await tukni(riadok(cislo));
        await sekcia.waitFor({ timeout: 20000 });
        await sekcia
          .getByText(/Bez pripojenia — posledný známy stav z \d/)
          .first()
          .waitFor({ timeout: 5000 })
          .catch(() => {});
        const text = await textSekcie();
        t.over(text.includes(dodavatel), `offline bez údajov eFaktúry: ${text}`);
        t.over(
          /Bez pripojenia — posledný známy stav z \d/.test(text),
          `offline bez poznámky (s časom uloženia zoznamu): ${text}`,
        );
        await snimka(page, "detail-offline");
      } finally {
        await ctx.setOffline(false);
      }
    });
  },
};
