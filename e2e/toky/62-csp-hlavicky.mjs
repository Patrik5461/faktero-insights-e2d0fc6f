/*
  Content-Security-Policy v režime Report-Only (src/server.ts + lib/systemove-chyby/csp.ts):
  HTML nesie hlavičku s hlásením na /api/public/csp-report, ostrá CSP zatiaľ nie je,
  endpoint hlásenia prijme (aj šum z doplnkov prehliadača) a odpovie 204.
  Porušenia, ktoré prehliadač na úvode a prihlásení naozaj zahlási, sa vypíšu
  ako upozornenie — v tejto fáze tok kvôli nim nepadá (zbierajú sa v Admin → Chyby).

  Nič nezapisuje: skúšobné hlásenie je z doplnku prehliadača, ten endpoint zahodí.
*/
export default {
  popis: "CSP Report-Only: hlavička na HTML, endpoint hlásení, porušenia na úvode",
  limit: 60000,
  async spusti(t) {
    await t.krok("HTML nesie CSP Report-Only s hlásením na náš endpoint", async () => {
      for (const cesta of ["/", "/prihlasenie"]) {
        const r = await fetch(`${t.base}${cesta}`, { redirect: "manual" });
        const csp = r.headers.get("content-security-policy-report-only") ?? "";
        t.over(
          csp.includes("report-uri /api/public/csp-report"),
          `${cesta}: chýba CSP Report-Only`,
        );
        t.over(csp.includes("object-src 'none'"), `${cesta}: CSP bez object-src 'none'`);
        t.over(
          !r.headers.get("content-security-policy"),
          `${cesta}: ostrá CSP je zapnutá skôr, než sa vyhodnotili hlásenia`,
        );
        t.over(
          (r.headers.get("reporting-endpoints") ?? "").includes("/api/public/csp-report"),
          `${cesta}: chýba Reporting-Endpoints`,
        );
      }
    });

    await t.krok("endpoint hlásení odpovie 204 aj na šum a nezmysel", async () => {
      const posli = (telo, typ = "application/csp-report") =>
        fetch(`${t.base}/api/public/csp-report`, {
          method: "POST",
          headers: { "content-type": typ },
          body: telo,
        }).then((r) => r.status);
      const doplnok = await posli(
        JSON.stringify({
          "csp-report": {
            "document-uri": `${t.base}/`,
            "effective-directive": "script-src-elem",
            "blocked-uri": "chrome-extension://e2e/skript.js",
          },
        }),
      );
      t.over(doplnok === 204, `hlásenie z doplnku: ${doplnok}`);
      const zle = await posli("toto nie je json", "text/plain");
      t.over(zle === 204, `nezmysel: ${zle}`);
    });

    await t.krok("porušenia na úvode a prihlásení (len upozornenie)", async () => {
      const page = await t.novaStranka();
      const porusenia = new Set();
      await page.exposeFunction("__e2eCsp", (s) => porusenia.add(s));
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (e) =>
          window.__e2eCsp?.(`${e.effectiveDirective} ${e.blockedURI || "?"}`),
        );
      });
      for (const cesta of ["/", "/prihlasenie"]) await t.go(cesta, page);
      await page.waitForTimeout(1500);
      await page.close();
      if (porusenia.size)
        t.upozornenia.push(`CSP Report-Only hlási: ${[...porusenia].slice(0, 10).join("; ")}`);
    });
  },
};
