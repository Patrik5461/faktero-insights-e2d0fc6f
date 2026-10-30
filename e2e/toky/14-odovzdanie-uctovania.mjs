/*
  „Označiť ako odovzdané“ pri exporte zaúčtovaných dokladov do iných programov
  (Exporty → Zaúčtované doklady do vášho programu): KROS Omega, Money S3,
  ABRA Flexi, MRP, DATEV a súpiska CSV.

  Pri každom programe: pole je predvolene zaškrtnuté (exportuje sa do
  programu firmy), vypnuté pole prijatú faktúru neodovzdá. Pri jednom
  programe (MRP) zapnuté pole faktúru zamkne a hláška zámku menuje MRP.

  Prijatá faktúra sa založí cez REST (zaúčtovaná, predkontácia 7 z číselníka
  QA firmy Test); po toku sa zmaže spolu s exportmi a program firmy sa vráti.
*/
import { readFileSync } from "node:fs";

const PROGRAMY = ["omega", "money_s3", "flexi", "mrp", "datev", "csv"];

export default {
  popis: "Zaúčtované do programu: Označiť ako odovzdané pri Omega/Money/Flexi/MRP/DATEV/CSV",
  limit: 300000,
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test;
    const zaciatok = new Date().toISOString();
    const povodny = await t.rest.get(`companies?id=eq.${firma}&select=uctovny_program`);
    const povodnyProgram = povodny.data?.[0]?.uctovny_program ?? "pohoda";
    // Omega a DATEV bez nastavení súbor nedajú — na tok dočasné minimum, potom pôvodné.
    const povNast =
      (await t.rest.get(`companies?id=eq.${firma}&select=uctovanie_nastavenia`)).data?.[0]
        ?.uctovanie_nastavenia ?? {};
    const evidencie = Object.fromEntries(
      ["OF", "OD", "OPF", "DF", "DD", "DPF", "PD", "ID"].map((d) => [d, { evidencia: d, rad: d }]),
    );
    await t.rest.patch(`companies?id=eq.${firma}`, {
      uctovanie_nastavenia: {
        ...povNast,
        omega: { evidencie, ucetVynosy: "602", ucetNaklady: "501", ...(povNast.omega ?? {}) },
        datev: {
          beraternummer: 1001,
          mandantennummer: 1,
          osnova: "SKR03",
          ...(povNast.datev ?? {}),
        },
      },
    });
    t.uprac("nastavenia programov", async () => {
      const x = await t.rest.patch(`companies?id=eq.${firma}`, { uctovanie_nastavenia: povNast });
      if (x.status >= 300) throw new Error(`${x.status} ${x.text.slice(0, 200)}`);
    });
    t.uprac("účtovný program firmy", async () => {
      const x = await t.rest.patch(`companies?id=eq.${firma}`, { uctovny_program: povodnyProgram });
      if (x.status >= 300) throw new Error(`${x.status} ${x.text.slice(0, 200)}`);
    });

    const pf = await t.krok("príprava: zaúčtovaná prijatá faktúra", async () => {
      const r = await t.rest.vloz("purchase_invoices", {
        company_id: firma,
        invoice_number: `${t.znacka}-PF`,
        supplier_name: `${t.znacka} Dodávateľ s.r.o.`,
        supplier_ico: "36631124",
        supplier_ic_dph: "SK2022210311",
        supplier_country: "SK",
        issue_date: t.dnes,
        delivery_date: t.dnes,
        received_date: t.dnes,
        due_date: t.dnes,
        currency: "EUR",
        type: "regular",
        status: "booked",
        amount_without_vat: 100,
        vat_amount: 23,
        amount_total: 123,
        pohoda_predkontacia: "7",
        pohoda_clenenie_dph: "PD",
        kv_clenenie: "B2",
        zauctovane_at: new Date().toISOString(),
      });
      t.uprac("prijatá faktúra", async () => {
        // Odovzdaná by sa zmazať nedala — najprv späť (zmaže sa aj export).
        await t.rest.patch(`purchase_invoices?id=eq.${r.id}`, {
          exported_at: null,
          export_job_id: null,
        });
        const x = await t.rest.delete(`purchase_invoices?id=eq.${r.id}`);
        if (x.status >= 300) throw new Error(`${x.status} ${x.text.slice(0, 200)}`);
      });
      t.uprac("exporty z toku", async () => {
        const x = await t.rest.delete(
          `export_jobs?company_id=eq.${firma}&created_at=gte.${zaciatok}`,
        );
        if (x.status >= 300) throw new Error(`${x.status} ${x.text.slice(0, 200)}`);
      });
      return r;
    });

    const sekcia = page
      .locator("div.rounded-2xl")
      .filter({ has: page.getByRole("combobox", { name: "Účtovný program" }) })
      .first();
    const oznacit = sekcia.getByLabel(/Označiť ako odovzdané/);
    const stav = async () =>
      (await t.rest.get(`purchase_invoices?id=eq.${pf.id}&select=exported_at,export_job_id`))
        .data?.[0] ?? {};

    async function otvor(program) {
      const r = await t.rest.patch(`companies?id=eq.${firma}`, { uctovny_program: program });
      t.over(r.status < 300, `program ${program} sa nedal nastaviť: ${r.status}`);
      await t.go("/exporty");
      await sekcia.waitFor({ timeout: 20000 });
      await sekcia.getByRole("button", { name: "Prijaté faktúry", exact: true }).click();
      const datumy = sekcia.locator('input[type="date"]');
      await datumy.nth(0).fill(t.dnes);
      await datumy.nth(1).fill(t.dnes);
      const riadok = sekcia.locator("tr", { hasText: pf.invoice_number });
      await riadok.waitFor({ timeout: 20000 });
      // Zmena dátumu načíta zoznam znova a výber zruší — počkať, kým sa upokojí.
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(500);
      await riadok.locator('input[type="checkbox"]').check();
      await sekcia
        .getByRole("button", { name: /^Stiahnuť pre .*\(1\)$/ })
        .waitFor({ timeout: 10000 });
    }
    const stiahni = (meno) =>
      t.stiahni(() => sekcia.getByRole("button", { name: /^Stiahnuť pre / }).click(), meno);

    await t.krok("vypnuté pole: súbor áno, odovzdanie nie (každý program)", async () => {
      const zle = [];
      for (const p of PROGRAMY) {
        await otvor(p);
        if (!(await oznacit.isChecked())) zle.push(`${p}: pole nie je predvolene zaškrtnuté`);
        await oznacit.uncheck();
        // Program bez povinných nastavení (Omega: evidencie a rady) súbor nedá — to nie je chyba poľa.
        const pred = t.hlasky.length;
        const subor = await stiahni(`neoznacene-${p}`).catch(async (e) => {
          const h = t.hlasky.slice(pred).find((x) => /v nastaveniach/.test(x));
          if (!h) throw e;
          t.upozornenia.push(`${p}: bez nastavení programu sa neoveril (${h.slice(0, 120)})`);
          return null;
        });
        if (!subor) {
          if ((await stav()).exported_at) zle.push(`${p}: neúspešný export faktúru označil`);
          continue;
        }
        const obsah = readFileSync(subor);
        if (!obsah.length) zle.push(`${p}: prázdny súbor`);
        if (!obsah.includes(Buffer.from(pf.invoice_number.slice(-6))) && p !== "omega")
          zle.push(`${p}: v súbore chýba číslo faktúry`);
        const s = await stav();
        if (s.exported_at) zle.push(`${p}: faktúra sa označila ako odovzdaná`);
      }
      t.over(!zle.length, zle.join(" · "));
    });

    await t.krok("zapnuté pole (MRP): faktúra sa zamkne, hláška menuje MRP", async () => {
      await otvor("mrp");
      await oznacit.check();
      await stiahni("oznacene-mrp");
      const s = await t.cakajNa("prijatá odovzdaná", async () => {
        const x = await stav();
        return x.exported_at ? x : null;
      });
      t.over(s.export_job_id, "odovzdaná prijatá nemá export_job_id");
      const r = await t.rest.delete(`purchase_invoices?id=eq.${pf.id}`);
      t.over(r.status >= 400, `odovzdanú prijatú sa podarilo zmazať (${r.status})`);
      t.over(/MRP-K\/S/.test(r.text), `hláška zámku neuvádza MRP: ${r.text.slice(0, 300)}`);
    });
  },
};
