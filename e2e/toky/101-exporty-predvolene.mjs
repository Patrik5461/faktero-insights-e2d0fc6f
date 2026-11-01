/*
  Exporty — predvolené obdobie a súčet „Odovzdať za mesiac“ (B7b: E-01, E-02,
  E-16, E-17).

  - „Od“ v Účtovných exportoch je 1. deň aktuálneho mesiaca podľa Bratislavy
    (predtým `toISOString()` v SEČ dávalo posledný deň predošlého mesiaca —
    napr. 1. 11. → 2026-10-31 namiesto 2026-11-01).
  - „Odovzdať za mesiac“ má predvolený mesiac podľa Bratislavy (nie UTC).
  - Súčet v „Odovzdať za mesiac“ je po menách a len z riadnych faktúr,
    dobropisov (záporne) a ťarchopisov — zálohové faktúry a doklady k platbe
    v ňom nie sú.

  Tok len číta (firma Test), nič nezakladá ani neupratuje. Súbežné toky môžu
  vo firme Test medzitým vystaviť faktúru — porovnanie súčtu sa preto pár
  ráz zopakuje.
*/

const TYPY_DO_SUMY = new Set(["regular", "credit_note", "debit_note"]);

/** Rovnaké formátovanie ako `formatujMenuKratko` (sk-SK): € a Kč symbolom, inak kód. */
function formatuj(suma, mena) {
  const symbol = mena === "EUR" || mena === "CZK";
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency: mena,
    currencyDisplay: symbol ? "narrowSymbol" : "code",
  }).format(suma);
}

/** Očakávaný text súčtu (bez medzier) podľa faktúr mesiaca. */
function ocakavanySucet(faktury, domaca = "EUR") {
  const sucty = new Map();
  for (const f of faktury) {
    if (!TYPY_DO_SUMY.has(f.type || "regular")) continue;
    const total = Number(f.total ?? 0);
    const znamienko = f.type === "credit_note" && total > 0 ? -1 : 1;
    const mena = /^[A-Za-z]{3}$/.test(String(f.currency ?? "").trim())
      ? String(f.currency).trim().toUpperCase()
      : domaca;
    sucty.set(mena, (sucty.get(mena) ?? 0) + znamienko * total);
  }
  const dvojice = [];
  if (sucty.has(domaca)) dvojice.push([domaca, sucty.get(domaca)]);
  for (const [m, s] of sucty) if (m !== domaca) dvojice.push([m, s]);
  const r2 = dvojice.map(([m, s]) => [m, Math.round(s * 100) / 100]);
  const nenulove = r2.filter(([, s]) => Math.abs(s) >= 0.005);
  const zobraz = nenulove.length ? nenulove : r2.slice(0, 1);
  if (!zobraz.length) return formatuj(0, domaca);
  return zobraz.map(([m, s]) => formatuj(s, m)).join("·");
}

const bezMedzier = (s) => String(s ?? "").replace(/[\s  ]+/g, "");

export default {
  popis: "Exporty: predvolené Od = 1. deň mesiaca (Bratislava), súčet Odovzdať za mesiac po menách",
  limit: 120000,
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test;
    const mesiac = t.dnes.slice(0, 7);
    const prvyDen = `${mesiac}-01`;

    await t.krok("predvolené Od a Do v Účtovných exportoch", async () => {
      await t.go("/exporty");
      const sekcia = page
        .locator("div.rounded-2xl")
        .filter({ has: page.getByRole("button", { name: "Vybrať všetko", exact: true }) })
        .last();
      const datumy = sekcia.locator('input[type="date"]');
      await datumy.nth(0).waitFor({ timeout: 20000 });
      const od = await datumy.nth(0).inputValue();
      const doDna = await datumy.nth(1).inputValue();
      t.over(od === prvyDen, `„Od“ má byť ${prvyDen}, je ${od}`);
      t.over(doDna === t.dnes, `„Do“ má byť ${t.dnes}, je ${doDna}`);
    });

    const blok = page
      .locator("div.rounded-2xl")
      .filter({ has: page.getByLabel("Odovzdať za mesiac") })
      .first();

    await t.krok("predvolený mesiac Odovzdať za mesiac", async () => {
      const vstup = blok.getByLabel("Odovzdať za mesiac");
      const hodnota = await vstup.inputValue();
      t.over(hodnota === mesiac, `mesiac má byť ${mesiac}, je ${hodnota}`);
    });

    await t.krok("súčet Odovzdať za mesiac po menách bez záloh", async () => {
      const [r, m] = mesiac.split("-").map(Number);
      const dalsi = m === 12 ? `${r + 1}-01-01` : `${r}-${String(m + 1).padStart(2, "0")}-01`;
      let posledne = "";
      for (let pokus = 0; pokus < 3; pokus++) {
        if (pokus) {
          await t.go("/exporty");
        }
        const res = await t.rest.get(
          `invoices?company_id=eq.${firma}&issue_date=gte.${prvyDen}&issue_date=lt.${dalsi}` +
            `&status=not.in.(draft,cancelled)&deleted_at=is.null&select=id,type,total,currency&order=id&limit=1000`,
        );
        const faktury = res.data ?? [];
        t.over(faktury.length < 1000, "firma Test má v mesiaci priveľa faktúr na kontrolu");
        if (!faktury.length) {
          await blok.getByText(/nie sú žiadne doklady/).waitFor({ timeout: 20000 });
          t.log("v mesiaci nie sú faktúry — súčet sa nezobrazuje");
          return;
        }
        const riadok = blok.locator("div.font-medium").first();
        await riadok.waitFor({ timeout: 20000 });
        const text = bezMedzier(await riadok.innerText());
        const ocakavane = bezMedzier(ocakavanySucet(faktury));
        const zalohy = faktury.filter((f) => !TYPY_DO_SUMY.has(f.type || "regular")).length;
        t.log(`faktúr ${faktury.length} (záloh/dokladov k platbe ${zalohy}), súčet ${ocakavane}`);
        if (text.includes(ocakavane)) {
          t.over(
            text.includes(String(faktury.length)),
            `počet faktúr ${faktury.length} chýba v „${text}“`,
          );
          return;
        }
        posledne = `očakávaný súčet „${ocakavane}“ nie je v „${text}“`;
      }
      throw new Error(posledne);
    });
  },
};
