/*
  Notifikácie Tatra banky (webhook) — podvrhnuté na QA firmu test2, PALIERY ani
  inej firmy sa nedotkne a do banky nejde ani jedno volanie.

  - GET na endpoint odpovie „ok“ (banka si ním overuje, že žije), PUT → 405;
  - notifikácia s neznámym consentId → 401 a nič sa nesťahuje;
  - notifikácia so súhlasom QA pripojenia → 200. Pripojenie je založené bez
    tokenu, takže sťahovanie skončí hneď na „chýba access_token“ — skôr, než by
    sa čokoľvek poslalo do banky;
  - suma podstrčená v tele notifikácie sa nikde neobjaví (z tela sa neberie
    nič okrem consentId a id účtu).

  Pripojenie sa na konci zmaže. Riadky v `bank_webhook_events` (diagnostika
  bez väzby na firmu) QA účet zmazať nemôže — ostanú, sú bez osobných údajov.
*/
import { randomUUID } from "node:crypto";

const CESTA = "/api/bankove-ucty/tatrabanka/webhook";

function notifikacia(consentId, extra = {}) {
  return JSON.stringify({
    events: {
      transactionEvents: [
        {
          consentId,
          eventType: "NEW",
          accounts: [{ accountId: `e2e-${consentId.slice(0, 8)}` }],
          ...extra,
        },
      ],
    },
  });
}

export default {
  popis:
    "banka: notifikácie Tatra banky — overenie súhlasom, nič z tela (test2, bez volania banky)",
  limit: 60000,
  firma: "test2",
  bezPrehliadaca: true,
  async spusti(t) {
    const firma = t.firmy.test2;
    const url = `${t.base}${CESTA}`;
    const posli = (telo, metoda = "POST") =>
      fetch(url, {
        method: metoda,
        headers: { "content-type": "application/json", "user-agent": "faktero-e2e" },
        body: metoda === "GET" ? undefined : telo,
      });

    await t.krok("GET žije, PUT nie je povolený", async () => {
      const g = await posli(null, "GET");
      t.over(g.status === 200 && (await g.text()) === "ok", `GET: ${g.status}`);
      const p = await posli("{}", "PUT");
      t.over(p.status === 405, `PUT: ${p.status}`);
    });

    await t.krok("neznámy súhlas → 401", async () => {
      const r = await posli(notifikacia(randomUUID()));
      t.over(r.status === 401, `neznámy súhlas: ${r.status}`);
    });

    const suhlas = randomUUID();
    const conn = await t.krok("príprava: QA pripojenie TB bez tokenu", async () => {
      const c = await t.rest.vloz("bank_connections", {
        company_id: firma,
        provider: "tatrabanka",
        status: "connected",
        consent_id: suhlas,
        metadata: { e2e: t.znacka },
      });
      t.uprac("pripojenie", () => t.rest.delete(`bank_connections?id=eq.${c.id}`));
      return c;
    });

    const SUMA = 987654.32;
    const predtym = await t.rest.pocet(
      `bank_transactions?company_id=eq.${firma}&amount=eq.${SUMA}`,
    );

    await t.krok("známy súhlas → 200, aj opakovaná výzva hneď za ňou", async () => {
      const r1 = await posli(notifikacia(suhlas, { amount: String(SUMA), iban: "SK99" }));
      t.over(r1.status === 200, `známy súhlas: ${r1.status} ${await r1.text()}`);
      const r2 = await posli(notifikacia(suhlas));
      t.over(r2.status === 200, `opakovaná výzva: ${r2.status}`);
    });

    await t.krok("suma z tela sa nikde neobjavila, pripojenie ostalo nedotknuté", async () => {
      await new Promise((r) => setTimeout(r, 3000));
      const po = await t.rest.pocet(`bank_transactions?company_id=eq.${firma}&amount=eq.${SUMA}`);
      t.over(po === predtym, `pohyb so sumou z notifikácie: ${predtym} → ${po}`);
      const { data } = await t.rest.get(
        `bank_connections?id=eq.${conn.id}&select=status,last_synced_at,consent_id`,
      );
      t.over(data?.[0]?.status === "connected", `stav pripojenia: ${JSON.stringify(data)}`);
      t.over(data?.[0]?.consent_id === suhlas, "súhlas sa zmenil");
      // Bez tokenu sa nesmie nič stiahnuť ani zapísať čas synchronizácie.
      t.over(!data?.[0]?.last_synced_at, `last_synced_at: ${data?.[0]?.last_synced_at}`);
    });
  },
};
