/*
  E-maily z aplikácie v QA firme test2 — všetko ide len na QA adresu @faktero.sk:
  - prílohy faktúry: súbor nad 15 MiB sa odmietne, 15 MB prejde, desiata príloha je
    posledná; do mailu sa zmestí najviac 20 MB príloh, zvyšok sa vynechá a stránka to povie,
  - odoslanie faktúry (invoice_email_logs = sent, faktúra „odoslaná“),
  - upomienka k faktúre po splatnosti (invoice_reminders = sent),
  - cenová ponuka (quote_email_logs = sent),
  - pozvánka do firmy (company_invitations) a jej zrušenie,
  - vlastný SMTP: vnútorný server (localhost) sa odmietne a nič sa nezapne.
  Upratanie zmaže prílohy (aj súbory v úložisku), faktúru, ponuku, pozvánku a SMTP.
*/
import { akciaVMenu, zmazFakturuNatvrdo } from "../lib/doklady.mjs";

const QA = "efaktura-qa@faktero.sk";
const MB = 1024 * 1024;

/** Textový súbor danej veľkosti (obsah nehrá rolu, typ sa berie z prípony). */
function subor(meno, bajtov) {
  const riadok = Buffer.from("Faktero E2E príloha — výkaz prác.\n");
  const b = Buffer.alloc(bajtov);
  for (let i = 0; i < bajtov; i += riadok.length) riadok.copy(b, i);
  return { name: meno, mimeType: "text/plain", buffer: b };
}

export default {
  popis: "e-maily: prílohy (15 MB / 10 ks / 20 MB), faktúra, upomienka, ponuka, pozvánka, SMTP",
  limit: 300000,
  firma: "test2",
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test2;
    const z = t.znacka;
    const den = t.dnes;
    const pred10 = new Date(Date.parse(den) - 10 * 86400000).toISOString().slice(0, 10);
    const pozvany = `efaktura-qa+${z.toLowerCase()}@faktero.sk`;

    // ------------------------------------------------------------ príprava
    const fa = await t.krok("príprava: faktúra po splatnosti s položkou", async () => {
      const f = await t.rest.vloz("invoices", {
        company_id: firma,
        invoice_number: `${z}-M1`,
        type: "regular",
        status: "issued",
        issue_date: den,
        delivery_date: den,
        due_date: pred10,
        currency: "EUR",
        subtotal: 100,
        vat_total: 23,
        total: 123,
        customer_name: `${z} Odberateľ`,
        customer_email: QA,
      });
      t.uprac("faktúra M1", () => zmazFakturuNatvrdo(t, f.id));
      await t.rest.vloz("invoice_items", {
        invoice_id: f.id,
        name: "Konzultácia",
        quantity: 1,
        unit_price: 100,
        vat_rate: 23,
        subtotal: 100,
        vat_amount: 23,
        total: 123,
        position: 0,
      });
      return f;
    });

    // Súbory v úložisku sa so zmazaním faktúry nezmažú — preto cez rozhranie.
    t.uprac("prílohy faktúry", async () => {
      const r = await t.rest.get(`invoice_attachments?invoice_id=eq.${fa.id}&select=id,name`);
      if (!r.data?.length) return;
      await t.go(`/faktury/${fa.id}`);
      for (const p of r.data) {
        await page
          .getByRole("button", { name: `Zmazať ${p.name}` })
          .first()
          .click();
        await t.potvrd(page);
        await t.cakajNa(`zmazaná ${p.name}`, async () => {
          const x = await t.rest.get(`invoice_attachments?id=eq.${p.id}&select=id`);
          return x.data?.length === 0;
        });
      }
    });

    const nahraj = async (subory) => {
      await page.locator("input[type=file][multiple]").first().setInputFiles(subory);
    };
    const pocetPriloh = () => t.rest.pocet(`invoice_attachments?invoice_id=eq.${fa.id}`);

    // ------------------------------------------------------------ prílohy
    await t.krok("príloha nad 15 MiB sa odmietne už v prehliadači", async () => {
      await t.go(`/faktury/${fa.id}`);
      await nahraj([subor(`${z}-velka.txt`, 15 * MB + 1)]);
      await page
        .getByText(/súbor je väčší než 15 MB/)
        .first()
        .waitFor({ timeout: 15000 });
      t.over((await pocetPriloh()) === 0, "veľká príloha sa uložila");
    });

    // 15 MB = 15 000 000 B: v base64 je to 20 000 000 znakov, pod stropom nginx 20 MiB.
    // (Súbor s 15 MiB nginx odmietal kódom 413 — strop je od 30. 10. 2026 desiatkový.)
    await t.krok("príloha s 15 MB prejde (strop servera aj nginx)", async () => {
      await nahraj([subor(`${z}-15MB.txt`, 15_000_000)]);
      await t.cakajNa("príloha 15 MB", async () => (await pocetPriloh()) === 1, { limit: 90000 });
    });

    await t.krok("ďalšia príloha 10 MB sa uloží (spolu 25 MB)", async () => {
      await nahraj([subor(`${z}-10MB.txt`, 10 * MB)]);
      await t.cakajNa("príloha 10 MB", async () => (await pocetPriloh()) === 2, { limit: 90000 });
    });

    await t.krok("odoslanie faktúry s prílohami: čo sa nezmestí do 20 MB, sa vynechá", async () => {
      await t.go(`/faktury/${fa.id}`);
      await page.getByRole("button", { name: "E-mailom", exact: true }).first().click();
      const okno = page.getByRole("dialog", { name: "Odoslať faktúru e-mailom" });
      await okno.waitFor();
      await okno.locator('input[type="email"]').fill(QA);
      const prilohy = okno.getByRole("checkbox");
      if (!(await prilohy.isChecked())) await prilohy.check();
      await okno.getByRole("button", { name: "Odoslať", exact: true }).click();
      // Dátum vystavenia je dnešný, okno so zmenou dátumu nevyskočí.
      await page
        .getByText(/Do mailu sa nezmestili: .*-10MB\.txt/)
        .first()
        .waitFor({ timeout: 90000 });
      const log = await t.cakajNa("záznam o odoslaní", async () => {
        const r = await t.rest.get(
          `invoice_email_logs?invoice_id=eq.${fa.id}&select=status,recipient_email,provider_message_id,error_message`,
        );
        const l = r.data?.[0];
        return l && l.status !== "pending" ? l : null;
      });
      t.over(log.status === "sent", `stav ${log.status} ${log.error_message ?? ""}`);
      t.over(log.recipient_email === QA && log.provider_message_id, "adresát alebo id z Resendu");
      const f = (await t.rest.get(`invoices?id=eq.${fa.id}&select=status,sent_at`)).data[0];
      t.over(f.status === "sent" && f.sent_at, `faktúra po odoslaní: ${f.status}`);
    });

    await t.krok("najviac 10 príloh na doklad", async () => {
      await t.go(`/faktury/${fa.id}`);
      const male = Array.from({ length: 9 }, (_, i) => subor(`${z}-maly-${i + 1}.txt`, 2000));
      await nahraj(male);
      await page
        .getByText(/najviac 10 súborov/)
        .first()
        .waitFor({ timeout: 60000 });
      await t.cakajNa("10 príloh", async () => (await pocetPriloh()) === 10, { limit: 30000 });
    });

    // ------------------------------------------------------------ upomienka
    await t.krok("upomienka k faktúre po splatnosti odíde", async () => {
      await t.go(`/faktury/${fa.id}`);
      await akciaVMenu(page, "Poslať upomienku");
      const okno = page.getByRole("dialog", { name: "Poslať upomienku" });
      await okno.waitFor();
      await okno.locator("input").first().fill(QA);
      await okno.getByRole("button", { name: "Odoslať upomienku" }).click();
      const u = await t.cakajNa(
        "upomienka",
        async () => {
          const r = await t.rest.get(
            `invoice_reminders?invoice_id=eq.${fa.id}&select=status,email_to,reminder_number,error_message`,
          );
          return r.data?.[0] ?? null;
        },
        { limit: 60000 },
      );
      t.over(u.status === "sent", `upomienka ${u.status} ${u.error_message ?? ""}`);
      t.over(u.email_to === QA && u.reminder_number === 1, `upomienka ${JSON.stringify(u)}`);
    });

    // ------------------------------------------------------------ ponuka
    await t.krok("cenová ponuka odíde e-mailom", async () => {
      const q = await t.rest.vloz("quotes", {
        company_id: firma,
        quote_number: `${z}-P1`,
        issue_date: den,
        valid_until: den,
        currency: "EUR",
        subtotal: 100,
        vat_total: 23,
        total: 123,
        customer_name: `${z} Odberateľ`,
        customer_email: QA,
      });
      t.uprac("ponuka", async () => {
        const r = await t.rest.delete(`quotes?id=eq.${q.id}`);
        if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 160)}`);
      });
      await t.rest.vloz("quote_items", {
        quote_id: q.id,
        name: "Návrh",
        quantity: 1,
        unit_price: 100,
        vat_rate: 23,
        total: 123,
        position: 0,
      });
      await t.go(`/ponuky/${q.id}`);
      await page.getByRole("button", { name: "Poslať e-mailom" }).first().click();
      const okno = page.getByRole("dialog", { name: "Odoslať ponuku e-mailom" });
      await okno.waitFor();
      await okno.locator("input").first().fill(QA);
      await okno.getByRole("button", { name: "Odoslať", exact: true }).click();
      const l = await t.cakajNa(
        "záznam ponuky",
        async () => {
          const r = await t.rest.get(
            `quote_email_logs?quote_id=eq.${q.id}&select=status,recipient_email,error_message`,
          );
          const x = r.data?.[0];
          return x && x.status !== "pending" ? x : null;
        },
        { limit: 60000 },
      );
      t.over(l.status === "sent", `ponuka ${l.status} ${l.error_message ?? ""}`);
    });

    // ------------------------------------------------------------ samofaktúra
    await t.krok("samofaktúra odíde dodávateľovi na odsúhlasenie", async () => {
      const sf = await t.rest.vloz("purchase_invoices", {
        company_id: firma,
        samofakturacia: true,
        invoice_number: `${z}-SF1`,
        issue_date: den,
        delivery_date: den,
        due_date: den,
        supplier_name: `${z} Dodávateľ samofaktúry`,
        supplier_ico: "99999990",
        currency: "EUR",
        items: [{ name: "Služby za október", quantity: 1, unit_price: 100, vat_rate: 0 }],
        amount_without_vat: 100,
        vat_amount: 0,
        amount_total: 100,
      });
      t.uprac("samofaktúra", async () => {
        const r = await t.rest.delete(`purchase_invoices?id=eq.${sf.id}`);
        if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 160)}`);
      });
      await t.go(`/prijate-faktury/${sf.id}`);
      // Panel je v rozložení dvakrát (široké/úzke) — berie sa viditeľný.
      await page
        .locator('label:has-text("E-mail dodávateľa") input[type="email"]:visible')
        .first()
        .fill(QA);
      await page.locator("button:visible", { hasText: "Poslať na odsúhlasenie" }).first().click();
      await page.getByText(`Poslané na ${QA}`).first().waitFor({ timeout: 60000 });
      const po = (
        await t.rest.get(
          `purchase_invoices?id=eq.${sf.id}&select=samofakturacia_stav,samofakturacia_token,supplier_email`,
        )
      ).data?.[0];
      t.over(
        po?.samofakturacia_stav === "caka" && po.samofakturacia_token && po.supplier_email === QA,
        `samofaktúra po odoslaní ${JSON.stringify(po)}`,
      );
    });

    // ------------------------------------------------------------ pozvánka
    await t.krok("pozvánka do firmy odíde a dá sa zrušiť", async () => {
      t.uprac("pozvánka", () =>
        t.rest.delete(
          `company_invitations?company_id=eq.${firma}&email=eq.${encodeURIComponent(pozvany)}`,
        ),
      );
      await t.go("/firma");
      await page.getByPlaceholder("kolega@firma.sk").fill(pozvany);
      await page.getByRole("button", { name: "Pozvať používateľa" }).click();
      await page.getByText(`Pozvánka odoslaná na ${pozvany}`).first().waitFor({ timeout: 60000 });
      const p = await t.rest.get(
        `company_invitations?company_id=eq.${firma}&email=eq.${encodeURIComponent(pozvany)}&select=id,role,accepted_at`,
      );
      t.over(
        p.data?.length === 1 && p.data[0].role === "employee",
        `pozvánka ${p.text.slice(0, 160)}`,
      );
    });

    // ------------------------------------------------------------ vlastný SMTP
    await t.krok("vlastný SMTP: vnútorný server sa odmietne a nezapne", async () => {
      t.uprac("SMTP nastavenie", async () => {
        await t.go("/firma");
        const zmaz = page.getByRole("button", { name: "Zmazať", exact: true });
        if (await zmaz.count()) {
          await zmaz.first().click();
          await t.potvrd(page);
          await page.getByText("Nastavenie zmazané").first().waitFor({ timeout: 15000 });
        }
      });
      await t.go("/firma");
      await page.getByPlaceholder("faktury@vasafirma.sk").fill(QA);
      await page.getByPlaceholder("smtp.vasafirma.sk").fill("localhost");
      await page.getByRole("button", { name: "Uložiť a otestovať" }).click();
      await page
        .getByText(/nie je verejná adresa/)
        .first()
        .waitFor({ timeout: 30000 });
      await page.getByText("vypnuté", { exact: true }).first().waitFor({ timeout: 15000 });
    });
  },
};
