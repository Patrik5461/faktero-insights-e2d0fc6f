/*
  Verejné API v1: dočasný kľúč QA firmy (zakladá sa tak ako na stránke API
  kľúčov — insert cez RLS prihláseného používateľa), faktúra so zľavou,
  s prenesením a v cudzej mene, predvolená mena a sadzba českej firmy,
  testovací kľúč len na čítanie, cudzia firma, neplatné id a zlá metóda.
  Nič neposiela von; faktúry aj kľúče sa po toku zmažú.
*/
import { createHash, randomBytes } from "node:crypto";
import { BASE, CUDZIA_FIRMA } from "../lib/prostredie.mjs";
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";

async function novyKluc(t, firma, mode) {
  const kluc = `fk_${mode}_` + randomBytes(24).toString("hex");
  const r = await t.rest.post("api_keys", {
    company_id: firma,
    mode,
    name: `E2E API ${mode}`,
    prefix: kluc.slice(0, 14),
    key_hash: createHash("sha256").update(kluc).digest("hex"),
  });
  t.over(
    r.status < 300 && r.data?.[0]?.id,
    `kľúč sa nezaložil: ${r.status} ${r.text.slice(0, 160)}`,
  );
  const id = r.data[0].id;
  t.uprac(`kľúč ${mode}`, async () => {
    await t.rest.delete(`api_keys?id=eq.${id}`);
  });
  return kluc;
}

function klient(kluc) {
  return async (metoda, cesta, telo, hlavicky = {}) => {
    const r = await fetch(`${BASE}/api/v1${cesta}`, {
      method: metoda,
      headers: {
        authorization: `Bearer ${kluc}`,
        "content-type": "application/json",
        ...hlavicky,
      },
      body: telo === undefined ? undefined : JSON.stringify(telo),
    });
    const text = await r.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* nie JSON */
    }
    return { status: r.status, data, text };
  };
}

export default {
  popis: "API v1: zľava, prenesenie, cudzia mena, CZ predvolené, test kľúč, chyby",
  bezPrehliadaca: true,
  limit: 120000,
  async spusti(t) {
    const live = klient(await novyKluc(t, t.firmy.test2, "live"));
    const test = klient(await novyKluc(t, t.firmy.test2, "test"));
    const cz = klient(await novyKluc(t, t.firmy.cz, "live"));
    const vystav = async (api, telo) => {
      const r = await api("POST", "/invoices", telo);
      t.over(r.status === 201, `faktúra sa nevystavila: ${r.status} ${r.text.slice(0, 200)}`);
      t.uprac(`faktúra ${r.data.invoice_number}`, () => zmazFakturuNatvrdo(t, r.data.id));
      return r.data;
    };

    await t.krok("testovací kľúč len číta", async () => {
      t.over((await test("GET", "/invoices?limit=1")).status === 200, "testovací kľúč nečíta");
      const r = await test("POST", "/customers", { name: "E2E nesmie vzniknúť" });
      t.over(r.data?.error?.code === "test_key_read_only", `zápis testovacím kľúčom: ${r.status}`);
    });

    await t.krok("cudzia firma cez X-Company → 403", async () => {
      const r = await live(
        "POST",
        "/customers",
        { name: "E2E cudzia" },
        { "x-company": CUDZIA_FIRMA },
      );
      t.over(r.status === 403, `zápis do cudzej firmy vrátil ${r.status}`);
    });

    await t.krok("neplatné id → 404, zlá metóda → 405", async () => {
      const a = await live("GET", "/invoices/nie-uuid/pdf");
      t.over(a.status === 404 && a.data?.error?.code === "not_found", `neplatné id: ${a.status}`);
      const b = await live("DELETE", "/invoices");
      t.over(
        b.status === 405 && b.data?.error?.code === "method_not_allowed",
        `metóda: ${b.status}`,
      );
    });

    await t.krok("zľava riadku aj na doklad", async () => {
      const f = await vystav(live, {
        customer: { name: "E2E API zľava" },
        discount_type: "amount",
        discount_value: 10,
        items: [
          { name: "So zľavou", quantity: 1, unit_price: 100, vat_rate: 23, discount_percent: 10 },
        ],
      });
      t.over(
        Number(f.subtotal) === 80 &&
          Number(f.vat_total) === 18.4 &&
          Number(f.discount_total) === 10,
        `zľava: ${f.subtotal}/${f.vat_total}/${f.discount_total}`,
      );
    });

    await t.krok("prenesenie daňovej povinnosti", async () => {
      const f = await vystav(live, {
        customer: { name: "E2E API PDP", ic_dph: "SK2020123456" },
        reverse_charge: true,
        items: [{ name: "Stavebné práce", quantity: 1, unit_price: 1000, vat_rate: 23 }],
      });
      t.over(
        f.reverse_charge === true &&
          f.reverse_charge_type === "domestic_69" &&
          Number(f.vat_total) === 0,
        `PDP: ${f.reverse_charge}/${f.reverse_charge_type}/${f.vat_total}`,
      );
    });

    await t.krok("cudzia mena má kurz a DPH v eurách", async () => {
      const f = await vystav(live, {
        customer: { name: "E2E API USD", country: "US" },
        currency: "USD",
        delivery_date: t.dnes,
        items: [{ name: "Služba", quantity: 1, unit_price: 100, vat_rate: 23 }],
      });
      t.over(
        Number(f.exchange_rate) > 0 && Number(f.vat_total_eur) > 0,
        `kurz ${f.exchange_rate}, DPH v € ${f.vat_total_eur}`,
      );
    });

    await t.krok("česká firma: bez meny a sadzby CZK a 21 %", async () => {
      const f = await vystav(cz, {
        customer: { name: "E2E API CZ" },
        items: [{ name: "Služba", quantity: 1, unit_price: 1000 }],
      });
      t.over(f.currency === "CZK" && Number(f.vat_total) === 210, `${f.currency} ${f.vat_total}`);
    });
  },
};
