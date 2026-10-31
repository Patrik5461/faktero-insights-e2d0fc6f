/*
  Strana náhľadu dokladu: tlačidlom v hlavičke náhľadu sa náhľad presunie
  doprava (bloček aj prijatá faktúra), poradie stĺpcov sa zmení v DOM aj na
  obrazovke, fokus ostane na tlačidle a voľba vydrží obnovenie stránky aj
  inú obrazovku (ukladá sa do účtu). Na konci sa voľba v účte vráti.
*/
import { fotkaBlocku } from "../lib/blocek-obrazok.mjs";
import { SUPABASE, prihlasRest, qaHeslo } from "../lib/prostredie.mjs";
import { pravidloPreDodavatela, prijataCezRest } from "../lib/zauctovanie.mjs";

/** Prečíta rozloženie okolo prepínača: strana, poradie v DOM a poradie na obrazovke. */
export async function rozlozenie(page) {
  const b = page.locator("[data-prepinac-strany-nahladu]:visible").first();
  await b.waitFor({ timeout: 30000 });
  return b.evaluate((el) => {
    const obal = el.closest("[data-strana-nahladu]");
    if (!obal) return null;
    const deti = [...obal.children];
    const iNahlad = deti.findIndex((d) => d.contains(el));
    const iObsah = iNahlad === 0 ? 1 : 0;
    const x = (i) => deti[i]?.getBoundingClientRect().left ?? NaN;
    return {
      strana: obal.getAttribute("data-strana-nahladu"),
      domNahladPrvy: iNahlad === 0,
      nahladVlavoNaObrazovke: x(iNahlad) < x(iObsah),
      popis: el.getAttribute("aria-label"),
    };
  });
}

/** Nahrá súbor do košíka Storage právami QA účtu. */
async function nahraj(jwt, kos, cesta, telo, typ) {
  const r = await fetch(`${SUPABASE.url}/storage/v1/object/${kos}/${cesta}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE.kluc,
      Authorization: `Bearer ${jwt}`,
      "content-type": typ,
      "x-upsert": "true",
    },
    body: telo,
  });
  if (r.status >= 300)
    throw new Error(`upload ${kos}: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

/** Metadáta účtu (GET/PUT /auth/v1/user). */
export async function metadataUctu(jwt, zmena) {
  const r = await fetch(`${SUPABASE.url}/auth/v1/user`, {
    method: zmena ? "PUT" : "GET",
    headers: {
      apikey: SUPABASE.kluc,
      Authorization: `Bearer ${jwt}`,
      "content-type": "application/json",
    },
    body: zmena ? JSON.stringify({ data: zmena }) : undefined,
  });
  if (r.status >= 300) throw new Error(`auth/v1/user: ${r.status}`);
  return (await r.json()).user_metadata ?? {};
}

/**
 * Nastavenia účtu (user_metadata) na tok. V behu spusti.mjs ich tok dostane len
 * pre seba (t.nastavUcet — skutočný účet sa nemení, súbežné skupiny to neovplyvní);
 * inak sa zmení skutočný účet a po toku sa vráti pôvodná voľba.
 */
export async function nastavUcetToku(t, zmeny) {
  if (t.nastavUcet) {
    try {
      t.nastavUcet(zmeny);
      return;
    } catch {
      /* tok mení skutočný účet */
    }
  }
  const { jwt } = await prihlasRest(qaHeslo());
  const m = await metadataUctu(jwt);
  const povodne = Object.fromEntries(Object.keys(zmeny).map((k) => [k, m[k] ?? null]));
  await metadataUctu(jwt, zmeny);
  t.uprac("nastavenia účtu", () => metadataUctu(jwt, povodne));
}

/** Zapamätá si voľbu účtu, nastaví „vľavo“ a po toku ju vráti. */
export async function pripravStranu(t) {
  const { jwt } = await prihlasRest(qaHeslo());
  const povodna = (await metadataUctu(jwt)).strana_nahladu ?? null;
  await metadataUctu(jwt, { strana_nahladu: "vlavo" });
  t.uprac("strana náhľadu v účte", () => metadataUctu(jwt, { strana_nahladu: povodna }));
  return jwt;
}

export default {
  popis: "náhľad vľavo/vpravo — bloček a prijatá faktúra, aj po obnovení",
  limit: 150000,
  async spusti(t) {
    const page = t.page;
    const jwt = await pripravStranu(t);
    const firma = t.firmy.test;
    const png = await fotkaBlocku({ riadky: [`${t.znacka} Obchod`, "Spolu 12,30 EUR"], uhol: 0 });

    // Bloček so súborom (pravidlo účtovania, aby automat nepýtal AI).
    const dodavatel = `${t.znacka} Obchod s.r.o.`;
    await pravidloPreDodavatela(t, dodavatel);
    const cestaB = `${firma}/${t.znacka}-nahlad.png`;
    await nahraj(jwt, "expense-receipts", cestaB, png, "image/png");
    t.uprac("súbor bločku", () => t.rest.zmazSubory("expense-receipts", [cestaB]));
    const blocek = await t.rest.vloz("expense_documents", {
      company_id: firma,
      supplier_name: dodavatel,
      document_number: `${t.znacka}-NS`,
      issue_date: t.dnes,
      total_amount: 12.3,
      payment_method: "karta",
      source: "upload",
      file_path: cestaB,
      file_mime: "image/png",
    });
    t.uprac("bloček", () => t.rest.delete(`expense_documents?id=eq.${blocek.id}`));

    // Prijatá faktúra so súborom.
    const cestaP = `${firma}/${t.znacka}-nahlad.png`;
    await nahraj(jwt, "purchase-invoices", cestaP, png, "image/png");
    t.uprac("súbor prijatej", () => t.rest.zmazSubory("purchase-invoices", [cestaP]));
    const prijata = await prijataCezRest(t, { file_path: cestaP, file_mime: "image/png" });

    await t.krok("bloček: náhľad predvolene vľavo", async () => {
      await t.go(`/doklady/novy?id=${blocek.id}`);
      const r = await rozlozenie(page);
      t.over(r?.strana === "vlavo", `strana ${r?.strana}`);
      t.over(r.domNahladPrvy && r.nahladVlavoNaObrazovke, JSON.stringify(r));
      t.over(r.popis === "Presunúť náhľad doprava", `popis ${r.popis}`);
    });

    await t.krok("bloček: prepnutie doprava, fokus ostane na tlačidle", async () => {
      const b = page.getByRole("button", { name: "Presunúť náhľad doprava" }).first();
      await b.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Presunúť náhľad doľava" }).first().waitFor();
      const r = await rozlozenie(page);
      t.over(r.strana === "vpravo", `strana ${r.strana}`);
      t.over(!r.domNahladPrvy && !r.nahladVlavoNaObrazovke, JSON.stringify(r));
      const fokus = await page.evaluate(() =>
        document.activeElement?.hasAttribute("data-prepinac-strany-nahladu"),
      );
      t.over(fokus, "fokus sa po prepnutí stratil");
    });

    await t.krok("voľba sa uložila do účtu", async () => {
      await t.cakajNa(
        "strana_nahladu v účte",
        async () => (await metadataUctu(jwt)).strana_nahladu === "vpravo",
      );
    });

    await t.krok("bloček: po obnovení ostáva vpravo", async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
      const r = await rozlozenie(page);
      t.over(
        r.strana === "vpravo" && !r.domNahladPrvy && !r.nahladVlavoNaObrazovke,
        JSON.stringify(r),
      );
    });

    await t.krok("prijatá faktúra: tá istá voľba platí aj tu", async () => {
      await t.go(`/prijate-faktury/${prijata.id}`);
      const r = await rozlozenie(page);
      t.over(
        r.strana === "vpravo" && !r.domNahladPrvy && !r.nahladVlavoNaObrazovke,
        JSON.stringify(r),
      );
    });

    await t.krok("prijatá faktúra: späť doľava aj po obnovení", async () => {
      await page.getByRole("button", { name: "Presunúť náhľad doľava" }).first().click();
      await page.getByRole("button", { name: "Presunúť náhľad doprava" }).first().waitFor();
      await t.cakajNa(
        "strana_nahladu v účte",
        async () => (await metadataUctu(jwt)).strana_nahladu === "vlavo",
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      const r = await rozlozenie(page);
      t.over(
        r.strana === "vlavo" && r.domNahladPrvy && r.nahladVlavoNaObrazovke,
        JSON.stringify(r),
      );
    });
  },
};
