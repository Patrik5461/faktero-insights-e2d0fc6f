/*
  Prílohy nad 20 MB v e-maile (QA firma test2, mail len na QA adresu @faktero.sk):
  čo sa do mailu nezmestí, už sa len nevynechá — príjemca dostane podpísaný
  odkaz na /prilohy/<token> (platí 30 dní).
  - faktúra s prílohami 15 MB + 10 MB, odoslanie s prílohami → hláška o odkaze,
  - odkaz je v zázname o odoslaní (invoice_email_logs.message),
  - verejná stránka bez prihlásenia ukáže len vynechanú prílohu (10 MB), nie
    tú, ktorá v maile bola, a súbor sa dá stiahnuť,
  - pozmenený token stránka odmietne.
  Upratanie zmaže prílohy (aj súbory v úložisku) a faktúru.
*/
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";

const QA = "efaktura-qa@faktero.sk";
const MB = 1024 * 1024;

function subor(meno, bajtov) {
  const riadok = Buffer.from("Faktero E2E príloha — odkaz na stiahnutie.\n");
  const b = Buffer.alloc(bajtov);
  for (let i = 0; i < bajtov; i += riadok.length) riadok.copy(b, i);
  return { name: meno, mimeType: "text/plain", buffer: b };
}

export default {
  popis: "prílohy nad 20 MB: podpísaný odkaz v e-maile a verejná stránka",
  limit: 300000,
  firma: "test2",
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test2;
    const z = t.znacka;

    const fa = await t.krok("príprava: faktúra s položkou", async () => {
      const f = await t.rest.vloz("invoices", {
        company_id: firma,
        invoice_number: `${z}-L1`,
        type: "regular",
        status: "issued",
        issue_date: t.dnes,
        delivery_date: t.dnes,
        due_date: t.dnes,
        currency: "EUR",
        subtotal: 100,
        vat_total: 23,
        total: 123,
        customer_name: `${z} Odberateľ`,
        customer_email: QA,
      });
      t.uprac("faktúra L1", () => zmazFakturuNatvrdo(t, f.id));
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

    const pocetPriloh = () => t.rest.pocet(`invoice_attachments?invoice_id=eq.${fa.id}`);
    await t.krok("prílohy 15 MB a 10 MB", async () => {
      await t.go(`/faktury/${fa.id}`);
      const vstup = page.locator("input[type=file][multiple]").first();
      await vstup.setInputFiles([subor(`${z}-15MB.txt`, 15_000_000)]);
      await t.cakajNa("príloha 15 MB", async () => (await pocetPriloh()) === 1, { limit: 90000 });
      await vstup.setInputFiles([subor(`${z}-10MB.txt`, 10 * MB)]);
      await t.cakajNa("príloha 10 MB", async () => (await pocetPriloh()) === 2, { limit: 90000 });
    });

    const odkaz = await t.krok("odoslanie: nezmestená príloha ide ako odkaz", async () => {
      await t.go(`/faktury/${fa.id}`);
      await page.getByRole("button", { name: "E-mailom", exact: true }).first().click();
      const okno = page.getByRole("dialog", { name: "Odoslať faktúru e-mailom" });
      await okno.waitFor();
      await okno.locator('input[type="email"]').fill(QA);
      const prilohy = okno.getByRole("checkbox");
      if (!(await prilohy.isChecked())) await prilohy.check();
      await okno.getByRole("button", { name: "Odoslať", exact: true }).click();
      await page
        .getByText(/Do mailu sa nezmestili: .*-10MB\.txt — príjemca ich dostal ako odkaz/)
        .first()
        .waitFor({ timeout: 90000 });
      const log = await t.cakajNa("záznam o odoslaní", async () => {
        const r = await t.rest.get(
          `invoice_email_logs?invoice_id=eq.${fa.id}&select=status,recipient_email,message`,
        );
        const l = r.data?.[0];
        return l && l.status !== "pending" ? l : null;
      });
      t.over(log.status === "sent" && log.recipient_email === QA, `odoslanie ${log.status}`);
      const m = /(https:\/\/\S+\/prilohy\/[A-Za-z0-9_-]{40,})/.exec(log.message ?? "");
      t.over(m, "v správe chýba odkaz na prílohy");
      return m[1];
    });

    await t.krok("verejná stránka bez prihlásenia ukáže len vynechanú prílohu", async () => {
      const cesta = new URL(odkaz).pathname;
      const kontext = await page.context().browser().newContext({ locale: "sk-SK" });
      try {
        const p = await kontext.newPage();
        await p.goto(`${t.base}${cesta}`, { waitUntil: "domcontentloaded" });
        await p.getByText(`${z}-10MB.txt`).waitFor({ timeout: 30000 });
        t.over(!(await p.getByText(`${z}-15MB.txt`).count()), "stránka ukazuje aj prílohu z mailu");
        const href = await p.getByRole("link", { name: "Stiahnuť" }).first().getAttribute("href");
        // Len prvý bajt — súbor je v našom úložisku, celých 10 MB netreba.
        const r = await fetch(href, { headers: { range: "bytes=0-0" } });
        await r.arrayBuffer();
        t.over(r.status === 200 || r.status === 206, `stiahnutie ${r.status}`);

        const zly = cesta.slice(0, -3) + (cesta.endsWith("AAA") ? "BBB" : "AAA");
        await p.goto(`${t.base}${zly}`, { waitUntil: "domcontentloaded" });
        await p.getByText("Odkaz nie je platný alebo už vypršal.").waitFor({ timeout: 30000 });
      } finally {
        await kontext.close();
      }
    });
  },
};
