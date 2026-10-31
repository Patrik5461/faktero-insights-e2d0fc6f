/*
  Opakované doručenie webhookov (QA firma test2), bez posielania von:
  webhook mieri na doménu `.invalid`, ktorá sa podľa RFC 2606 nikdy nepreloží —
  pokus skončí na DNS, žiadna požiadavka neodíde.

  - faktúra prejde na „uhradená“ → spúšťač zapíše invoice.paid do fronty, cron
    (každú minútu) ho skúsi doručiť, pokus zlyhá a záznam čaká na ďalší pokus
    o ~1 min (stav „retrying“, nie koniec po troch pokusoch ako predtým),
  - v Nastaveniach → Webhooky je história so stavom „Opakuje sa“ a tlačidlom
    „Poslať znova“; to pridá pokus do toho istého záznamu (rovnaký
    Idempotency-Key) a ďalší pokus posunie podľa rozvrhu (5 min),
  Vzdanie po 8 pokusoch (~45 h) a zvonček pokrývajú unit testy
  (webhook-opakovanie.test.ts).
  Upratanie zmaže webhook (aj s históriou doručení) a faktúru.
*/
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";

const ADRESA = "https://faktero-e2e-webhook.invalid/hook";

export default {
  popis: "webhooky: opakovanie s odstupom, história, Poslať znova",
  limit: 300000,
  firma: "test2",
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test2;
    const z = t.znacka;

    const hook = await t.krok("príprava: webhook na neexistujúcu adresu", async () => {
      const h = await t.rest.vloz("webhooks", {
        company_id: firma,
        url: ADRESA,
        secret: `whsec_e2e_${z}`,
        events: ["invoice.paid"],
        active: true,
      });
      t.uprac("webhook", async () => {
        const r = await t.rest.delete(`webhooks?id=eq.${h.id}`);
        if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 160)}`);
      });
      return h;
    });

    await t.krok("úhrada faktúry založí doručenie, ktoré čaká na ďalší pokus", async () => {
      const f = await t.rest.vloz("invoices", {
        company_id: firma,
        invoice_number: `${z}-W1`,
        type: "regular",
        status: "issued",
        issue_date: t.dnes,
        delivery_date: t.dnes,
        due_date: t.dnes,
        currency: "EUR",
        subtotal: 10,
        vat_total: 0,
        total: 10,
        customer_name: `${z} Odberateľ`,
      });
      t.uprac("faktúra W1", () => zmazFakturuNatvrdo(t, f.id));
      const u = await t.rest.patch(`invoices?id=eq.${f.id}`, {
        status: "paid",
        paid_at: new Date().toISOString(),
      });
      t.over(u.status < 300, `úhrada ${u.status} ${u.text.slice(0, 160)}`);
    });

    const log = await t.krok("cron skúsil doručiť, zlyhalo a naplánoval ďalší pokus", async () => {
      const l = await t.cakajNa(
        "záznam doručenia po prvom pokuse",
        async () => {
          const r = await t.rest.get(
            `webhook_delivery_logs?webhook_id=eq.${hook.id}&select=*&order=created_at.desc&limit=1`,
          );
          const x = r.data?.[0];
          return x && x.attempt_count >= 1 && x.status !== "pending" ? x : null;
        },
        { limit: 150000, krok: 3000 },
      );
      t.over(l.status === "retrying", `stav ${l.status} (čakal som retrying) ${l.error_message}`);
      t.over(l.event_type === "invoice.paid", `udalosť ${l.event_type}`);
      t.over(l.error_message, "chýba dôvod zlyhania");
      t.over(l.next_attempt_at, "chýba čas ďalšieho pokusu");
      const za = Date.parse(l.next_attempt_at) - Date.parse(l.last_attempt_at ?? l.created_at);
      t.over(za > 30_000 && za < 30 * 60_000, `ďalší pokus o ${Math.round(za / 1000)} s`);
      t.over(!l.response_status, `odpoveď ${l.response_status} — požiadavka nemala odísť`);
      return l;
    });

    await t.krok("história v nastaveniach a Poslať znova", async () => {
      await t.go("/webhooky");
      const riadok = page.locator(`[data-dorucenie="${log.id}"]`);
      await riadok.waitFor({ timeout: 20000 });
      await riadok.getByText("Opakuje sa").waitFor();
      const pred = (await t.rest.get(`webhook_delivery_logs?id=eq.${log.id}&select=attempt_count`))
        .data[0].attempt_count;
      await riadok.getByRole("button", { name: "Poslať znova" }).click();
      await page
        .getByText(/Zlyhalo|práve prebieha/)
        .first()
        .waitFor({ timeout: 30000 });
      const po = await t.cakajNa("pokus zapísaný", async () => {
        const r = await t.rest.get(`webhook_delivery_logs?id=eq.${log.id}&select=*`);
        const x = r.data?.[0];
        return x && x.attempt_count > pred && !x.sending_until ? x : null;
      });
      t.over(po.status === "retrying", `po Poslať znova: ${po.status}`);
      const za = Date.parse(po.next_attempt_at) - Date.parse(po.last_attempt_at);
      t.over(za >= 4 * 60_000, `ďalší pokus o ${Math.round(za / 1000)} s (čakal som ~5 min)`);
      // Jeden záznam na udalosť — opakovanie nezakladá nové riadky (rovnaký Idempotency-Key).
      const pocet = await t.rest.pocet(`webhook_delivery_logs?webhook_id=eq.${hook.id}`);
      t.over(pocet === 1, `záznamov doručenia ${pocet}`);
    });

    await t.krok("celá história ukazuje stav Opakuje sa", async () => {
      await page.getByRole("link", { name: "Celá história doručení" }).click();
      await page.waitForURL(/webhooky-logy/);
      await page.getByText("Opakuje sa").first().waitFor({ timeout: 20000 });
    });
  },
};
