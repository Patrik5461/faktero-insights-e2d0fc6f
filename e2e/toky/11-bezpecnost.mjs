/*
  Bezpečnosť cez REST s JWT QA používateľa: cudziu firmu (PALIERA) nevidí
  a administrátorské RPC nedostane. Len čítanie — zápis do cudzej firmy sa
  zámerne neskúša (keby prešiel, zapísal by do dát klienta).
*/
import { CUDZIA_FIRMA } from "../lib/prostredie.mjs";

export default {
  popis: "bezpečnosť REST: cudzia firma prázdno/403, admin RPC 401/403",
  bezPrehliadaca: true,
  limit: 60000,
  async spusti(t) {
    const prazdneAleboOdmietnute = (r) =>
      r.status >= 400 || (r.status === 200 && Array.isArray(r.data) && r.data.length === 0);

    await t.krok("cudzia firma cez tabuľky", async () => {
      const zle = [];
      for (const [tabulka, stlpec] of [
        ["companies", "id"],
        ["invoices", "company_id"],
        ["purchase_invoices", "company_id"],
        ["expense_documents", "company_id"],
        ["customers", "company_id"],
        ["bank_accounts", "company_id"],
        ["bank_transactions", "company_id"],
        ["company_users", "company_id"],
        ["nespracovane_doklady", "company_id"],
        ["api_keys", "company_id"],
      ]) {
        const r = await t.rest.get(`${tabulka}?${stlpec}=eq.${CUDZIA_FIRMA}&select=id&limit=1`);
        if (!prazdneAleboOdmietnute(r)) zle.push(`${tabulka}: ${r.status} ${r.text.slice(0, 80)}`);
      }
      t.over(!zle.length, `QA používateľ vidí dáta cudzej firmy: ${zle.join("; ")}`);
    });

    await t.krok("kontrola: vlastnú firmu vidí", async () => {
      const r = await t.rest.get(`companies?id=eq.${t.firmy.test}&select=id`);
      t.over(
        r.status === 200 && r.data?.length === 1,
        `vlastná firma sa nenačítala (${r.status}) — test cudzej firmy by bol bezcenný`,
      );
    });

    await t.krok("prehlad_suhrn cudzej firmy", async () => {
      const r = await t.rest.rpc("prehlad_suhrn", { p_company_id: CUDZIA_FIRMA, p_dnes: t.dnes });
      if (r.status < 400) {
        // SECURITY INVOKER: RLS nechá len nuly — žiadne nenulové číslo cudzej firmy.
        const cisla = r.text.replace(/"[^"]*"\s*:/g, "").replace(/\d{4}-\d\d-\d\d/g, "");
        t.over(
          !/[1-9]/.test(cisla),
          `prehlad_suhrn vrátil čísla cudzej firmy: ${r.text.slice(0, 200)}`,
        );
      }
      const anon = await t.restAnon.rpc(
        "prehlad_suhrn",
        { p_company_id: CUDZIA_FIRMA, p_dnes: t.dnes },
        { anon: true },
      );
      t.over(anon.status >= 400, `prehlad_suhrn bez prihlásenia vrátil ${anon.status}`);
    });

    await t.krok("admin_zdroje_prehlad", async () => {
      const r = await t.rest.rpc("admin_zdroje_prehlad", {});
      t.over(
        r.status === 401 || r.status === 403,
        `admin_zdroje_prehlad pre bežného používateľa vrátil ${r.status} ${r.text.slice(0, 120)}`,
      );
      const a = await t.restAnon.rpc("admin_zdroje_prehlad", {}, { anon: true });
      t.over(
        a.status === 401 || a.status === 403,
        `admin_zdroje_prehlad bez prihlásenia vrátil ${a.status}`,
      );
    });

    await t.krok("bez prihlásenia žiadne faktúry", async () => {
      const r = await t.restAnon.get(`invoices?select=id&limit=1`, { anon: true });
      t.over(prazdneAleboOdmietnute(r), `anon vidí faktúry: ${r.status} ${r.text.slice(0, 80)}`);
    });
  },
};
