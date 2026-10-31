/*
  Audit 31. 10. 2026 — prístup bez prihlásenia a tajné stĺpce nových tabuliek.

  Anon kľúč (ten, čo je v každom prehliadači) nesmie čítať nové tabuľky
  GPS, palivových kariet, Trans.eu, systémových chýb ani histórie webhookov
  a nesmie volať servisné RPC (výmena cron tokenu, zápis chyby, …).
  Pozor na PUBLIC: `revoke from anon` nestačí — preto sa to overuje zvonku.
  Prihlásený QA používateľ nesmie vidieť zašifrované prihlásenia integrácií
  ani volať servisné RPC.

  Nič nezapisuje (všetky volania sú odmietnuté alebo len čítajú).
*/
const TABULKY = [
  "systemove_chyby",
  "gps_pripojenia",
  "gps_vozidla_vazby",
  "gps_sync_logy",
  "transeu_napojenia",
  "transeu_objednavky",
  "palivove_karty_pripojenia",
  "palivove_karty_vazby",
  "palivove_karty_transakcie",
  "palivove_karty_logy",
  "webhook_delivery_logs",
  "dph_overenia",
  "admin_usage_daily",
];

const SERVISNE_RPC = {
  faktero_vymen_cron_token: { p_stary: "x", p_novy: "y", p_skuska: true },
  zapis_systemovu_chybu: { p: { odtlacok: "e2e-audit", zdroj: "server", sprava: "x" } },
  admin_zlyhane_crony: { p_od: "2026-01-01T00:00:00Z" },
  vycisti_systemove_chyby: {},
  faktero_faktura_odoslana: { _invoice_id: "00000000-0000-0000-0000-000000000000" },
  telegram_pusti: { _chat_id: 1, _druh: "e2e", _max: 1, _okno_sekund: 1 },
  whatsapp_pusti: { _kluc: "e2e", _druh: "e2e", _max: 1, _okno_sekund: 1 },
};

const odmietnute = (s) => s === 401 || s === 403 || s === 404;

export default {
  popis: "audit: anon a QA bez prístupu k novým tabuľkám, tajným stĺpcom a servisným RPC",
  limit: 60000,
  bezPrehliadaca: true,
  async spusti(t) {
    await t.krok("anon nečíta nové tabuľky", async () => {
      for (const tab of TABULKY) {
        const r = await t.rest.get(`${tab}?select=*&limit=1`, { anon: true });
        const prazdne = r.status === 200 && Array.isArray(r.data) && r.data.length === 0;
        t.over(
          odmietnute(r.status) || prazdne,
          `${tab}: anon dostal ${r.status} ${r.text.slice(0, 120)}`,
        );
      }
    });

    await t.krok("anon ani QA nevolajú servisné RPC", async () => {
      for (const [meno, args] of Object.entries(SERVISNE_RPC)) {
        for (const anon of [true, false]) {
          const r = await t.rest.rpc(meno, args, { anon });
          t.over(
            odmietnute(r.status),
            `${meno} (${anon ? "anon" : "QA"}): ${r.status} ${r.text.slice(0, 120)}`,
          );
        }
      }
    });

    await t.krok("QA nevidí zašifrované prihlásenia integrácií", async () => {
      for (const [tab, stlpec] of [
        ["gps_pripojenia", "prihlasenie_sifrovane"],
        ["palivove_karty_pripojenia", "prihlasenie_sifrovane"],
        ["transeu_napojenia", "refresh_token_sifrovany"],
        ["transeu_napojenia", "client_secret_sifrovany"],
      ]) {
        const r = await t.rest.get(`${tab}?select=${stlpec}&limit=1`);
        t.over(r.status !== 200, `${tab}.${stlpec}: QA dostal ${r.status}`);
      }
    });

    await t.krok("verejný pás partnerov ide anonymne, len aktívni", async () => {
      const r = await t.rest.get("partners?select=id,active&limit=50", { anon: true });
      t.over(r.status === 200, `partners anon: ${r.status} ${r.text.slice(0, 120)}`);
      t.over(
        (r.data ?? []).every((p) => p.active === true),
        "anon vidí neaktívneho partnera",
      );
    });
  },
};
