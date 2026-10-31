/*
  Povinné 2FA pre administrátorov platformy (lib/faktero/admin-dvojfaktor.ts):
  - do 8. 11. 2026 sa /admin správa ako doteraz, potom relácia bez aal2 skončí
    na Nastavenia → Zabezpečenie účtu (?admin=1) s vysvetlením — QA účet 2FA nemá,
    takže overí tú vetvu, ktorá podľa dátumu práve platí,
  - stránka zabezpečenia s ?admin=1 ukáže upozornenie a odkaz späť,
  - RPC na výmenu cron tokenu (vymen-cron-token.sh) je pre anon aj prihláseného zavreté.
  Nič nezapisuje.
*/
const POVINNE_OD = new Date("2026-11-08T00:00:00+01:00");

export default {
  popis: "2FA pre adminov: /admin bez aal2, upozornenie v zabezpečení, zavreté RPC tokenu",
  limit: 60000,
  async spusti(t) {
    const page = t.page;

    await t.krok("RPC výmeny cron tokenu je zavreté", async () => {
      const args = { p_stary: "x".repeat(20), p_novy: null, p_skuska: true };
      const a = await t.restAnon.rpc("faktero_vymen_cron_token", args, { anon: true });
      const p = await t.rest.rpc("faktero_vymen_cron_token", args);
      t.over(a.status >= 400, `anon dostal ${a.status}`);
      t.over(p.status >= 400, `prihlásený dostal ${p.status}`);
    });

    await t.krok("/admin bez dvojfaktora", async () => {
      await t.go("/admin");
      await t.cakajNa(
        "presmerovanie z /admin",
        async () => !/^\/admin/.test(new URL(page.url()).pathname),
      );
      const cesta = new URL(page.url()).pathname;
      if (Date.now() >= POVINNE_OD.getTime()) {
        t.over(
          cesta === "/nastavenia/zabezpecenie",
          `po termíne čakám zabezpečenie, som na ${cesta}`,
        );
      } else {
        // QA účet nie je admin → ako doteraz na prehľad (alebo onboarding).
        t.over(
          cesta !== "/nastavenia/zabezpecenie",
          "pred termínom nemá /admin posielať do zabezpečenia",
        );
      }
    });

    await t.krok("zabezpečenie s ?admin=1 vysvetlí, prečo a kde zapnúť", async () => {
      await t.go("/nastavenia/zabezpecenie?admin=1");
      const alert = page.getByRole("alert").filter({ hasText: "dvojfaktorovým overením" });
      await alert.waitFor({ timeout: 15000 });
      t.over((await alert.getByRole("link").count()) > 0, "chýba odkaz späť do administrácie");
      await page
        .getByRole("heading", { name: "Dvojfaktorové overenie" })
        .waitFor({ timeout: 10000 });
      await t.go("/nastavenia/zabezpecenie");
      t.over(
        (await page.getByRole("alert").filter({ hasText: "dvojfaktorovým overením" }).count()) ===
          0,
        "upozornenie sa ukazuje aj bez ?admin=1",
      );
    });
  },
};
