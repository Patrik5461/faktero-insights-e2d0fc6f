/*
  Mobilná appka bez signálu (Playwright `setOffline`): faktúra sa vystaví aj
  v lietadlovom režime.
  1. Predvolene sa odloží v telefóne a po návrate signálu ju vystaví server
     (číslo dostane až vtedy).
  2. Po zapnutí „Vystavovať bez signálu rovno s číslom" si appka vypýta 5 čísel;
     faktúra bez signálu dostane najnižšie z nich hneď a po pripojení sa na
     server zapíše presne s ním (rezervácia sa označí ako použitá).
  3. Vypnutie vráti nepoužité čísla serveru — v rade nesmie ostať diera.
  Faktúry sa na konci zmažú natvrdo a zvyšné rezervácie firmy sa uvoľnia.
*/
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";
import { otvorApku, tlacidlo, vystavVApke, zalozka } from "../lib/apka.mjs";

export default {
  popis: "appka bez signálu: odložená faktúra, vydávanie s rezervovaným číslom, vrátenie čísel",
  limit: 240000,
  async spusti(t) {
    const firma = t.firmy.test;
    const odb = await t.rest.vloz("customers", {
      company_id: firma,
      name: `${t.znacka} Offline s.r.o.`,
      street: "Testovacia 1",
      city: "Bratislava",
      zip: "81101",
      country: "SK",
    });
    t.uprac("odberateľ", async () => {
      const r = await t.rest.delete(`customers?id=eq.${odb.id}`);
      if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
    });
    t.uprac("rezervácie čísel", async () => {
      await t.rest.rpc("faktero_release_invoice_numbers", { _company_id: firma, _numbers: null });
    });
    const faktury = async () => {
      const r = await t.rest.get(
        `invoices?customer_id=eq.${odb.id}&deleted_at=is.null&select=id,invoice_number,total,created_at&order=created_at`,
      );
      return r.data ?? [];
    };
    const zmazane = new Set();
    const uprac = (f) => {
      if (zmazane.has(f.id)) return;
      zmazane.add(f.id);
      t.uprac(`faktúra ${f.invoice_number}`, () => zmazFakturuNatvrdo(t, f.id));
    };
    const rezervacie = async () => {
      const r = await t.rest.get(
        `invoice_number_reservations?company_id=eq.${firma}&select=invoice_number,used_at,created_at&order=invoice_number`,
      );
      return r.data ?? [];
    };

    const page = await otvorApku(t);
    const ctx = page.context();
    const nastavenie = async () => {
      await zalozka(page, -1);
      await tlacidlo(page, /Nastavenie aplikácie/).click();
      await page.getByText("Vystavovať bez signálu rovno s číslom").first().waitFor();
    };

    // Kód sprievodcu a zoznamu sa načíta, kým je signál (v telefóne je v balíčku).
    await t.krok("príprava so signálom", async () => {
      await zalozka(page, 0);
      await page
        .locator("main")
        .getByRole("button", { name: /^Faktúra$/ })
        .first()
        .click();
      await page.getByPlaceholder("Hľadať odberateľa").waitFor();
      await zalozka(page, 1);
      await zalozka(page, 0);
    });

    await t.krok("odložená faktúra bez signálu", async () => {
      await ctx.setOffline(true);
      try {
        const text = await vystavVApke(page, {
          odberatel: odb.name,
          polozka: `${t.znacka} odložená`,
          cena: 10,
        });
        t.over(
          /odložená v telefóne/.test(text),
          `čakal som odloženú faktúru: ${text.slice(0, 120)}`,
        );
        await tlacidlo(page, /^Hotovo$/).click();
        t.over((await faktury()).length === 0, "faktúra je na serveri, hoci nebol signál");
      } finally {
        await ctx.setOffline(false);
      }
      // Zoznam faktúr pri otvorení pošle, čo čaká (v telefóne aj poslucháč siete).
      await zalozka(page, 1);
      const [f] = await t.cakajNa(
        "odložená faktúra na serveri",
        async () => {
          const z = await faktury();
          return z.length ? z : null;
        },
        { limit: 40000 },
      );
      uprac(f);
      t.over(f.invoice_number, "odložená faktúra nemá číslo");
      t.over(Math.abs(Number(f.total) - 12.3) < 0.001, `suma ${f.total}, čakal som 12.30`);
    });

    const pripravene = await t.krok("zapnutie čísel dopredu", async () => {
      await nastavenie();
      await tlacidlo(page, /^Zapnúť$/).click();
      await page
        .getByText(/Pripravených čísel: 5/)
        .first()
        .waitFor({ timeout: 20000 });
      const volne = (await rezervacie()).filter(
        (r) => !r.used_at && Date.now() - new Date(r.created_at).getTime() < 120000,
      );
      t.over(volne.length >= 5, `na serveri je ${volne.length} rezervácií, čakal som 5`);
      const cisla = volne.map((r) => r.invoice_number).sort();
      /*
        Použitá rezervácia ostáva v tabuľke aj po zmazaní faktúry (klient ju
        RLS zmazať nesmie). Generátor čísel berie len nepoužité, takže nič neblokuje.
      */
      return cisla;
    });

    const cislo = await t.krok("faktúra s číslom bez signálu", async () => {
      // Z nastavení späť na Prehľad (obrazovka účtu nemá spodnú lištu).
      await t.go("/app", page);
      await page
        .getByText(/Neuhradené faktúry/)
        .first()
        .waitFor({ timeout: 40000 });
      await ctx.setOffline(true);
      let text;
      try {
        text = await vystavVApke(page, {
          odberatel: odb.name,
          polozka: `${t.znacka} s číslom`,
          cena: 20,
        });
        await tlacidlo(page, /^Hotovo$/).click();
      } finally {
        await ctx.setOffline(false);
      }
      t.over(
        /Faktúra má pridelené číslo/.test(text),
        `čakal som pridelené číslo: ${text.slice(0, 120)}`,
      );
      const c = pripravene.find((x) => text.includes(x));
      t.over(c, `číslo na obrazovke nie je z rezervovaných (${pripravene.join(", ")})`);
      t.over(
        c === pripravene[0],
        `appka nevzala najnižšie rezervované číslo (${c} ≠ ${pripravene[0]})`,
      );
      return c;
    });

    await t.krok("po pripojení sa zapíše s tým istým číslom", async () => {
      await zalozka(page, 1);
      const f = await t.cakajNa(
        "faktúra s rezervovaným číslom",
        async () => (await faktury()).find((x) => x.invoice_number === cislo),
        { limit: 40000 },
      );
      uprac(f);
      t.over(Math.abs(Number(f.total) - 24.6) < 0.001, `suma ${f.total}, čakal som 24.60`);
      const rez = (await rezervacie()).find((r) => r.invoice_number === cislo);
      t.over(rez?.used_at, "rezervácia použitého čísla nie je označená");
      const r = await t.rest.get(
        `invoices?company_id=eq.${firma}&invoice_number=eq.${cislo}&deleted_at=is.null&select=id`,
      );
      t.over(r.data?.length === 1, `číslo ${cislo} má ${r.data?.length} živých faktúr`);
    });

    await t.krok("vypnutie vráti nepoužité čísla", async () => {
      await nastavenie();
      await tlacidlo(page, /^Vypnúť$/).click();
      await page
        .getByText(/Nepoužité čísla sa vrátili do radu/)
        .first()
        .waitFor({ timeout: 20000 });
      const zostali = (await rezervacie()).filter(
        (r) => !r.used_at && pripravene.includes(r.invoice_number),
      );
      t.over(!zostali.length, `po vypnutí server drží ${zostali.map((r) => r.invoice_number)}`);
    });
  },
};
