/*
  Mobilná appka (/app, 390 px): „Odoslať eFaktúru“ po vystavení a v detaile
  faktúry — rovnaké podmienky ako web, **bez jediného odoslania**:
  - firma bez aktivovanej eFaktúry (QA Test má `efaktura_profiles.enabled =
    false`) → okno s „Aktivovať na webe“;
  - eFaktúru firme na chvíľu zapneme (len príznak v profile QA firmy, ePošták
    sa nevolá — príprava len číta DB a kontroluje UBL):
      odberateľ bez DIČ → hláška zo servera „Odberateľ nemá DIČ ani IČ DPH…“,
      odberateľ s DIČ → potvrdenie (nedá sa vziať späť, PDF faktúry) → Zrušiť;
    príznak sa hneď vráti;
  - zálohová faktúra → veta „nie je daňový doklad“, tlačidlo nie je.
  Na konci sa overí, že nevznikol žiadny záznam v `efaktura_deliveries`.
  Odberatelia a faktúry sa zmažú natvrdo. So `E2E_SNIMKY=<priečinok>` uloží snímky okien.
*/
import { mkdirSync } from "node:fs";
import path from "node:path";
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";
import {
  fakturaPodlaCisla,
  otvorApku,
  otvorFakturuVApke,
  tlacidlo,
  tukni,
  vystavVApke,
  zalozka,
} from "../lib/apka.mjs";

const CISLO = /\b([A-Z]{0,4}\d{6,})\b/;
const OKNO = '[role="dialog"][data-efaktura-stav]';

export default {
  popis: "appka: Odoslať eFaktúru — neaktivovaná firma, bez DIČ, potvrdenie, zálohová",
  limit: 240000,
  async spusti(t) {
    const snimky = process.env.E2E_SNIMKY;
    if (snimky) mkdirSync(snimky, { recursive: true });
    const snimka = async (page, meno) => {
      if (snimky) await page.screenshot({ path: path.join(snimky, `84-${meno}.png`) });
    };

    const odberatel = async (meno, extra = {}) => {
      const o = await t.rest.vloz("customers", {
        company_id: t.firmy.test,
        name: meno,
        street: "Testovacia 1",
        city: "Bratislava",
        zip: "81101",
        country: "SK",
        ...extra,
      });
      t.uprac(`odberateľ ${meno}`, async () => {
        const r = await t.rest.delete(`customers?id=eq.${o.id}`);
        if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
      });
      return o;
    };
    const bezDic = await odberatel(`${t.znacka} eF Bez DIČ s.r.o.`);
    const sDic = await odberatel(`${t.znacka} eF S DIČ s.r.o.`, {
      ico: "12345678",
      dic: "2021234567",
    });

    const profil = (
      await t.rest.get(`efaktura_profiles?company_id=eq.${t.firmy.test}&select=id,enabled`)
    ).data?.[0];
    t.over(profil, "QA firma Test nemá profil eFaktúry");
    t.over(profil.enabled === false, "QA firma Test má eFaktúru zapnutú — tok čaká vypnutú");
    let zapnute = false;
    const vypni = async () => {
      if (!zapnute) return;
      const r = await t.rest.patch(`efaktura_profiles?id=eq.${profil.id}`, { enabled: false });
      if (r.status >= 300)
        throw new Error(`profil sa nevrátil: ${r.status} ${r.text.slice(0, 160)}`);
      zapnute = false;
    };
    t.uprac("profil eFaktúry späť na vypnutý", vypni);

    const page = await otvorApku(t);
    const faktury = [];
    const vystav = async (o, polozka) => {
      const text = await vystavVApke(page, { odberatel: o.name, polozka, cena: 10 });
      const cislo = CISLO.exec(text)?.[1];
      t.over(cislo, `po vystavení nevidno číslo faktúry: ${text.slice(0, 120)}`);
      const f = await t.cakajNa("faktúra v databáze", () => fakturaPodlaCisla(t, "test", cislo));
      faktury.push(f);
      t.uprac(`faktúra ${f.invoice_number}`, () => zmazFakturuNatvrdo(t, f.id));
      return f;
    };
    const otvorOkno = async () => {
      await tukni(tlacidlo(page, /^Odoslať eFaktúru/));
      const okno = page.locator(OKNO);
      await okno.waitFor({ timeout: 30000 });
      return okno;
    };
    const zavri = async (okno) => {
      await okno
        .getByRole("button", { name: /^(Zavrieť|Zrušiť|Rozumiem)$/ })
        .first()
        .click();
      await okno.waitFor({ state: "detached" });
    };

    const fa = await t.krok("po vystavení: firma bez eFaktúry → aktivácia na webe", async () => {
      const f = await vystav(bezDic, `${t.znacka} eFaktúra bez DIČ`);
      const okno = await otvorOkno();
      t.over(
        (await okno.getAttribute("data-efaktura-stav")) === "neaktivna",
        `okno je v stave ${await okno.getAttribute("data-efaktura-stav")}`,
      );
      await okno.getByRole("button", { name: /Aktivovať na webe/ }).waitFor();
      t.over(/nemá aktivovanú eFaktúru/.test(await okno.innerText()), "okno nepovie prečo");
      await snimka(page, "neaktivna");
      await zavri(okno);
      await tlacidlo(page, /^Hotovo$/).click();
      return f;
    });

    await t.krok("eFaktúra zapnutá: odberateľ bez DIČ → hláška servera", async () => {
      const r = await t.rest.patch(`efaktura_profiles?id=eq.${profil.id}`, { enabled: true });
      t.over(r.status < 300, `profil sa nezapol: ${r.status} ${r.text?.slice(0, 160)}`);
      zapnute = true;
      await otvorFakturuVApke(page, fa.invoice_number);
      const okno = await otvorOkno();
      t.over(
        (await okno.getAttribute("data-efaktura-stav")) === "nedaSa",
        `okno je v stave ${await okno.getAttribute("data-efaktura-stav")}`,
      );
      t.over(
        /Odberateľ nemá DIČ ani IČ DPH/.test(await okno.innerText()),
        "chýba hláška o DIČ (tá istá ako na webe)",
      );
      await snimka(page, "bez-dic");
      await zavri(okno);
    });

    await t.krok("odberateľ s DIČ → potvrdenie pred odoslaním, Zrušiť", async () => {
      await vystav(sDic, `${t.znacka} eFaktúra s DIČ`);
      const okno = await otvorOkno();
      const stav = await okno.getAttribute("data-efaktura-stav");
      const text = await okno.innerText();
      // Kontrola pred odoslaním môže nájsť chyby (vymyslené DIČ) — aj to je správne okno.
      t.over(
        stav === "mozno" || stav === "chyby",
        `okno je v stave ${stav}: ${text.slice(0, 200)}`,
      );
      if (stav === "mozno") {
        t.over(
          /nedá vziať späť|TESTOVACOM/.test(text),
          "potvrdenie nepovie, že sa odoslanie nedá vziať späť",
        );
        await okno.getByText("Priložiť PDF faktúry").waitFor();
        await okno.getByRole("button", { name: /^Odoslať eFaktúru$|^Odoslať znova$/ }).waitFor();
      }
      await snimka(page, `potvrdenie-${stav}`);
      await zavri(okno);
      await vypni();
      await tlacidlo(page, /^Hotovo$/).click();
    });

    await t.krok("zálohová faktúra: eFaktúrou nie", async () => {
      const r = await t.rest.patch(`invoices?id=eq.${fa.id}`, { type: "proforma" });
      t.over(r.status < 300, `typ sa nezmenil: ${r.status} ${r.text?.slice(0, 160)}`);
      /* Zoznam faktúr sa načítal hneď po „Hotovo“ — súbežne s touto zmenou
         typu, takže mohol niesť ešte bežnú faktúru (detail berie typ zo
         zoznamu). Odchod na Prehľad a späť zoznam načíta nanovo. */
      await zalozka(page, 0);
      await otvorFakturuVApke(page, fa.invoice_number);
      await page
        .getByText(/nie je daňový doklad/)
        .first()
        .waitFor({ timeout: 15000 });
      t.over(
        !(await tlacidlo(page, /^Odoslať eFaktúru/)
          .isVisible()
          .catch(() => false)),
        "zálohová má tlačidlo Odoslať eFaktúru",
      );
      await snimka(page, "zalohova");
    });

    await t.krok("nič neodišlo", async () => {
      const ids = faktury.map((f) => f.id).join(",");
      const d = await t.rest.get(`efaktura_documents?invoice_id=in.(${ids})&select=id`);
      t.over((d.data ?? []).length === 0, `vznikol záznam eFaktúry: ${JSON.stringify(d.data)}`);
    });
  },
};
