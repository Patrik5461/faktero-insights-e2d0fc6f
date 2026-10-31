/*
  Audit 31. 10. 2026 — verejné endpointy pridané 30.–31. 10.

  - hooky GPS, palivových kariet a Trans.eu bez cron tokenu → 401,
  - návrat z Trans.eu so sfalšovaným `state` neprejde a nepresmeruje na cudziu
    adresu ani s podvrhnutou cookie `faktero_transeu_navrat`,
  - hlásenie CSP s veľkým telom (300 kB) sa odmietne bez načítania — 204,
  - /api/public/chyby s nezmyslom a priveľkým telom → 204 bez zápisu,
  - /prilohy/<token> so sfalšovaným podpisom ukáže len „neplatný odkaz“.

  Nič nezapisuje do dát; žiadne „chyby“ s ostrou úrovňou sa neposielajú
  (Telegram adminov ostane ticho).
*/
export default {
  popis: "audit: verejné endpointy (hooky, Trans.eu callback, CSP, chyby, prílohy)",
  limit: 90000,
  async spusti(t) {
    await t.krok("cron hooky bez tokenu → 401", async () => {
      for (const h of ["gps-sync", "palivove-karty-sync", "transeu-sync"]) {
        const r = await fetch(`${t.base}/api/public/hooks/${h}`, {
          method: "POST",
          headers: { "x-faktero-cron-token": "zly-token-e2e" },
        });
        t.over(r.status === 401, `${h}: ${r.status}`);
      }
    });

    await t.krok("Trans.eu callback: falošný state, žiadne cudzie presmerovanie", async () => {
      const state = Buffer.from(
        `00000000-0000-0000-0000-000000000000.00000000-0000-0000-0000-000000000000.${Date.now()}.${"a".repeat(32)}.${"b".repeat(32)}`,
      ).toString("base64url");
      const r = await fetch(`${t.base}/api/public/transeu/callback?code=e2e&state=${state}`, {
        redirect: "manual",
        headers: {
          cookie:
            "faktero_transeu_oauth=" + "a".repeat(32) + "; faktero_transeu_navrat=zly.example",
        },
      });
      const kam = r.headers.get("location") ?? "";
      t.over(r.status === 302, `callback: ${r.status}`);
      const u = new URL(kam, t.base);
      t.over(
        /(^|\.)faktero\.sk$/.test(u.hostname) || u.host === new URL(t.base).host,
        `presmerovanie mimo: ${kam}`,
      );
      t.over(u.searchParams.get("chyba") === "invalid_state", `čakal som invalid_state: ${kam}`);
    });

    await t.krok("CSP hlásenie s veľkým telom → 204", async () => {
      const velke = JSON.stringify({ "csp-report": { x: "a".repeat(300_000) } });
      const r = await fetch(`${t.base}/api/public/csp-report`, {
        method: "POST",
        headers: { "content-type": "application/csp-report" },
        body: velke,
      });
      t.over(r.status === 204, `csp-report: ${r.status}`);
    });

    await t.krok("príjem chýb: nezmysel a priveľké telo → 204", async () => {
      for (const telo of [
        "nie json",
        JSON.stringify({ zdroj: "prehliadac", sprava: "x".repeat(40_000) }),
      ]) {
        const r = await fetch(`${t.base}/api/public/chyby`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: telo,
        });
        t.over(r.status === 204, `chyby: ${r.status}`);
      }
    });

    await t.krok("prílohy: sfalšovaný odkaz nič neukáže", async () => {
      // Správny tvar (verzia 1, faktúra, 1 príloha), ale náhodný podpis.
      const b = Buffer.alloc(31 + 16 + 16);
      b.writeUInt8(1, 0);
      b.writeUInt8(0, 1);
      b.writeUInt32BE(Math.floor(Date.now() / 1000) + 86400, 2);
      b.writeUInt8(1, 30);
      const page = t.page;
      await page.goto(`${t.base}/prilohy/${b.toString("base64url")}`);
      await page.getByRole("alert").waitFor({ timeout: 20000 });
      const text = await page.getByRole("alert").innerText();
      t.over(/neplatn|vypršal/i.test(text), `prílohy: ${text}`);
      t.over(
        (await page.locator("a[href*='/storage/']").count()) === 0,
        "falošný odkaz ukázal súbor",
      );
    });
  },
};
