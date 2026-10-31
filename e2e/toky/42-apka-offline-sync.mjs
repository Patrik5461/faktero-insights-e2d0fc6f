/*
  Mobilná appka bez signálu — hlbšie prípady než 27-apka-offline.

  1. Bez signálu (`setOffline`) sa vystavia dve faktúry s rezervovanými číslami
     a naskenuje sa bloček s českým QR (EET — číta sa bez Finančnej správy, AI sa
     nevolá).
  2. Appka sa zavrie a otvorí znova, stále bez signálu: balíček sa podáva z
     vyrovnávacej pamäte (v telefóne je na disku), faktúry aj bloček musia byť
     stále vo fronte.
  3. Signál sa vráti, ale prvé odoslanie faktúry aj bločku dorazí na server a
     odpoveď sa stratí (výpadok uprostred synchronizácie). Ďalší pokus nesmie
     nič zdvojiť: dve faktúry presne s rezervovanými číslami, jeden bloček.
  4. Konflikt: faktúra otvorená na opravu v appke sa medzitým zmení „na webe";
     uloženie z appky ju nesmie prepísať.
  Všetko sa na konci zmaže, nepoužité rezervácie sa uvoľnia.
*/
import { createRequire } from "node:module";
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";
import { SUPABASE, cestaModulu, prihlasRest, qaHeslo } from "../lib/prostredie.mjs";
import { otvorApku, otvorFakturuVApke, tlacidlo, vystavVApke, zalozka } from "../lib/apka.mjs";
import { balicekVPamati } from "../lib/apka-offline.mjs";

const qrPng = async (text) => {
  const qr = createRequire(import.meta.url)(cestaModulu("qrcode"));
  return qr.toBuffer(text, { width: 600, margin: 4 });
};

export default {
  popis:
    "appka bez signálu: 2 faktúry + bloček, znovuotvorenie, výpadok pri synchronizácii, konflikt",
  limit: 300000,
  async spusti(t) {
    const firma = t.firmy.test;
    const bkp = `${Date.now().toString(16).toUpperCase().slice(-8)}-E2E0FF11`;
    const qrText = `EET*1.0*BKP:${bkp}*DIC:45316872*KC:12.40*DT:202610301200*R:B*`;

    const odb = await t.rest.vloz("customers", {
      company_id: firma,
      name: `${t.znacka} Sync s.r.o.`,
      street: "Testovacia 2",
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
    const faktury = async () =>
      (
        await t.rest.get(
          `invoices?customer_id=eq.${odb.id}&select=id,invoice_number,total,deleted_at,external_id,notes,intro_note,updated_at&order=created_at`,
        )
      ).data ?? [];
    t.uprac("faktúry", async () => {
      for (const f of await faktury()) await zmazFakturuNatvrdo(t, f.id);
    });
    const blocky = async () =>
      (
        await t.rest.get(
          `expense_documents?company_id=eq.${firma}&qr_raw=eq.${encodeURIComponent(qrText)}&select=id,total_amount,file_path,external_id`,
        )
      ).data ?? [];
    const zaciatok = new Date().toISOString();
    t.uprac("bloček a jeho fotky", async () => {
      for (const b of await blocky()) await t.rest.delete(`expense_documents?id=eq.${b.id}`);
      /*
        Fotky v úložisku: tá z bločku aj prípadné kópie z opakovaného pokusu
        (staršie vydania appky nahrávali fotku pri každom pokuse znova).
      */
      const { jwt } = await prihlasRest(qaHeslo());
      const h = {
        apikey: SUPABASE.kluc,
        Authorization: `Bearer ${jwt}`,
        "content-type": "application/json",
      };
      const zoznam = await fetch(`${SUPABASE.url}/storage/v1/object/list/expense-receipts`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          prefix: firma,
          limit: 200,
          sortBy: { column: "created_at", order: "desc" },
        }),
      }).then((r) => r.json());
      const mena = (Array.isArray(zoznam) ? zoznam : [])
        .filter((o) => o.name?.endsWith(".png") && o.created_at >= zaciatok)
        .map((o) => `${firma}/${o.name}`);
      const odkazy = new Set(
        (
          (
            await t.rest.get(
              `expense_documents?company_id=eq.${firma}&created_at=gte.${zaciatok}&select=file_path`,
            )
          ).data ?? []
        ).map((x) => x.file_path),
      );
      const siroty = mena.filter((m) => !odkazy.has(m));
      if (siroty.length)
        await fetch(`${SUPABASE.url}/storage/v1/object/expense-receipts`, {
          method: "DELETE",
          headers: h,
          body: JSON.stringify({ prefixes: siroty }),
        });
    });

    let page = await otvorApku(t);
    const ctx = page.context();
    const siet = await balicekVPamati(ctx, t.base);

    const pripravene = await t.krok("zapnutie čísel dopredu a príprava so signálom", async () => {
      await zalozka(page, -1);
      await tlacidlo(page, /Nastavenie aplikácie/).click();
      await page.getByText("Vystavovať bez signálu rovno s číslom").first().waitFor();
      const zapni = tlacidlo(page, /^Zapnúť$/);
      if (await zapni.isVisible().catch(() => false)) await zapni.click();
      await page
        .getByText(/Pripravených čísel: 5/)
        .first()
        .waitFor({ timeout: 20000 });
      const r = await t.rest.get(
        `invoice_number_reservations?company_id=eq.${firma}&used_at=is.null&select=invoice_number&order=invoice_number`,
      );
      const cisla = (r.data ?? []).map((x) => x.invoice_number);
      t.over(cisla.length >= 5, `server drží ${cisla.length} rezervácií, čakal som 5`);
      // Kód sprievodcu, zoznamu aj skenera sa načíta, kým je signál (v telefóne je v balíčku).
      await t.go("/app", page);
      await zalozka(page, 0);
      await page
        .locator("main")
        .getByRole("button", { name: /^Faktúra$/ })
        .first()
        .click();
      await page.getByPlaceholder("Hľadať odberateľa").waitFor();
      await zalozka(page, 1);
      await zalozka(page, 3);
      await zalozka(page, 2);
      await tlacidlo(page, /^Odfotiť$/).waitFor();
      await tlacidlo(page, /^Zavrieť$/).click();
      await zalozka(page, 0);
      return cisla;
    });

    const vydane = await t.krok("dve faktúry bez signálu", async () => {
      await siet.odpoj(true);
      const cisla = [];
      for (const [i, cena] of [
        [1, 10],
        [2, 20],
      ]) {
        const text = await vystavVApke(page, {
          odberatel: odb.name,
          polozka: `${t.znacka} offline ${i}`,
          cena,
          /*
            Na webe sú hlášky dole cez tlačidlo Vystaviť (v balíčku appky hore)
            a pod kurzorom z posledného ťuknutia sa nezatvoria — kurzor preč a
            počkať, kým zmiznú.
          */
          predVystavenim: async (p) => {
            await p.mouse.move(5, 5);
            await p
              .locator("[data-sonner-toast]")
              .first()
              .waitFor({ state: "detached", timeout: 15000 })
              .catch(() => {});
          },
        });
        const c = pripravene.find((x) => text.includes(x));
        t.over(c, `faktúra ${i}: na obrazovke nie je rezervované číslo: ${text.slice(0, 160)}`);
        cisla.push(c);
        await tlacidlo(page, /^Hotovo$/).click();
        await page.waitForTimeout(500);
      }
      t.over(cisla[0] !== cisla[1], `obe faktúry dostali to isté číslo ${cisla[0]}`);
      t.over(
        cisla[0] === pripravene[0] && cisla[1] === pripravene[1],
        `čísla nejdú po poradí rezervácií: ${cisla} vs ${pripravene.slice(0, 2)}`,
      );
      t.over((await faktury()).length === 0, "faktúra je na serveri, hoci nebol signál");
      return cisla;
    });

    await t.krok("bloček bez signálu", async () => {
      await zalozka(page, 2);
      // So signálom sa otvorí kamera; bez neho (alebo bez kamery) ponuka „Odfotiť doklad".
      const kamera = tlacidlo(page, /^Odfotiť$/);
      const ponuka = tlacidlo(page, /^Odfotiť doklad/);
      await kamera.or(ponuka).first().waitFor();
      const naKamere = await kamera.isVisible().catch(() => false);
      t.log(naKamere ? "skener: kamera" : "skener: ponuka");
      if (naKamere) await tlacidlo(page, /^Karta$/).click();
      /*
        Bez kamery „Odfotiť" otvorí ponuku a až „Odfotiť doklad" v nej výber
        súboru — ťuká sa, kým sa výber neotvorí.
      */
      let vyber = null;
      const cakaj = page.waitForEvent("filechooser", { timeout: 25000 }).then((v) => (vyber = v));
      for (let i = 0; i < 4 && !vyber; i++) {
        for (const b of [ponuka, kamera, tlacidlo(page, /^Vybrať súbor|^Odfotiť$/)])
          if (!vyber && (await b.isVisible().catch(() => false))) {
            await b.click().catch(() => {});
            await page.waitForTimeout(1500);
            break;
          }
      }
      await cakaj;
      await vyber.setFiles({
        name: "blocek.png",
        mimeType: "image/png",
        buffer: await qrPng(qrText),
      });
      // Kamera dokladu môže ešte ponúknuť orez — potvrdí sa, čo ponúkne.
      // Skontrolujte doklad → úhrada kartou → uložiť (bez signálu ide do fronty).
      await page.getByText("Skontrolujte doklad").first().waitFor({ timeout: 30000 });
      t.over(
        await page
          .getByText(/Bez signálu/)
          .first()
          .isVisible(),
        "kontrola bločku nepovedala, že je bez signálu",
      );
      await tlacidlo(page, /^Kartou$/).click();
      const ulozit = page
        .getByRole("button", { name: /^Uložiť/ })
        .filter({ hasNot: page.locator("[disabled]") })
        .first();
      await ulozit.click();
      await page
        .getByText(/doklad sa odošle sám/)
        .first()
        .waitFor({ timeout: 15000 });
      await page.screenshot({ path: `${t.vystup}/apka-offline-blocek.png` });
      t.log(
        "po bločku:",
        (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300),
      );
      t.over((await blocky()).length === 0, "bloček je na serveri, hoci nebol signál");
    });

    let prehladBezSiete = null;
    await t.krok("zatvorenie a otvorenie appky bez signálu", async () => {
      await page.close();
      page = await ctx.newPage();
      page.setDefaultTimeout(20000);
      await page.goto(`${t.base}/app`, { waitUntil: "domcontentloaded" });
      // Prehľad bez signálu nesmie tvrdiť „0 faktúr / Nič nečaká" — vyhodnotí sa na konci.
      await zalozka(page, 0);
      await page.waitForTimeout(2500);
      prehladBezSiete = {
        pas: await page
          .locator("[data-bez-siete]")
          .first()
          .isVisible()
          .catch(() => false),
        text: (await page.locator("main").first().innerText()).replace(/\s+/g, " "),
      };
      await zalozka(page, 1);
      const text = await page.locator("main").last().innerText();
      for (const c of vydane)
        t.over(
          text.includes(c),
          `po znovuotvorení chýba čakajúca faktúra ${c}: ${text.slice(0, 200)}`,
        );
      const doklady = await page.evaluate(
        () =>
          new Promise((ok) => {
            const r = indexedDB.open("faktero", 1);
            r.onsuccess = () => {
              try {
                const q = r.result
                  .transaction("doklady-fronta")
                  .objectStore("doklady-fronta")
                  .getAll();
                q.onsuccess = () => ok(q.result.length);
                q.onerror = () => ok(-1);
              } catch {
                ok(-2);
              }
            };
            r.onerror = () => ok(-3);
          }),
      );
      t.over(doklady === 1, `vo fronte dokladov je ${doklady} záznamov, čakal som 1 bloček`);
    });

    await t.krok("výpadok uprostred synchronizácie nič nezdvojí", async () => {
      // Prvý zápis faktúry aj bločku na server prejde, ale odpoveď sa „stratí".
      const stratene = { faktura: 0, blocek: 0 };
      await page.route("**/_serverFn/**", async (route) => {
        const telo = route.request().postData() ?? "";
        const druh = telo.includes("reserved_number")
          ? "faktura"
          : telo.includes(bkp) && telo.includes("file_path")
            ? "blocek"
            : null;
        if (!druh || stratene[druh] >= 1) return route.fallback();
        stratene[druh]++;
        await route.fetch().catch(() => {});
        return route.abort("connectionreset");
      });
      await siet.odpoj(false);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page.waitForTimeout(8000);
      // Druhé kolo: zoznam faktúr a dokladov pri otvorení posiela, čo čaká.
      await zalozka(page, 0);
      await zalozka(page, 1);
      await zalozka(page, 3);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      const z = await t.cakajNa(
        "obe faktúry na serveri",
        async () => {
          const f = (await faktury()).filter((x) => !x.deleted_at);
          return f.length >= 2 ? f : null;
        },
        { limit: 60000 },
      );
      await page.waitForTimeout(4000);
      const vsetky = (await faktury()).filter((x) => !x.deleted_at);
      t.over(stratene.faktura === 1, `výpadok faktúry sa nenasimuloval (${stratene.faktura})`);
      t.over(vsetky.length === 2, `na serveri je ${vsetky.length} faktúr, čakal som 2`);
      const cisla = vsetky.map((x) => x.invoice_number).sort();
      t.over(
        JSON.stringify(cisla) === JSON.stringify([...vydane].sort()),
        `čísla na serveri ${cisla} ≠ sľúbené ${vydane}`,
      );
      t.over(
        Math.abs(Number(z[0].total) + Number(z[1].total) - 36.9) < 0.01,
        "súčet faktúr nesedí",
      );
      const b = await t.cakajNa(
        "bloček na serveri",
        async () => {
          const x = await blocky();
          return x.length ? x : null;
        },
        { limit: 60000 },
      );
      await page.waitForTimeout(4000);
      const b2 = await blocky();
      t.over(b2.length === 1, `bloček je na serveri ${b2.length}×`);
      t.over(Number(b[0].total_amount) === 12.4, `suma bločku ${b[0].total_amount}`);
      await page.unroute("**/_serverFn/**");
    });

    await t.krok("oprava naraz: databáza odmietne starú verziu", async () => {
      const [, f] = (await faktury()).filter((x) => !x.deleted_at);
      const polozky = [
        {
          position: 1,
          name: `${t.znacka} RPC`,
          quantity: 2,
          unit: "ks",
          unit_price: 5,
          vat_rate: 23,
          subtotal: 10,
          vat_amount: 2.3,
          total: 12.3,
        },
      ];
      const stara = await t.rest.rpc("uloz_upravu_faktury", {
        p_id: f.id,
        p_povodne_upravena: "2000-01-01T00:00:00Z",
        p_hlavicka: { notes: "nemá sa zapísať" },
        p_polozky: polozky,
      });
      t.over(
        stara.status === 409 && /faktura_zmenena/.test(stara.text),
        `stará verzia prešla: ${stara.status} ${stara.text.slice(0, 160)}`,
      );
      const ok = await t.rest.rpc("uloz_upravu_faktury", {
        p_id: f.id,
        p_povodne_upravena: f.updated_at,
        p_hlavicka: { notes: `${t.znacka} RPC`, subtotal: 10, vat_total: 2.3, total: 12.3 },
        p_polozky: polozky,
      });
      t.over(ok.status < 300, `oprava zlyhala: ${ok.status} ${ok.text.slice(0, 200)}`);
      const po = (await faktury()).find((x) => x.id === f.id);
      t.over(po.notes === `${t.znacka} RPC` && Number(po.total) === 12.3, "hlavička sa nezapísala");
      const pol = await t.rest.get(`invoice_items?invoice_id=eq.${f.id}&select=name,total`);
      t.over(
        pol.data?.length === 1 && pol.data[0].name === `${t.znacka} RPC`,
        `položky po oprave: ${JSON.stringify(pol.data)}`,
      );
      // Chybná položka (bez názvu) zruší celú opravu — hlavička ostane, ako bola.
      const zla = await t.rest.rpc("uloz_upravu_faktury", {
        p_id: f.id,
        p_povodne_upravena: po.updated_at,
        p_hlavicka: { notes: "nemá sa zapísať", total: 999 },
        p_polozky: [{ position: 1, name: null }],
      });
      t.over(zla.status >= 400, "oprava s chybnou položkou prešla");
      const po2 = (await faktury()).find((x) => x.id === f.id);
      t.over(
        po2.notes === `${t.znacka} RPC` && Number(po2.total) === 12.3,
        "polovičná oprava ostala zapísaná",
      );
      const pol2 = await t.rest.get(`invoice_items?invoice_id=eq.${f.id}&select=name`);
      t.over(pol2.data?.length === 1, "po zlyhanej oprave sa stratili položky");
    });

    await t.krok("konflikt: oprava v appke vs. zmena na webe", async () => {
      const [f] = (await faktury()).filter((x) => !x.deleted_at);
      /*
        Dva pokusy: keď sa medzitým nasadilo nové vydanie, web pri najbližšom
        prechode stránku načíta celú a appka skončí na Prehľade.
      */
      for (let pokus = 0; ; pokus++) {
        try {
          await otvorFakturuVApke(page, f.invoice_number);
          await tlacidlo(page, /^Upraviť faktúru/).click();
          await page.getByPlaceholder("Názov položky").first().waitFor({ timeout: 20000 });
          break;
        } catch (e) {
          if (pokus >= 1) throw e;
          await t.go("/app", page);
        }
      }
      // Medzitým ju niekto opraví na webe.
      const web = await t.rest.patch(`invoices?id=eq.${f.id}`, { notes: `${t.znacka} z webu` });
      t.over(web.status < 300, `zmena „na webe" zlyhala: ${web.status} ${web.text.slice(0, 160)}`);
      await page.getByPlaceholder("Názov položky").first().fill(`${t.znacka} z appky`);
      await tlacidlo(page, /^Ďalej$/).click();
      await tlacidlo(page, /^Uložiť zmeny|^Uložiť opravu|^Uložiť$/).click();
      await page.waitForTimeout(4000);
      const po = (await faktury()).find((x) => x.id === f.id);
      t.over(
        po.notes === `${t.znacka} z webu`,
        `oprava z appky prepísala zmenu z webu (poznámka „${po.notes}")`,
      );
      const pol = await t.rest.get(`invoice_items?invoice_id=eq.${f.id}&select=name`);
      t.over(
        !(pol.data ?? []).some((p) => p.name.includes("z appky")),
        "appka zapísala položky napriek konfliktu",
      );
      t.over(
        t.hlasky.some((h) => /zmenil niekto iný/.test(h)),
        `appka nepovedala, že faktúru zmenil niekto iný (hlášky: ${t.hlasky.slice(-3).join(" | ")})`,
      );
    });

    await t.krok("Prehľad bez signálu priznal, že je bez signálu", async () => {
      t.over(prehladBezSiete, "Prehľad bez signálu sa neotvoril");
      t.over(
        prehladBezSiete.pas,
        `Prehľad bez signálu nemá pás „Bez pripojenia" (${prehladBezSiete.text.slice(0, 160)})`,
      );
      t.over(
        !/Nič nečaká|Zatiaľ sa nič nedialo/.test(prehladBezSiete.text),
        "Prehľad bez signálu tvrdí, že nič nečaká",
      );
    });
  },
};
