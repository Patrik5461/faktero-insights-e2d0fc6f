/*
  Prijaté eFaktúry v mobilnej appke (QA firma test2):
  - dlaždica „Prijaté eFaktúry na zaevidovanie“ na Prehľade vedie na obrazovku
    Prijaté eFaktúry, v bočnom paneli je vstup s rovnakým menom;
  - v zozname je eFaktúra s dodávateľom, číslom, sumou a štítkom „Nová“;
  - detail ukáže náhľad dokladu (PDF vykreslené z UBL, pdf.js do plátna);
  - „Zaevidovať“ jedným ťuknutím založí prijatú faktúru tou istou serverovou
    funkciou ako web (source = efaktura) a štítok sa prepne na „Zaevidovaná“.

  Nič sa neposiela do Peppolu: eFaktúra sa podvrhne priamo do
  `efaktura_received_documents` (XML skopírované z inej doručenej eFaktúry
  test2, s vlastným číslom). `upozornenie_odoslane_at` je vyplnené hneď, aby
  firme neodišiel e-mail o novej eFaktúre. Na konci sa zmaže prijatá faktúra
  (len tá, ktorú tok založil — so svojím číslom a zdrojom efaktura), jej PDF
  v úložisku a podvrhnutý riadok.
  So `E2E_SNIMKY=<priečinok>` uloží snímky na 390 px (zoznam, detail, panel).
*/
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { otvorApku, tlacidlo, tukni, zalozka } from "../lib/apka.mjs";

async function snimka(page, meno) {
  const kam = process.env.E2E_SNIMKY;
  if (!kam) return;
  mkdirSync(kam, { recursive: true });
  await page.screenshot({ path: path.join(kam, `86-${meno}.png`), fullPage: true });
}

export default {
  popis: "appka: Prijaté eFaktúry — dlaždica, panel, náhľad a zaevidovanie jedným ťuknutím",
  limit: 240000,
  async spusti(t) {
    const firma = t.firmy.test2;
    const cislo = `${t.znacka.replace(/[^\w]/g, "")}EF`.slice(-20);
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

    const zamen = (s) =>
      String(s)
        .split(`>${vzor.document_number}<`)
        .join(`>${cislo}<`)
        .split(`>${vzor.sender_name}<`)
        .join(`>${dodavatel}<`);
    const prijata = await t.krok("príprava: podvrhnutá prijatá eFaktúra", () =>
      t.rest.vloz("efaktura_received_documents", {
        company_id: firma,
        sender_name: dodavatel,
        sender_participant_id: "0245:0000000000",
        document_number: cislo,
        issue_date: t.dnes,
        due_date: t.dnes,
        currency: vzor.currency ?? "EUR",
        total: vzor.total,
        vat_total: vzor.vat_total,
        xml_payload: zamen(vzor.xml_payload),
        // Vlastné id správy — kópia vzorového by narazila na jedinečný index
        // efaktura_received_sprava_uniq (company_id, providerMessageId).
        parsed_data: {
          ...(vzor.parsed_data ?? {}),
          providerMessageId: `e2e-${t.znacka}-${randomUUID()}`,
        },
        status: "parsed",
        // Firme nesmie odísť e-mail o „novej“ eFaktúre.
        upozornenie_odoslane_at: new Date().toISOString(),
      }),
    );
    t.uprac("podvrhnutá eFaktúra a prijatá faktúra z nej", async () => {
      const f = await t.rest.get(
        `purchase_invoices?company_id=eq.${firma}&invoice_number=eq.${encodeURIComponent(cislo)}&source=eq.efaktura&select=id,file_path`,
      );
      await t.rest.patch(`efaktura_received_documents?id=eq.${prijata.id}`, {
        matched_supplier_invoice_id: null,
      });
      for (const x of f.data ?? []) {
        if (x.file_path) await t.rest.zmazSubory("purchase-invoices", [x.file_path]);
        const d = await t.rest.delete(`purchase_invoices?id=eq.${x.id}`);
        if (d.status >= 300)
          throw new Error(`prijatá faktúra: ${d.status} ${d.text.slice(0, 200)}`);
      }
      const r = await t.rest.delete(`efaktura_received_documents?id=eq.${prijata.id}`);
      if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
    });

    const page = await otvorApku(t, { firma: "test2" });

    await t.krok("Prehľad: dlaždica vedie na Prijaté eFaktúry", async () => {
      const riadok = tlacidlo(page, /Prijaté eFaktúry na zaevidovanie/);
      await riadok.waitFor({ timeout: 30000 });
      await tukni(riadok);
      await page.locator("[data-efaktury-prijate]").waitFor({ timeout: 20000 });
    });

    await t.krok("zoznam: dodávateľ, číslo, suma a štítok Nová", async () => {
      const r = tlacidlo(page, new RegExp(cislo));
      await r.waitFor({ timeout: 30000 });
      const text = (await r.innerText()).replace(/\s+/g, " ");
      t.over(text.includes(dodavatel), `v riadku chýba dodávateľ: ${text}`);
      t.over(/Nová/.test(text), `riadok nie je „Nová“: ${text}`);
      t.over(/€/.test(text), `v riadku chýba suma: ${text}`);
      const posun = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      t.over(posun <= 1, `zoznam je širší ako okno o ${posun} px`);
      await snimka(page, "zoznam");
      await tukni(r);
    });

    await t.krok("detail: náhľad dokladu sa vykreslí", async () => {
      await page.locator("[data-efaktura-detail]").waitFor({ timeout: 20000 });
      await page.locator("[data-efaktura-detail] canvas").first().waitFor({ timeout: 60000 });
      const text = await page.locator("[data-efaktura-detail]").innerText();
      t.over(!/nepodarilo/i.test(text), `náhľad zlyhal: ${text.slice(0, 300)}`);
      await snimka(page, "detail");
    });

    await t.krok("Zaevidovať jedným ťuknutím → prijatá faktúra", async () => {
      await tukni(tlacidlo(page, /^Zaevidovať$/));
      // Riadok z podvrhnutého XML môže mať chyby kontroly — vtedy appka pýta potvrdenie.
      const ajTak = page.getByRole("button", { name: "Zaevidovať aj tak" });
      if (await ajTak.isVisible({ timeout: 1500 }).catch(() => false)) await ajTak.click();
      await page
        .getByText(/Zaevidované ako prijatá|Odložené do Nespracovaných/)
        .first()
        .waitFor({
          timeout: 40000,
        });
      const r = (
        await t.rest.get(
          `efaktura_received_documents?id=eq.${prijata.id}&select=matched_supplier_invoice_id,nespracovany_id,status`,
        )
      ).data?.[0];
      t.over(
        !!r?.matched_supplier_invoice_id,
        `eFaktúra nemá prijatú faktúru: ${JSON.stringify(r)}`,
      );
      const f = (
        await t.rest.get(
          `purchase_invoices?id=eq.${r?.matched_supplier_invoice_id}&select=invoice_number,source,supplier_name`,
        )
      ).data?.[0];
      t.over(f?.source === "efaktura", `prijatá faktúra nemá zdroj efaktura: ${JSON.stringify(f)}`);
      t.over(f?.invoice_number === cislo, `iné číslo prijatej faktúry: ${f?.invoice_number}`);
      await page.getByText("Otvoriť v prijatých faktúrach").first().waitFor({ timeout: 10000 });
      await snimka(page, "zaevidovana");
    });

    await t.krok("bočný panel: vstup Prijaté eFaktúry", async () => {
      await zalozka(page, -1);
      const p = page.getByRole("dialog").getByRole("button", { name: /^Prijaté eFaktúry$/ });
      await p.waitFor({ timeout: 10000 });
      await snimka(page, "panel");
      await p.click();
      await page.locator("[data-efaktury-prijate]").waitFor({ timeout: 20000 });
    });
  },
};
