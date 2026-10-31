/*
  Trans.eu bez skutočného Trans.eu: Nastavenia → Trans.eu, vlastné prístupové
  údaje, Pripojiť (presmerovanie na auth.platform.trans.eu sa zachytí v
  prehliadači — von nejde nič), odmietnutia v callbacku (chýbajúci kód,
  chyba z Trans.eu, zlý/zmenený state, CSRF bez cookie), REST bez tokenov
  a hook bez cron tokenu.

  Výmena kódu za token sa tu zámerne neskúša — išla by na Trans.eu. Celý tok
  s podvrhnutým Trans.eu je v src/lib/faktero/transeu.db.test.ts
  (`npm run test:db -- transeu`).
*/
const CALLBACK = "/api/public/transeu/callback";
const COOKIE = "faktero_transeu_oauth";

export default {
  popis: "Trans.eu: nastavenie, Pripojiť, odmietnutia v callbacku, tokeny mimo REST, hook 401",
  firma: "test",
  limit: 120000,
  async spusti(t) {
    const firma = t.firmy.test;

    /** Callback bez prehliadača (bez cookie); vráti kód z `?chyba=` alebo „pripojene“. */
    const callback = async (q, hlavicky = {}) => {
      const r = await fetch(`${t.base}${CALLBACK}?${new URLSearchParams(q)}`, {
        redirect: "manual",
        headers: hlavicky,
      });
      t.over(r.status === 302, `callback vrátil ${r.status} namiesto presmerovania`);
      const kam = new URL(r.headers.get("location"));
      t.over(kam.pathname === "/nastavenia/transeu", `callback presmeroval na ${kam.pathname}`);
      return (
        kam.searchParams.get("chyba") ?? (kam.searchParams.get("pripojene") ? "pripojene" : "")
      );
    };

    await t.krok("hook transeu-sync bez tokenu vráti 401", async () => {
      for (const h of [{}, { "x-faktero-cron-token": "zly-token" }]) {
        const r = await fetch(`${t.base}/api/public/hooks/transeu-sync`, {
          method: "POST",
          headers: { "content-type": "application/json", ...h },
          body: "{}",
        });
        t.over(r.status === 401, `hook bez platného tokenu vrátil ${r.status}`);
      }
    });

    await t.krok("callback: chýbajúci kód, chyba z Trans.eu, nezmyselný state", async () => {
      t.over((await callback({})) === "missing_code", "bez kódu neprišlo missing_code");
      t.over(
        (await callback({ state: "x" })) === "missing_code",
        "bez kódu (so state) neprišlo missing_code",
      );
      t.over(
        (await callback({ error: "access_denied", state: "x" })) === "access_denied",
        "chyba z Trans.eu neprešla ako access_denied",
      );
      const divna = await callback({ error: '<img src=x onerror="alert(1)">' });
      t.over(!/[<>"]/.test(divna), `chyba z Trans.eu prešla do adresy surová: ${divna}`);
      t.over(
        (await callback({ code: "abc", state: "nezmysel" })) === "invalid_state",
        "nezmyselný state neodmietnutý",
      );
    });

    await t.krok("REST: tokeny a kľúče Trans.eu nie sú čitateľné", async () => {
      for (const stlpec of [
        "access_token_sifrovany",
        "refresh_token_sifrovany",
        "client_secret_sifrovany",
        "api_kluc_sifrovany",
        "*",
      ]) {
        const r = await t.rest.get(`transeu_napojenia?company_id=eq.${firma}&select=${stlpec}`);
        t.over(r.status >= 400, `${stlpec} je čitateľný cez REST (${r.status})`);
      }
      const ok = await t.rest.get(`transeu_napojenia?company_id=eq.${firma}&select=stav`);
      t.over(ok.status === 200, `bezpečné stĺpce nečitateľné (${ok.status})`);
      const anon = await t.restAnon.get(`transeu_napojenia?select=stav`, { anon: true });
      t.over(
        anon.status >= 400 || (Array.isArray(anon.data) && anon.data.length === 0),
        `anon číta transeu_napojenia (${anon.status})`,
      );
      const anonObj = await t.restAnon.get(`transeu_objednavky?select=id`, { anon: true });
      t.over(
        anonObj.status >= 400 || (Array.isArray(anonObj.data) && anonObj.data.length === 0),
        `anon číta transeu_objednavky (${anonObj.status})`,
      );
      // Zápis smie len server.
      const zapis = await t.rest.post("transeu_objednavky", {
        company_id: firma,
        transeu_id: `${t.znacka}-rest`,
      });
      t.over(zapis.status >= 400, `REST zapísal do transeu_objednavky (${zapis.status})`);
    });

    const pred = await t.rest.get(`transeu_napojenia?company_id=eq.${firma}&select=stav,client_id`);
    if (pred.data?.length) {
      t.upozornenia.push(
        `firma Test už má napojenie Trans.eu (${pred.data[0].stav}) — Pripojiť sa preskočil, aby sa neprepísalo`,
      );
      return;
    }

    const page = t.page;
    let ciel = null;
    // Prehliadač na Trans.eu nepustíme — stačí adresa, kam by išiel.
    await page.route("https://auth.platform.trans.eu/**", (route) => {
      ciel = route.request().url();
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>Trans.eu (E2E)</title><p>E2E</p>",
      });
    });

    t.uprac("odstrániť vlastné údaje Trans.eu", async () => {
      const r = await t.rest.get(`transeu_napojenia?company_id=eq.${firma}&select=client_id`);
      if (!r.data?.length) return;
      const p = await t.novaStranka();
      await t.go("/nastavenia/transeu", p);
      const b = p.getByRole("button", { name: "Odstrániť", exact: true });
      if (!(await b.isVisible({ timeout: 8000 }).catch(() => false)))
        throw new Error(
          "tlačidlo Odstrániť chýba — riadok transeu_napojenia firmy Test zmaž ručne",
        );
      await b.click();
      await t.potvrd(p);
      await t.cakajNa("zmazanie napojenia", async () => {
        const x = await t.rest.get(`transeu_napojenia?company_id=eq.${firma}&select=stav`);
        return x.data?.length === 0;
      });
    });

    const clientId = `${t.znacka}-client`;
    await t.krok("Nastavenia → Trans.eu: formulár a Pripojiť", async () => {
      await t.go("/nastavenia/transeu");
      await page.getByRole("heading", { name: "Účet Trans.eu" }).waitFor();
      const pole = (n) => page.locator("label", { hasText: n }).locator("input");
      await pole("Client ID").fill(clientId);
      await pole("Client Secret").fill("e2e-secret-12345");
      await pole("Api-key").fill("e2e-apikey-12345");
      await page.getByText("/api/public/transeu/callback").waitFor();
      await page.getByRole("button", { name: "Pripojiť Trans.eu" }).click();
      await t.cakajNa("presmerovanie na Trans.eu", async () => ciel);
    });

    const u = new URL(ciel);
    const state = u.searchParams.get("state");
    await t.krok("adresa prihlásenia má správne parametre", async () => {
      t.over(u.origin + u.pathname === "https://auth.platform.trans.eu/oauth2/auth", u.pathname);
      t.over(u.searchParams.get("client_id") === clientId, "client_id nie je vlastná aplikácia");
      t.over(u.searchParams.get("response_type") === "code", "response_type nie je code");
      t.over(
        u.searchParams.get("redirect_uri") === `https://www.faktero.sk${CALLBACK}`,
        `redirect_uri ${u.searchParams.get("redirect_uri")}`,
      );
      t.over(Boolean(state) && state.length > 40, "state chýba");
      const r = await t.rest.get(`transeu_napojenia?company_id=eq.${firma}&select=stav,client_id`);
      t.over(
        r.data?.[0]?.client_id === clientId && r.data[0].stav === "caka",
        `napojenie po uložení: ${r.text.slice(0, 120)}`,
      );
    });

    const casti = Buffer.from(state, "base64url").toString("utf8").split(".");
    await t.krok("zmenený state (cudzia firma) callback odmietne", async () => {
      t.over(casti[0] === firma, "state nenesie firmu Test");
      const podvrh = [...casti];
      podvrh[0] = t.firmy.test2;
      const s = Buffer.from(podvrh.join(".")).toString("base64url");
      t.over((await callback({ code: "abc", state: s })) === "invalid_state", "podvrh prešiel");
    });

    if (casti.length !== 5) {
      // Staré vydanie (state bez nonce): callback by kód hneď menil na Trans.eu — neskúšame.
      t.upozornenia.push("state bez nonce (staré vydanie) — kontrola CSRF preskočená");
      return;
    }

    await t.krok("CSRF: platný state bez cookie z prehliadača neprejde", async () => {
      const cookies = await page.context().cookies(`https://www.faktero.sk${CALLBACK}`);
      const c = cookies.find((x) => x.name === COOKIE);
      t.over(c && c.httpOnly && c.value === casti[3], "cookie s nonce chýba alebo nie je httpOnly");
      t.over((await callback({ code: "abc", state })) === "csrf", "state bez cookie prešiel");
      t.over(
        (await callback({ code: "abc", state }, { cookie: `${COOKIE}=${"0".repeat(32)}` })) ===
          "csrf",
        "state s cudzou cookie prešiel",
      );
    });

    await t.krok("návrat s chybou z Trans.eu: ľudská hláška", async () => {
      await t.go(`${CALLBACK}?${new URLSearchParams({ error: "access_denied", state })}`);
      await page.waitForURL(/\/nastavenia\/transeu/);
      await page.getByText("V Trans.eu ste prístup pre Faktero nepovolili.").first().waitFor();
      // Cookie je jednorazová — po návrate je preč.
      const cookies = await page.context().cookies(`https://www.faktero.sk${CALLBACK}`);
      t.over(!cookies.some((x) => x.name === COOKIE), "cookie po návrate ostala");
    });
  },
};
