/*
  „Označiť ako odovzdané“ pri exporte faktúr (Exporty → Účtovné exporty).

  - Predvolený stav poľa podľa účtovného programu firmy: zaškrtnuté len pri
    formáte programu, ktorý firma vedie (Test = Pohoda; potom dočasne Money S3).
  - Vypnuté pole: súbor sa stiahne, ale faktúra ostane neodovzdaná
    (žiadny `export_logs`, `exported_at` prázdne) — pri každom formáte.
  - Zapnuté pole (Money S3): faktúra sa zamkne a hláška zámku aj „už je
    odovzdaná“ uvádzajú program, kam naozaj odišla.
  - Vrátenie (Exporty → Vrátiť) zámok zruší.

  Po toku sa zmažú vytvorené exporty (s nimi aj export_logs), faktúra,
  odberateľ a účtovný program firmy sa vráti na pôvodný.
*/
import { readFileSync } from "node:fs";
import { overXsd, SCHEMY, textXml } from "../lib/xml.mjs";
import { vystavFakturu, zalozOdberatela } from "../lib/doklady.mjs";

/** Formáty faktúr v ponuke a program, ku ktorému patria (null = univerzálny). */
const FORMATY = {
  pohoda_xml: "pohoda",
  bis_zip: null,
  omega_txt: "omega",
  money_s3_xml: "money_s3",
  isdoc_zip: null,
  flexi_xml: "flexi",
  mrp_xml: "mrp",
  csv_univerzal: null,
};

export default {
  popis:
    "Označiť ako odovzdané: predvolene podľa programu, vypnuté nezamkne, zapnuté zamkne s menom programu",
  limit: 300000,
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test;
    const zaciatok = new Date().toISOString();

    const povodny = await t.rest.get(`companies?id=eq.${firma}&select=uctovny_program`);
    const povodnyProgram = povodny.data?.[0]?.uctovny_program ?? "pohoda";
    t.over(
      povodnyProgram === "pohoda",
      `QA firma Test má mať program Pohoda, má ${povodnyProgram}`,
    );

    // Exporty z toku (aj neoznačené sa ukladajú do histórie); zmazanie úlohy zmaže aj export_logs.
    t.uprac("exporty z toku", async () => {
      const r = await t.rest.delete(
        `export_jobs?company_id=eq.${firma}&created_at=gte.${zaciatok}&invoice_count=eq.1`,
      );
      if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
    });

    const fa = await t.krok("príprava: vystavená faktúra", async () => {
      const odb = await zalozOdberatela(t);
      return await vystavFakturu(t, {
        odberatel: odb.name,
        text: `${t.znacka} — odovzdanie pri exporte`,
        polozky: [[`${t.znacka} služba`, 1, 100, 23]],
      });
    });

    const sekcia = page
      .locator("div.rounded-2xl")
      .filter({ has: page.getByRole("button", { name: "Vybrať všetko", exact: true }) })
      .last();
    const oznacit = sekcia.getByLabel(/Označiť ako odovzdané/);
    const vyberFormat = (f) =>
      sekcia
        .locator("select")
        .filter({ has: page.locator('option[value="pohoda_xml"]') })
        .selectOption(f);
    async function otvorExporty() {
      await t.go("/exporty");
      const datumy = sekcia.locator('input[type="date"]');
      await datumy.nth(0).fill(t.dnes);
      await datumy.nth(1).fill(t.dnes);
      await sekcia.locator("tr", { hasText: fa.invoice_number }).waitFor({ timeout: 20000 });
    }
    async function oznacRiadok() {
      const box = sekcia
        .locator("tr", { hasText: fa.invoice_number })
        .locator('input[type="checkbox"]');
      if (!(await box.isChecked())) await box.check();
    }
    const stav = async () => {
      const [f, l] = await Promise.all([
        t.rest.get(`invoices?id=eq.${fa.id}&select=exported_at`),
        t.rest.get(`export_logs?invoice_id=eq.${fa.id}&select=status,export_jobs(format)`),
      ]);
      return { exportedAt: f.data?.[0]?.exported_at ?? null, logy: l.data ?? [] };
    };

    await t.krok("predvolený stav poľa pri firme s Pohodou", async () => {
      await otvorExporty();
      const zle = [];
      for (const [f, program] of Object.entries(FORMATY)) {
        await vyberFormat(f);
        await page.waitForTimeout(150);
        const ma = await oznacit.isChecked();
        const cakam = program === "pohoda";
        if (ma !== cakam) zle.push(`${f}: ${ma ? "zaškrtnuté" : "nezaškrtnuté"}`);
        const vysvetlenie = await sekcia
          .getByText(/Tento formát nie je účtovný program/)
          .isVisible()
          .catch(() => false);
        if (vysvetlenie !== !program)
          zle.push(`${f}: vysvetlenie univerzálneho formátu ${vysvetlenie ? "navyše" : "chýba"}`);
      }
      t.over(!zle.length, `predvolený stav nesedí: ${zle.join(", ")}`);
    });

    await t.krok("vypnuté pole pri každom formáte: súbor áno, odovzdanie nie", async () => {
      const zle = [];
      for (const f of Object.keys(FORMATY)) {
        if (f === "bis_zip") continue; // eFaktúra má vlastné kontroly odberateľa, tu nejde o ňu
        await vyberFormat(f);
        await oznacRiadok();
        if (await oznacit.isChecked()) await oznacit.uncheck();
        const subor = await t.stiahni(
          () => sekcia.getByRole("button", { name: "Exportovať", exact: true }).click(),
          `neoznacene-${f}`,
        );
        const buf = readFileSync(subor);
        if (!buf.length) zle.push(`${f}: prázdny súbor`);
        if (f === "pohoda_xml") {
          const chyba = await overXsd(buf, SCHEMY.pohoda);
          if (chyba) zle.push(`${f}: XSD ${chyba.slice(0, 200)}`);
          if (!textXml(buf).includes(fa.invoice_number)) zle.push(`${f}: chýba číslo faktúry`);
        }
        const s = await stav();
        if (s.exportedAt || s.logy.length)
          zle.push(
            `${f}: faktúra sa označila (exported_at ${s.exportedAt}, logov ${s.logy.length})`,
          );
      }
      t.over(!zle.length, zle.join(" · "));
    });

    await t.krok("zapnuté pole pri Money S3: faktúra sa zamkne s menom programu", async () => {
      await vyberFormat("money_s3_xml");
      await oznacRiadok();
      if (!(await oznacit.isChecked())) await oznacit.check();
      await t.stiahni(
        () => sekcia.getByRole("button", { name: "Exportovať", exact: true }).click(),
        "oznacene-money",
      );
      const s = await t.cakajNa("faktúra odovzdaná", async () => {
        const x = await stav();
        return x.exportedAt ? x : null;
      });
      t.over(
        s.logy.length === 1 &&
          s.logy[0].status === "ok" &&
          s.logy[0].export_jobs?.format === "money_s3_xml",
        `čakal som jeden log Money S3, je ${JSON.stringify(s.logy)}`,
      );
      const r = await t.rest.patch(`invoices?id=eq.${fa.id}`, {
        notes: `${t.znacka} zmena po odovzdaní`,
      });
      t.over(r.status >= 400, `zamknutú faktúru sa podarilo zmeniť (${r.status})`);
      t.over(
        /odovzdaná do účtovníctva \(Money S3\)/.test(r.text),
        `hláška zámku neuvádza Money S3: ${r.text.slice(0, 300)}`,
      );
    });

    await t.krok("už odovzdaná: zoznam aj druhý export do Pohody uvádzajú program", async () => {
      await otvorExporty();
      // Faktúra poslaná do Money nie je „V Pohode“.
      const riadok = sekcia.locator("tr", { hasText: fa.invoice_number });
      await riadok.getByText("Odovzdaná (Money S3)").waitFor({ timeout: 10000 });
      t.over(
        !(await riadok
          .getByText("V Pohode")
          .isVisible()
          .catch(() => false)),
        "faktúra poslaná do Money má v zozname štítok „V Pohode“",
      );
      await vyberFormat("pohoda_xml");
      await oznacRiadok();
      t.over(await oznacit.isChecked(), "pri Pohode má byť pole zaškrtnuté");
      const pred = t.hlasky.length;
      await sekcia.getByRole("button", { name: "Exportovať", exact: true }).click();
      await t.cakajNa("hláška o odovzdanej faktúre", () =>
        t.hlasky.slice(pred).find((h) => h.includes(fa.invoice_number)),
      );
      const h = t.hlasky.slice(pred).find((x) => x.includes(fa.invoice_number));
      t.over(
        /už je odovzdaná do účtovníctva \(Money S3\)/.test(h),
        `hláška neuvádza Money S3: ${h}`,
      );
    });

    await t.krok("predvolený stav pri firme s Money S3", async () => {
      const r = await t.rest.patch(`companies?id=eq.${firma}`, { uctovny_program: "money_s3" });
      t.over(r.status < 300, `program sa nedal zmeniť: ${r.status} ${r.text.slice(0, 200)}`);
      t.uprac("účtovný program firmy", async () => {
        const x = await t.rest.patch(`companies?id=eq.${firma}`, {
          uctovny_program: povodnyProgram,
        });
        if (x.status >= 300) throw new Error(`${x.status} ${x.text.slice(0, 200)}`);
      });
      await otvorExporty();
      const zle = [];
      for (const [f, program] of Object.entries(FORMATY)) {
        await vyberFormat(f);
        await page.waitForTimeout(150);
        const ma = await oznacit.isChecked();
        if (ma !== (program === "money_s3"))
          zle.push(`${f}: ${ma ? "zaškrtnuté" : "nezaškrtnuté"}`);
      }
      t.over(!zle.length, `predvolený stav nesedí: ${zle.join(", ")}`);
    });

    await t.krok("vrátenie zámok zruší", async () => {
      const riadok = sekcia.locator("tr", { hasText: fa.invoice_number });
      await riadok.getByRole("button", { name: /^Vrátiť/ }).click();
      await t.potvrd(page, /Vrátiť a opraviť/);
      await t.cakajNa("faktúra vrátená", async () => !(await stav()).exportedAt);
      const r = await t.rest.patch(`invoices?id=eq.${fa.id}`, { notes: `${t.znacka} po vrátení` });
      t.over(
        r.status < 300,
        `po vrátení sa faktúra nedá zmeniť: ${r.status} ${r.text.slice(0, 200)}`,
      );
    });
  },
};
