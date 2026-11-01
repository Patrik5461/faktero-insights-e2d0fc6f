/*
  Zoznam vystavených faktúr — filtre a hromadný výber (balík B3, AB-01–AB-06).
  QA firma Test, faktúry so značkou behu v mene odberateľa:
  - 7 po splatnosti (1 z nich s odoslanou upomienkou), 1 uhradená po splatnosti,
    1 so splatnosťou v budúcnosti;
  - „po splatnosti“ a „bez upomienky“ filtruje databáza: počet v stránkovaní
    sedí s REST dotazom aj so súčtom za filter (`suhrn_vystavenych_faktur`)
    a druhá strana ukáže zvyšok;
  - „Vybrať všetko“ označí len zobrazené riadky (Hromadná akcia (n));
  - pruh nad zoznamom nemá „Označiť ako zaplatené“ ani druhé „Vymazať“;
  - mobil: karta má začiarknutie a Hromadná akcia (štítok) zasiahne len vybranú.
  Faktúry sa po toku zmažú natvrdo (upomienky odídu kaskádou).
*/
import { vlozOdoslanuUpomienku, zmazFakturuNatvrdo } from "../lib/doklady.mjs";

function posunDni(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function zaloz(t, i, o) {
  const f = await t.rest.vloz("invoices", {
    company_id: t.firmy.test,
    invoice_number: `${t.znacka}-ZF${i}`,
    type: "regular",
    status: "issued",
    issue_date: posunDni(t.dnes, -40),
    delivery_date: posunDni(t.dnes, -40),
    due_date: posunDni(t.dnes, -10),
    currency: "EUR",
    subtotal: 100,
    vat_total: 23,
    total: 123,
    customer_name: `${t.znacka} Zoznam`,
    ...o,
  });
  t.uprac(`faktúra ${f.invoice_number}`, () => zmazFakturuNatvrdo(t, f.id));
  return f;
}

const filter = (f) => `f=${encodeURIComponent(JSON.stringify(f))}`;

export default {
  popis: "zoznam faktúr: filtre po splatnosti v dotaze, výber len zobrazených, mobil",
  limit: 240000,
  async spusti(t) {
    const page = t.page;
    const faktury = await t.krok("príprava: 9 faktúr v QA firme Test", async () => {
      const po = [];
      for (let i = 1; i <= 7; i++) po.push(await zaloz(t, i, {}));
      await vlozOdoslanuUpomienku(t, { invoiceId: po[0].id, companyId: t.firmy.test, cislo: 1 });
      const uhradena = await zaloz(t, 8, { status: "paid", paid_at: `${t.dnes}T08:00:00Z` });
      const buduca = await zaloz(t, 9, { due_date: posunDni(t.dnes, 10) });
      return { po, uhradena, buduca };
    });

    await t.krok("REST: anti-join „bez upomienky“ a súčet za filter sedia", async () => {
      const zaklad = `invoices?company_id=eq.${t.firmy.test}&customer_name=ilike.*${encodeURIComponent(t.znacka)}*&deleted_at=is.null&status=in.(issued,sent)&due_date=lt.${t.dnes}&paid_at=is.null`;
      const po = await t.rest.get(`${zaklad}&select=id`);
      t.over(
        po.status === 200 && po.data.length === 7,
        `po splatnosti ${po.status} ${po.data?.length}`,
      );
      const bez = await t.rest.get(
        `${zaklad}&select=id,invoice_reminders(id)&invoice_reminders.status=eq.sent&invoice_reminders=is.null`,
      );
      t.over(bez.status === 200, `anti-join ${bez.status} ${bez.text.slice(0, 200)}`);
      t.over(bez.data.length === 6, `bez upomienky ${bez.data.length}, čakal som 6`);
      t.over(
        !bez.data.some((r) => r.id === faktury.po[0].id),
        "faktúra s upomienkou prešla filtrom",
      );
      for (const [p, n] of [
        [{ p_po_splatnosti: true }, 7],
        [{ p_bez_upomienky: true }, 6],
        [{ p_neuhradene: true }, 8],
      ]) {
        const r = await t.rest.rpc("suhrn_vystavenych_faktur", {
          p_company_id: t.firmy.test,
          p_hladanie: t.znacka,
          ...p,
        });
        t.over(
          r.status === 200 && r.data?.pocet === n,
          `súčet ${JSON.stringify(p)}: ${r.data?.pocet} ≠ ${n}`,
        );
      }
    });

    const textStrankovania = () =>
      page
        .getByText(/Zobrazuje sa \d+–\d+ z \d+/)
        .first()
        .innerText();

    await t.krok("po splatnosti: stránkovanie počíta len faktúry po splatnosti", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await t.go(`/faktury?poSplatnosti=true&q=${encodeURIComponent(t.znacka)}&size=5`);
      await page.getByText(`${t.znacka}-ZF`).first().waitFor({ timeout: 30000 });
      const s = await textStrankovania();
      t.over(/z 7\b/.test(s), `stránkovanie „${s}“ — čakal som 7 faktúr`);
      const riadky = await page.locator("tbody tr[data-nahlad-id]").count();
      t.over(riadky === 5, `na 1. strane ${riadky} riadkov`);
      t.over(
        (await page.getByText(`${t.znacka}-ZF8`).count()) === 0 &&
          (await page.getByText(`${t.znacka}-ZF9`).count()) === 0,
        "uhradená alebo budúca faktúra je v zozname po splatnosti",
      );
      await t.go(`/faktury?poSplatnosti=true&q=${encodeURIComponent(t.znacka)}&size=5&page=2`);
      await page.getByText(`${t.znacka}-ZF`).first().waitFor({ timeout: 30000 });
      const r2 = await page.locator("tbody tr[data-nahlad-id]").count();
      t.over(r2 === 2, `na 2. strane ${r2} riadkov`);
      // Odznak v riadku: Po splatnosti, nie Vystavená.
      t.over(
        (await page.getByText("Po splatnosti", { exact: true }).count()) >= 2,
        "odznak Po splatnosti chýba",
      );
    });

    await t.krok("bez upomienky: 6 faktúr, Vybrať všetko = len zobrazené", async () => {
      await t.go(
        `/faktury?q=${encodeURIComponent(t.znacka)}&size=25&${filter({ bezUpomienky: "1" })}`,
      );
      await page.getByText(`${t.znacka}-ZF`).first().waitFor({ timeout: 30000 });
      const s = await textStrankovania();
      t.over(/z 6\b/.test(s), `stránkovanie „${s}“ — čakal som 6`);
      t.over(
        (await page.getByText(`${t.znacka}-ZF1`, { exact: true }).count()) === 0,
        "faktúra s upomienkou je vo filtri bez upomienky",
      );
      await page.getByRole("checkbox", { name: "Vybrať všetko" }).check();
      const tl = page.getByRole("button", { name: /Hromadná akcia \(\d+\)/ });
      await tl.waitFor({ timeout: 10000 });
      const txt = await tl.innerText();
      t.over(/\(6\)/.test(txt), `Hromadná akcia hlási ${txt}`);
      t.over(
        (await page.getByRole("button", { name: "Označiť ako zaplatené" }).count()) === 0,
        "v pruhu je ešte „Označiť ako zaplatené“",
      );
      t.over(
        (await page.getByRole("button", { name: "Vymazať vybraté" }).count()) === 0,
        "mimo koša je ešte BulkBar s „Vymazať vybraté“",
      );
    });

    await t.krok("mobil: výber karty a štítok len vybranej faktúre", async () => {
      const m = await t.novaStranka({ mobil: true });
      await t.go(`/faktury?poSplatnosti=true&q=${encodeURIComponent(t.znacka)}&size=25`, m);
      const cb = m.getByRole("checkbox", { name: `Vybrať faktúru ${t.znacka}-ZF3` });
      await cb.waitFor({ timeout: 30000 });
      await cb.check();
      const tl = m.getByRole("button", { name: /Hromadná akcia \(1\)/ });
      await tl.click();
      await m.getByRole("menuitem", { name: "Štítky" }).click();
      await m.getByRole("menuitem", { name: "Pridať štítok…" }).click();
      const okno = m.getByRole("alertdialog").last();
      await okno.waitFor({ timeout: 10000 });
      await okno.getByRole("textbox").fill(`e2e-${t.znacka}`);
      await okno.getByRole("button").last().click();
      const f3 = faktury.po[2];
      await t.cakajNa("štítok na vybranej faktúre", async () => {
        const r = await t.rest.get(`invoices?id=eq.${f3.id}&select=stitky`);
        return (r.data?.[0]?.stitky ?? []).includes(`e2e-${t.znacka}`);
      });
      const ine = await t.rest.get(
        `invoices?company_id=eq.${t.firmy.test}&customer_name=ilike.*${encodeURIComponent(t.znacka)}*&stitky=cs.{e2e-${t.znacka}}&select=id`,
      );
      t.over(ine.data?.length === 1, `štítok dostalo ${ine.data?.length} faktúr`);
      const sirka = await m.evaluate(() => document.documentElement.scrollWidth);
      t.over(sirka <= 392, `zoznam je širší ako obrazovka (${sirka} px)`);
    });
  },
};
