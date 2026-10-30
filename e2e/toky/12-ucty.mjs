/*
  Účty a správa: nové správcovské tabuľky (WhatsApp, Telegram, zdroje admina)
  sú cez REST zavreté, overenia platiteľa DPH vidno len z vlastných firiem,
  /admin bežného používateľa vráti späť, ponuka účtu má odhlásenie a
  predplatné pridelené zadarmo nesľubuje mesačnú platbu. Len čítanie.
*/
export default {
  popis: "účty: správcovské tabuľky, /admin, ponuka účtu, predplatné",
  limit: 90000,
  async spusti(t) {
    const page = t.page;

    await t.krok("správcovské tabuľky zavreté (anon aj prihlásený)", async () => {
      const zle = [];
      for (const tabulka of [
        "whatsapp_stav",
        "whatsapp_chaty",
        "whatsapp_kody",
        "whatsapp_prijate",
        "whatsapp_odoslane",
        "whatsapp_strop",
        "telegram_chaty",
        "telegram_admin_chaty",
        "telegram_kody",
        "telegram_spravy_bota",
        "telegram_updaty",
        "telegram_strop",
        "admin_usage_daily",
        "admin_plan_limits",
        "firma_smtp",
        "platform_admins",
      ]) {
        const a = await t.restAnon.get(`${tabulka}?select=*&limit=1`, { anon: true });
        if (a.status < 400) zle.push(`${tabulka} anon ${a.status}`);
        const u = await t.rest.get(`${tabulka}?select=*&limit=1`);
        const prazdne = u.status === 200 && Array.isArray(u.data) && u.data.length === 0;
        if (u.status < 400 && !prazdne)
          zle.push(`${tabulka} prihlásený ${u.status} ${u.text.slice(0, 60)}`);
      }
      t.over(!zle.length, `otvorené: ${zle.join("; ")}`);
    });

    await t.krok("overenia platiteľa DPH len z vlastných firiem", async () => {
      const r = await t.rest.get(`dph_overenia?select=company_id&limit=500`);
      t.over(r.status === 200, `dph_overenia ${r.status}`);
      const vlastne = new Set(Object.values(t.firmy));
      const cudzie = (r.data ?? []).filter((x) => !vlastne.has(x.company_id));
      t.over(!cudzie.length, `vidno overenia cudzích firiem: ${cudzie.length}`);
    });

    await t.krok("/admin bežného používateľa nepustí", async () => {
      await t.go("/admin");
      await t.cakajNa(
        "odchod z /admin",
        async () => !/\/admin(\/|$)/.test(new URL(page.url()).pathname),
        {
          limit: 15000,
        },
      );
    });

    await t.krok("ponuka účtu má Odhlásiť", async () => {
      await t.go("/dashboard");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Účet", exact: true }).first().click();
      await page.getByRole("menuitem", { name: "Odhlásiť" }).waitFor({ timeout: 10000 });
      await page.keyboard.press("Escape");
    });

    await t.krok("predplatné zadarmo nesľubuje mesačnú platbu", async () => {
      await page.evaluate((id) => localStorage.setItem("faktero.active_company", id), t.firmy.test);
      await t.go("/predplatne");
      await page.getByText("Aktuálny plán").first().waitFor();
      const text = (await page.locator("main").first().innerText()).replace(/\s+/g, " ");
      t.over(!/obnovuje každý mesiac/.test(text), "pri pláne zadarmo stojí veta o mesačnej obnove");
    });
  },
};
