/*
  Oznam o plánovanej aktualizácii (platformove_oznamy, OznamAktualizacie v AppShell).

  - bežný prihlásený používateľ oznam nevloží (zapisuje len platformový admin),
    anon tabuľku neprečíta,
  - oznam sa vkladá servisným kľúčom s `len_pre_user_id` = QA účet, takže ho
    klienti nevidia; po toku sa zmaže (t.uprac),
  - 10 min pred začiatkom: okno (role=dialog) raz, po „Rozumiem“ a obnovení
    len pás „Aktualizácia o …“,
  - počas: „Prebieha aktualizácia…“, po: „Faktero je aktualizované“ + Obnoviť
    stránku, po obnovení pás zmizne (stránka už je načítaná po skončení).
  Fázy sa prepínajú posunom `zaciatok` a udalosťou visibilitychange (načítanie
  pri návrate do karty), nie čakaním na 60 s obnovu.
*/
import path from "node:path";
import { HLAVNE_REPO, SUPABASE, citajEnvSubor, klucRelacie } from "../lib/prostredie.mjs";

const MIN = 60_000;

function servisnyRest() {
  const env = citajEnvSubor(path.join(HLAVNE_REPO, ".env"));
  const kluc = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!kluc) return null;
  return async (metoda, cesta, telo) => {
    const r = await fetch(`${SUPABASE.url}/rest/v1/${cesta}`, {
      method: metoda,
      headers: {
        apikey: kluc,
        Authorization: `Bearer ${kluc}`,
        "content-type": "application/json",
        Prefer: "return=representation",
      },
      body: telo === undefined ? undefined : JSON.stringify(telo),
    });
    const text = await r.text();
    if (r.status >= 300) throw new Error(`${metoda} ${cesta}: ${r.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  };
}

export default {
  popis: "oznam o aktualizácii: okno raz, pás pred/počas/po, Obnoviť; zápis len admin",
  limit: 90000,
  async spusti(t) {
    const page = t.page;
    const servis = servisnyRest();
    t.over(servis, "chýba SUPABASE_SERVICE_ROLE_KEY (.env hlavného repa)");

    const zaciatok = (posunMin) => new Date(Date.now() + posunMin * MIN).toISOString();
    const naNavrat = () =>
      page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

    await t.krok("bežný používateľ oznam nevloží, anon ho neprečíta", async () => {
      const p = await t.rest.post("platformove_oznamy", {
        typ: "aktualizacia",
        zaciatok: zaciatok(10),
        trvanie_min: 1,
      });
      t.over(p.status >= 400, `prihlásený vložil oznam (${p.status})`);
      const a = await t.restAnon.get("platformove_oznamy?select=id&limit=1", { anon: true });
      t.over(
        a.status >= 400 || (Array.isArray(a.data) && a.data.length === 0),
        `anon číta oznamy (${a.status})`,
      );
    });

    let id = null;
    await t.krok("oznam len pre QA účet", async () => {
      await t.go("/dashboard");
      const userId = await page.evaluate((k) => {
        try {
          return JSON.parse(localStorage.getItem(k) ?? "null")?.user?.id ?? null;
        } catch {
          return null;
        }
      }, klucRelacie());
      t.over(userId, "id QA používateľa sa nedá zistiť z relácie");
      const [r] = await servis("POST", "platformove_oznamy", {
        typ: "aktualizacia",
        zaciatok: zaciatok(10),
        trvanie_min: 2,
        len_pre_user_id: userId,
        text: null,
      });
      id = r.id;
      t.uprac(`oznam ${id.slice(0, 8)}`, () => servis("DELETE", `platformove_oznamy?id=eq.${id}`));
    });

    await t.krok("pred začiatkom: okno raz, potom len pás", async () => {
      await t.go("/dashboard");
      const okno = page.getByRole("dialog").filter({ hasText: "Plánovaná aktualizácia" });
      await okno.waitFor({ timeout: 20000 });
      await okno.getByRole("button", { name: "Rozumiem" }).click();
      await okno.waitFor({ state: "hidden", timeout: 5000 });
      const pas = page.locator('[data-oznam-aktualizacie="pred"]');
      await pas.waitFor({ timeout: 5000 });
      t.over(/Rozpísanú prácu si uložte/.test(await pas.innerText()), "pás bez textu");
      await t.go("/dashboard");
      await pas.waitFor({ timeout: 20000 });
      t.over((await okno.count()) === 0, "okno sa po obnovení ukázalo znova");
    });

    await t.krok("počas: Prebieha aktualizácia", async () => {
      await servis("PATCH", `platformove_oznamy?id=eq.${id}`, { zaciatok: zaciatok(-0.5) });
      await naNavrat();
      await page
        .locator('[data-oznam-aktualizacie="pocas"]')
        .filter({ hasText: "Prebieha aktualizácia" })
        .waitFor({ timeout: 20000 });
    });

    await t.krok("po: Faktero je aktualizované, Obnoviť ho schová", async () => {
      /* Koniec musí byť po načítaní stránky (tá má ešte „staré vydanie“), inak
         sa „aktualizované“ právom neukáže: koniec = teraz − 3 s, stránka je
         načítaná aspoň 5 s. */
      await page.waitForTimeout(5000);
      await servis("PATCH", `platformove_oznamy?id=eq.${id}`, { zaciatok: zaciatok(-2.05) });
      await naNavrat();
      const po = page.locator('[data-oznam-aktualizacie="po"]');
      await po.filter({ hasText: "Faktero je aktualizované" }).waitFor({ timeout: 20000 });
      await Promise.all([
        page.waitForEvent("load", { timeout: 30000 }),
        po.getByRole("button", { name: "Obnoviť stránku" }).click(),
      ]);
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2000);
      /* Skutočný informačný oznam (typ 'info', napr. „Údržba Faktera…“) môže
         svietiť všetkým naraz — ten tok nerieši; po obnovení nesmie ostať pás
         tohto toku (pred/počas/po). */
      t.over(
        (await page
          .locator('[data-oznam-aktualizacie]:not([data-oznam-aktualizacie="info"])')
          .count()) === 0,
        "pás po obnovení ostal",
      );
    });
  },
};
