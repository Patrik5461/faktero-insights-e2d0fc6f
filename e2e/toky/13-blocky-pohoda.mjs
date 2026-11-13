/*
  Bločky do Pohody vo veľkom: 400+ dokladov v jednom mesiaci (dávky id),
  bloček v cudzej mene s kurzom, PHM na vozidle s 50 % odpočtom DPH a
  hotovosť v cudzej mene. Tá je od 13. 11. 2026 „závažná“ chyba: export
  najprv ukáže okno `potvrd()` („Opravím to“ = nič sa nestiahne, „Exportovať
  aj tak“ = ide do XML aj ona). XML proti XSD Stormware, potom „Odovzdať
  účtovníkovi“ (znova cez okno) označí všetko, čo bolo v XML. Upratanie vráti
  odovzdanie a zmaže doklady, vozidlo aj záznamy exportu.
*/
import { readFileSync } from "node:fs";
import { overXsd, SCHEMY, textXml } from "../lib/xml.mjs";

const MESIAC = "2026-12"; // mimo bežnej práce v QA firme, aby „všetko“ bolo len naše
const VYPLN = 410;

export default {
  popis: "bločky: 400+ do Pohody, cudzia mena, PHM 50/50, odovzdanie",
  limit: 300000,
  firma: "test2",
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test2;
    const cislo = (s) => `${t.znacka}-${s}`;
    const teraz = new Date().toISOString();

    t.uprac("bločky, vozidlo a exporty", async () => {
      const r = await t.rest.get(
        `expense_documents?company_id=eq.${firma}&document_number=like.${t.znacka}-*&select=id,export_job_id`,
      );
      const ids = (r.data ?? []).map((d) => d.id);
      const joby = [...new Set((r.data ?? []).map((d) => d.export_job_id).filter(Boolean))];
      for (let i = 0; i < ids.length; i += 150) {
        const kus = ids.slice(i, i + 150).join(",");
        await t.rest.patch(`expense_documents?id=in.(${kus})`, {
          exported_at: null,
          export_job_id: null,
          status: "processed",
        });
        const z = await t.rest.delete(`expense_documents?id=in.(${kus})`);
        if (z.status >= 300) throw new Error(`${z.status} ${z.text.slice(0, 200)}`);
      }
      for (const j of joby) await t.rest.delete(`export_jobs?id=eq.${j}`);
      await t.rest.delete(`vehicles?company_id=eq.${firma}&name=eq.${t.znacka} auto`);
    });

    const auto = await t.krok("príprava: vozidlo s 50 % odpočtom", () =>
      t.rest.vloz("vehicles", {
        company_id: firma,
        name: `${t.znacka} auto`,
        license_plate: "BA000QA",
        odpocet_dph: "50",
      }),
    );

    await t.krok(`príprava: ${VYPLN + 3} bločkov v ${MESIAC}`, async () => {
      const zaklad = {
        company_id: firma,
        status: "processed",
        source: "web",
        auto_uctovanie_at: teraz,
        supplier_name: `${t.znacka} Obchod s.r.o.`,
      };
      const riadky = [
        {
          ...zaklad,
          document_number: cislo("PHM"),
          supplier_name: `${t.znacka} Čerpacia stanica`,
          issue_date: `${MESIAC}-03`,
          net_amount: 100,
          vat_amount: 23,
          total_amount: 123,
          vat_rate: 23,
          currency: "EUR",
          payment_method: "karta",
          vehicle_id: auto.id,
          category: "PHM",
        },
        {
          ...zaklad,
          document_number: cislo("CZK"),
          issue_date: `${MESIAC}-04`,
          net_amount: 250,
          vat_amount: 0,
          total_amount: 250,
          vat_rate: 0,
          currency: "CZK",
          exchange_rate: 25,
          exchange_rate_date: `${MESIAC}-03`,
          exchange_rate_source: "ecb",
          payment_method: "karta",
        },
        {
          ...zaklad,
          document_number: cislo("CZK-HOT"),
          issue_date: `${MESIAC}-05`,
          net_amount: 100,
          vat_amount: 0,
          total_amount: 100,
          vat_rate: 0,
          currency: "CZK",
          exchange_rate: 25,
          exchange_rate_date: `${MESIAC}-04`,
          exchange_rate_source: "ecb",
          payment_method: "hotovost",
        },
      ];
      for (let i = 0; i < VYPLN; i++)
        riadky.push({
          ...zaklad,
          document_number: cislo(`V${i}`),
          issue_date: `${MESIAC}-${String(10 + (i % 18)).padStart(2, "0")}`,
          net_amount: 1,
          vat_amount: 0.23,
          total_amount: 1.23,
          vat_rate: 23,
          currency: "EUR",
          payment_method: "karta",
        });
      // Spúšťač faktero_strazca_duplicity_blocku odmietne bloček s rovnakým dodávateľom, dňom
      // a sumou (výplň je celá po 1,23 €) — každý dostane vlastný kód, potom sa porovnáva len ten.
      for (const r of riadky) r.qr_raw = `QR-${r.document_number}`;
      // PostgREST chce pri hromadnom vložení v každom riadku tie isté kľúče.
      const kluce = [...new Set(riadky.flatMap((r) => Object.keys(r)))];
      for (const r of riadky) for (const k of kluce) if (!(k in r)) r[k] = null;
      for (let i = 0; i < riadky.length; i += 200) {
        const r = await t.rest.post("expense_documents", riadky.slice(i, i + 200), {
          hlavicky: { Prefer: "return=minimal" },
        });
        if (r.status >= 300) throw new Error(`INSERT ${r.status} ${r.text.slice(0, 300)}`);
      }
      const n = await t.rest.pocet(
        `expense_documents?company_id=eq.${firma}&document_number=like.${t.znacka}-*`,
      );
      t.over(n === VYPLN + 3, `vložených ${n}`);
    });

    const zoznam = `/doklady?mesiac=${MESIAC}&stav=vsetky`;
    const stiahnute = await t.krok("XML pre Pohodu — všetko v mesiaci", async () => {
      await t.go(zoznam);
      await page
        .locator("main")
        .getByText(t.znacka)
        .filter({ visible: true })
        .first()
        .waitFor({ timeout: 30000 });
      const tlacidlo = page.getByRole("button", { name: /XML pre Pohodu/ }).first();
      const okno = page
        .getByRole("alertdialog")
        .filter({ hasText: "Pred exportom do Pohody skontrolujte" });
      // „Opravím to“ = nič sa nevyvezie.
      let stiahnuteNavyse = 0;
      const naStiahnutie = () => stiahnuteNavyse++;
      page.on("download", naStiahnutie);
      await tlacidlo.click();
      await okno.waitFor({ timeout: 60000 });
      const text = await okno.innerText();
      t.over(/Závažné/.test(text), `okno bez „Závažné“: ${text.slice(0, 200)}`);
      t.over(text.includes(cislo("CZK-HOT")), "okno nespomína hotovosť v cudzej mene");
      await okno.getByRole("button", { name: "Opravím to" }).click();
      await okno.waitFor({ state: "hidden", timeout: 5000 });
      await page.waitForTimeout(3000);
      page.off("download", naStiahnutie);
      t.over(stiahnuteNavyse === 0, "„Opravím to“ aj tak stiahlo súbor");
      const subor = await t.stiahni(async () => {
        await tlacidlo.click();
        await okno.waitFor({ timeout: 60000 });
        await okno.getByRole("button", { name: "Exportovať aj tak" }).click();
      }, "pohoda");
      const buf = readFileSync(subor);
      return { buf, text: textXml(buf) };
    });

    const xml = stiahnute.text;
    await t.krok("XML platné a úplné", async () => {
      const chyba = await overXsd(stiahnute.buf, SCHEMY.pohoda);
      t.over(!chyba, `XSD: ${chyba}`);
      const polozky = (xml.match(/<dat:dataPackItem /g) ?? []).length;
      // Po „Exportovať aj tak“ ide do XML aj hotovosť v cudzej mene (závažná chyba).
      t.over(polozky === VYPLN + 3, `v XML ${polozky} dokladov, čakal som ${VYPLN + 3}`);
      t.over(xml.includes(cislo("CZK-HOT")), "potvrdená hotovosť v cudzej mene chýba v XML");
    });

    await t.krok("bloček v cudzej mene", async () => {
      const blok = xml
        .split("<dat:dataPackItem ")
        .find((b) => b.includes(cislo("CZK")) && !b.includes(cislo("CZK-HOT")));
      t.over(blok, "bloček CZK nie je v XML");
      t.over(/<typ:ids>CZK<\/typ:ids>/.test(blok), "chýba mena CZK");
      t.over(/<typ:rate>25(\.0+)?<\/typ:rate>/.test(blok), "chýba kurz 25");
      t.over(/foreignCurrency/.test(blok), "chýba foreignCurrency");
      t.over(/250(\.00)?</.test(blok), "chýba suma 250 v cudzej mene");
    });

    await t.krok("PHM na vozidle s 50 % odpočtom", async () => {
      const blok = xml.split("<dat:dataPackItem ").find((b) => b.includes(cislo("PHM")));
      t.over(blok, "PHM nie je v XML");
      // DPH 23 € sa delí na odpočítateľnú a neodpočítateľnú polovicu (11,50 + 11,50).
      const dph = [...blok.matchAll(/<typ:priceVAT>([\d.]+)<\/typ:priceVAT>/g)].map((m) =>
        Number(m[1]),
      );
      const sucet = Math.round(dph.reduce((a, b) => a + b, 0) * 100) / 100;
      t.log("PHM DPH riadkov:", dph.join(" + "));
      t.over(dph.length >= 2, `DPH nie je rozdelená: ${dph.join(", ")}`);
      t.over(sucet === 23, `súčet DPH ${sucet}`);
      t.over(dph.includes(11.5), `chýba polovica 11.50: ${dph.join(", ")}`);
      const ceny = [...blok.matchAll(/<typ:priceSum>([\d.]+)<\/typ:priceSum>/g)].map((m) =>
        Number(m[1]),
      );
      const spolu = Math.round(ceny.reduce((a, b) => a + b, 0) * 100) / 100;
      t.over(spolu === 123, `súčet riadkov ${spolu} ≠ 123`);
    });

    await t.krok("Odovzdať účtovníkovi — všetko z XML je odovzdané", async () => {
      await t.go(zoznam);
      await page
        .locator("main")
        .getByText(t.znacka)
        .filter({ visible: true })
        .first()
        .waitFor({ timeout: 30000 });
      await page.getByRole("button", { name: "Odovzdať účtovníkovi" }).click();
      const okno = page.getByRole("dialog", { name: "Export do účtovníctva" });
      await okno.waitFor();
      await t.stiahni(async () => {
        await okno.getByRole("button", { name: "Exportovať", exact: true }).click();
        // Hotovosť v cudzej mene je závažná chyba — okno, „Exportovať aj tak“.
        await t.potvrd(page, "Exportovať aj tak");
      }, "zip");
      const odovzdane = await t.cakajNa(
        "odovzdanie",
        async () => {
          const n = await t.rest.pocet(
            `expense_documents?company_id=eq.${firma}&document_number=like.${t.znacka}-*&exported_at=not.is.null`,
          );
          return n >= VYPLN + 3 ? n : null;
        },
        { limit: 60000 },
      );
      t.over(odovzdane === VYPLN + 3, `odovzdaných ${odovzdane}`);
    });
  },
};
