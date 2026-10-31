/*
  Systémové chyby (Admin → Chyby): chyba z prehliadača odíde na
  /api/public/chyby bez e-mailu a tokenov, tabuľka a RPC sú pre anon aj
  bežného používateľa zavreté a — keď je QA účet platform admin — chyba sa
  ukáže v záložke Prehliadač a tok ju po sebe označí ako vyriešenú.

  Správa je zámerne vždy rovnaká a začína „[E2E]“: všetky behy sa zlúčia do
  jedného riadku (žiadne zvyšky) a server ju zapíše ako varovanie, takže
  neposiela upozornenie do Telegramu.
*/
const SPRAVA = "[E2E] skúšobná chyba z prehliadača";

export default {
  popis: "systémové chyby: hlásenie z prehliadača, zavretá tabuľka, Admin → Chyby",
  limit: 90000,
  async spusti(t) {
    const page = t.page;

    await t.krok("tabuľka a RPC chýb sú zavreté", async () => {
      const zle = [];
      const a = await t.restAnon.get("systemove_chyby?select=id&limit=1", { anon: true });
      if (a.status < 400) zle.push(`anon číta ${a.status}`);
      for (const [meno, args] of [
        ["zapis_systemovu_chybu", { p: { odtlacok: "e2e", zdroj: "server", sprava: "x" } }],
        ["admin_zlyhane_crony", { p_od: new Date().toISOString() }],
        ["vycisti_systemove_chyby", {}],
      ]) {
        const r = await t.rest.rpc(meno, args);
        if (r.status < 400) zle.push(`${meno} prihlásený ${r.status}`);
        const ra = await t.restAnon.rpc(meno, args, { anon: true });
        if (ra.status < 400) zle.push(`${meno} anon ${ra.status}`);
      }
      const z = await t.rest.post("systemove_chyby", {
        odtlacok: `e2e-${t.znacka}`,
        zdroj: "server",
        sprava: "x",
      });
      if (z.status < 400) zle.push(`prihlásený zapísal ${z.status}`);
      t.over(!zle.length, zle.join("; "));
    });

    const hlasenie = await t.krok("chyba z prehliadača odíde bez citlivých údajov", async () => {
      await t.go("/dashboard");
      const poziadavka = page.waitForRequest(
        (r) => r.url().endsWith("/api/public/chyby") && r.method() === "POST",
        { timeout: 15000 },
      );
      const odpoved = page.waitForResponse((r) => r.url().endsWith("/api/public/chyby"), {
        timeout: 15000,
      });
      await page.evaluate((sprava) => {
        const e = new Error(`${sprava} pre efaktura-qa@faktero.sk?token=abc123`);
        window.dispatchEvent(new ErrorEvent("error", { error: e, message: e.message }));
      }, SPRAVA);
      const telo = (await poziadavka).postData() ?? "";
      const r = await odpoved;
      t.over(r.status() === 204, `endpoint vrátil ${r.status()}`);
      t.over(!telo.includes("efaktura-qa@faktero.sk"), "v hlásení ostal e-mail");
      t.over(telo.includes(SPRAVA), "hlásenie nenesie správu chyby");
      return JSON.parse(telo);
    });

    await t.krok("šum (ResizeObserver) sa neposiela", async () => {
      let poslane = false;
      const sledovac = (r) => {
        if (r.url().endsWith("/api/public/chyby")) poslane = true;
      };
      page.on("request", sledovac);
      await page.evaluate(() =>
        window.dispatchEvent(
          new ErrorEvent("error", {
            message: "ResizeObserver loop completed with undelivered notifications.",
          }),
        ),
      );
      await page.waitForTimeout(1500);
      page.off("request", sledovac);
      t.over(!poslane, "ResizeObserver šum odišiel na server");
    });

    const admin = await t.krok("je QA účet platform admin?", async () => {
      await t.go("/admin/errors");
      await page.waitForTimeout(2500);
      return /\/admin\/errors/.test(new URL(page.url()).pathname);
    });
    if (!admin) {
      t.log(
        "QA účet nie je platform admin — zobrazenie v Admin → Chyby sa preskočilo (zápis overil endpoint)",
      );
      return;
    }

    await t.krok("chyba je v Admin → Chyby → Prehliadač", async () => {
      await page.getByRole("tab", { name: "Prehliadač" }).click();
      const riadok = page
        .locator('[data-testid="systemova-chyba"]')
        .filter({ hasText: SPRAVA })
        .first();
      await t.cakajNa(
        "riadok chyby v admine",
        async () => {
          if (await riadok.isVisible().catch(() => false)) return true;
          await page
            .getByRole("button", { name: "Obnoviť" })
            .first()
            .click()
            .catch(() => {});
          return false;
        },
        { limit: 30000, krok: 2500 },
      );
      const text = await riadok.innerText();
      t.over(!text.includes("efaktura-qa@faktero.sk"), "v admine je e-mail");
      t.over(/varovanie/i.test(text), `E2E chyba nie je varovanie: ${text.slice(0, 120)}`);
      t.over(hlasenie.zdroj === "prehliadac", `zdroj ${hlasenie.zdroj}`);

      t.uprac("označiť E2E chybu ako vyriešenú", async () => {
        const tlacidlo = riadok.getByRole("button", { name: "Vyriešené" });
        if (await tlacidlo.isVisible().catch(() => false)) {
          await tlacidlo.click();
          await riadok.waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
        }
      });
    });
  },
};
