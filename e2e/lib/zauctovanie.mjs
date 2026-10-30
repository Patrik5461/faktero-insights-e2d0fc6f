/*
  Pravidlo účtovania pre dodávateľa E2E. Spúšťač v databáze z neho doplní
  predkontáciu a členenie hneď pri zápise dokladu — vďaka tomu ani detail
  dokladu, ani automatické zaúčtovanie nepýta návrh od AI (stojí peniaze).
*/
export const PREDKONTACIA_PRAVIDLA = "2"; // Nakúpené ostatné služby (číselník QA firmy Test)
export const CLENENIE_PRAVIDLA = "PD";

export async function pravidloPreDodavatela(t, nazovDodavatela, firma = "test") {
  const p = await t.rest.vloz("pravidla_uctovania", {
    company_id: t.firmy[firma],
    nazov: `${t.znacka} pravidlo`,
    poradie: 1,
    dodavatel_text: nazovDodavatela,
    predkontacia: PREDKONTACIA_PRAVIDLA,
    clenenie_dph: CLENENIE_PRAVIDLA,
    kv_clenenie: "B2",
  });
  t.uprac("pravidlo účtovania", async () => {
    const r = await t.rest.delete(`pravidla_uctovania?id=eq.${p.id}`);
    if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
  });
  return p;
}

/** Prijatá faktúra zmazaná natvrdo (mäkké mazanie nechá kôš plný kópií). */
export async function zmazPrijatu(t, id) {
  await t.rest.delete(`ai_navrhy_zauctovania?doklad_id=eq.${id}`);
  const r = await t.rest.delete(`purchase_invoices?id=eq.${id}`);
  if (r.status >= 300) {
    await t.rest.patch(`purchase_invoices?id=eq.${id}`, { deleted_at: new Date().toISOString() });
    throw new Error(
      `natvrdo sa nedala zmazať (${r.status} ${r.text.slice(0, 160)}), ostala v koši`,
    );
  }
}

/**
 * Prijatá faktúra zapísaná rovno cez REST (príprava pre iné toky). Je hneď
 * označená ako prejdená automatom, aby ju fronta nezaúčtovala ani nepýtala AI.
 */
export async function prijataCezRest(t, zmeny = {}, firma = "test") {
  const p = await t.rest.vloz("purchase_invoices", {
    company_id: t.firmy[firma],
    supplier_name: `${t.znacka} Dodávateľ s.r.o.`,
    supplier_ico: "50000001",
    supplier_iban: "SK7709000000000000123456",
    invoice_number: `${t.znacka}-P`,
    variable_symbol: String(Date.now()).slice(-9),
    issue_date: t.dnes,
    delivery_date: t.dnes,
    due_date: t.dnes,
    amount_without_vat: 100,
    vat_amount: 23,
    amount_total: 123,
    currency: "EUR",
    payment_method: "prevod",
    status: "received",
    auto_uctovanie_at: new Date().toISOString(),
    ...zmeny,
  });
  t.uprac(`prijatá ${p.id.slice(0, 8)}`, () => zmazPrijatu(t, p.id));
  // Zaúčtovanie si spúšťač zapamätá ako návyk dodávateľa (doklad_navyky) — bez
  // upratania rástol z behu na beh a autopilot by podľa neho účtoval aj v iných tokoch.
  const ico = zmeny.supplier_ico ?? "50000001";
  t.uprac(`návyk dodávateľa ${ico}`, async () => {
    await t.rest.delete(
      `doklad_navyky?company_id=eq.${t.firmy[firma]}&kluc_dodavatela=eq.ico:${ico}`,
    );
  });
  return p;
}
