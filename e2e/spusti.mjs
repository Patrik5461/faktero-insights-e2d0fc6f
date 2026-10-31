#!/usr/bin/env node
/*
  E2E testy celých tokov Faktera proti bežiacemu webu (predvolene produkcia).

    npm run e2e                         # všetky toky
    node e2e/spusti.mjs faktura banka   # len vybrané (podľa mena súboru bez čísla)
    node e2e/spusti.mjs --opakuj        # neúspešný tok skúsi ešte raz (po nasadení vždy)
    BASE=http://127.0.0.1:3000 npm run e2e

  Pravidlá (produkčná databáza):
  - zapisuje sa len do QA firiem účtu efaktura-qa@faktero.sk (Test, test2, QA Česká)
    a každý tok po sebe uprace — aj keď spadne;
  - AI sa nevolá, eFaktúra do Peppolu ani e-maily sa neposielajú;
  - beží jeden beh naraz (zámok /tmp/faktero-e2e.lock); vnútri neho idú skupiny tokov
    (e2e/skupiny.mjs, rozdelené podľa QA firiem) súbežne, každá vo vlastnom prehliadači
    (najviac 3), a na konci sériovo toky, ktoré zapisujú do viacerých firiem.

  Heslo QA účtu: premenná QA_HESLO alebo súbor /home/patrik/.faktero-e2e.env
  (QA_HESLO=…, chmod 600). Viac v e2e/lib/prostredie.mjs.

  Výstup: priečinok s `suhrn.json`, snímkami pri chybe a stiahnutými súbormi
  (predvolene /home/patrik/e2e-vysledky/<čas>-<commit>, prebije E2E_VYSTUP).
  Návratový kód: 0 všetko prešlo, 1 niečo zlyhalo, 2 chýba nastavenie, 75 už beží iný beh.
*/
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  BASE,
  E2E_DIR,
  FIRMY,
  QA_EMAIL,
  QA_PLAYWRIGHT,
  REPO_DIR,
  SUBOR_TAJOMSTIEV,
  dnes,
  klucRelacie,
  nacitajPlaywright,
  prihlasOdkazom,
  prihlasRest,
  qaHeslo,
  restKlient,
  SUPABASE,
} from "./lib/prostredie.mjs";
import { BEZ_PODVRHU, KLUCE_NASTAVENI_UCTU, NAKONIEC, SKUPINY, SKUTOCNY_UCET } from "./skupiny.mjs";

const ZAMOK = process.env.E2E_ZAMOK || "/tmp/faktero-e2e.lock";

/* ---------------------------------------------- zámok a knižnice chromia */

// Chromium na serveri potrebuje knižnice rozbalené bez roota (qa-playwright/ldpath.txt)
// a súbežne smie bežať len jeden beh — oboje zariadi znovuspustenie pod `flock`.
if (!process.env.E2E_VNUTRI) {
  const ldpath = path.join(QA_PLAYWRIGHT, "ldpath.txt");
  const env = { ...process.env, E2E_VNUTRI: "1" };
  if (existsSync(ldpath)) {
    const lib = readFileSync(ldpath, "utf8").trim();
    env.LD_LIBRARY_PATH = [lib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
  }
  // E2E_CAKAJ_S: koľko sekúnd čakať na zámok (po nasadení), inak sa hneď končí kódom 75.
  const cakaj = Number(process.env.E2E_CAKAJ_S ?? 0);
  const r = spawnSync(
    "flock",
    [
      ...(cakaj > 0 ? ["-w", String(cakaj)] : ["-n"]),
      "-E",
      "75",
      ZAMOK,
      process.execPath,
      process.argv[1],
      ...process.argv.slice(2),
    ],
    { stdio: "inherit", env },
  );
  if (r.status === 75) console.error(`Iný beh E2E ešte prebieha (${ZAMOK}), končím.`);
  process.exit(r.status ?? 1);
}

/* ------------------------------------------------------------- nastavenie */

const args = process.argv.slice(2);
const OPAKUJ = args.includes("--opakuj") || process.env.E2E_OPAKUJ === "1";
const vybrane = args.filter((a) => !a.startsWith("--"));
// Celá sada trvá ~10 min (80 tokov v troch súbežných skupinách + skupina bez prehliadača,
// 31. 10. 2026; sériovo to bolo ~25 min); po 14 min sa nový tok nespustí.
const LIMIT_BEHU_MS = Number(process.env.E2E_LIMIT_S ?? 840) * 1000;
// Tvrdý koniec behu: tok spustený tesne pred LIMIT_BEHU_MS dostane len zvyšok do tohto času,
// aby celý beh (vrátane upratovania) skončil pred stropom v po-nasadeni.sh (E2E_STROP_S 1020).
const KONIEC_BEHU_MS = LIMIT_BEHU_MS + Number(process.env.E2E_REZERVA_S ?? 60) * 1000;

function commit() {
  if (process.env.E2E_COMMIT) return process.env.E2E_COMMIT;
  try {
    return execFileSync("git", ["-C", REPO_DIR, "rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "nezname";
  }
}
const COMMIT = commit();
const cas = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
const VYSTUP = process.env.E2E_VYSTUP || `/home/patrik/e2e-vysledky/${cas}-${COMMIT}`;
mkdirSync(path.join(VYSTUP, "subory"), { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const heslo = qaHeslo();
if (!heslo) {
  const s = {
    ok: false,
    chyba: `Chýba heslo QA účtu (QA_HESLO alebo ${SUBOR_TAJOMSTIEV})`,
    commit: COMMIT,
    base: BASE,
  };
  writeFileSync(path.join(VYSTUP, "suhrn.json"), JSON.stringify(s, null, 2));
  console.error(s.chyba);
  process.exit(2);
}

/* ---------------------------------------------------------------- toky */

const subory = readdirSync(path.join(E2E_DIR, "toky"))
  .filter((f) => /^\d+-.+\.mjs$/.test(f))
  .sort();
const toky = [];
for (const f of subory) {
  const meno = f.replace(/^\d+-/, "").replace(/\.mjs$/, "");
  if (vybrane.length && !vybrane.includes(meno)) continue;
  const mod = (await import(pathToFileURL(path.join(E2E_DIR, "toky", f)).href)).default;
  toky.push({ meno, ...mod });
}
if (!toky.length) {
  console.error("Žiadny tok nezodpovedá výberu:", vybrane.join(", "));
  process.exit(2);
}

/* -------------------------------------------------------- prehliadač */

const { chromium } = await nacitajPlaywright();
const zaciatok = Date.now();
const ZNACKA = `E2E-${cas.slice(4)}`; // napr. E2E-1030-163012

let rest = null;
let ulozenaRelacia = null;
let relaciaOdkazom = null;
/** Nastavenia QA účtu na začiatku behu — tie vidia skupiny, ktoré ich nemenia. */
let nastaveniaUctu = null;

/** Prihlásenie cez formulár; relácia sa potom použije v každom toku. */
async function prihlas(prehliadac) {
  const ctx = await prehliadac.newContext({
    viewport: { width: 1400, height: 1000 },
    locale: "sk-SK",
  });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/prihlasenie`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="email"]').waitFor({ timeout: 30000 });
    await page
      .getByRole("button", { name: /Prijať všetko/ })
      .first()
      .click({ timeout: 3000 })
      .catch(() => {});
    await page.fill('input[type="email"]', QA_EMAIL);
    await page.fill('input[type="password"]', heslo);
    await page.click('button[type="submit"]');
    try {
      await page.waitForURL((u) => !u.pathname.startsWith("/prihlasenie"), { timeout: 40000 });
    } catch (e) {
      // Heslo neplatí (súbežný test ho mohol zmeniť) — skúsi sa jednorazový odkaz.
      const relacia = await prihlasOdkazom();
      if (!relacia) throw e;
      log("! heslo QA účtu neplatí, prihlasujem jednorazovým odkazom");
      relaciaOdkazom = relacia;
      await page.evaluate(
        ([k, v]) => localStorage.setItem(k, v),
        [klucRelacie(), JSON.stringify(relacia)],
      );
      await page.goto(`${BASE}/prehlad`, { waitUntil: "domcontentloaded" });
      await page.waitForURL((u) => !u.pathname.startsWith("/prihlasenie"), { timeout: 40000 });
    }
    await page
      .getByRole("button", { name: /Prijať všetko/ })
      .first()
      .click({ timeout: 3000 })
      .catch(() => {});
    ulozenaRelacia = await ctx.storageState();
    return page.url();
  } finally {
    await ctx.close();
  }
}

/** Nastavenia QA účtu (user_metadata) z /auth/v1/user. */
async function nacitajNastaveniaUctu(jwt) {
  const r = await fetch(`${SUPABASE.url}/auth/v1/user`, {
    headers: { apikey: SUPABASE.kluc, Authorization: `Bearer ${jwt}` },
  });
  if (r.status >= 300) throw new Error(`auth/v1/user: ${r.status}`);
  const m = (await r.json()).user_metadata ?? {};
  return Object.fromEntries(KLUCE_NASTAVENI_UCTU.map((k) => [k, m[k] ?? null]));
}

/**
  Nastavenia QA účtu (user_metadata: dizajn, strana náhľadu, vzhľad nespracovaných)
  sú spoločné pre celý účet, no skupiny bežia súbežne. Preto ich každý tok vidí
  vlastné: odpoveď GET /auth/v1/user (supabase.auth.getUser) dostane hodnoty zo
  začiatku behu prekryté tým, čo si tok nastavil cez `t.nastavUcet()`, a zápis
  z aplikácie (PUT s `data`) sa nepošle na server, len sa zapamätá pre tento tok.
  Skutočný účet menia len toky zo SKUTOCNY_UCET (overujú, že sa voľba uloží).
*/
async function podvrhniNastaveniaUctu(ctx, ucet) {
  const prekry = (pouzivatel) => {
    const m = { ...(pouzivatel.user_metadata ?? {}) };
    for (const [k, v] of Object.entries({ ...nastaveniaUctu, ...ucet.zmeny })) {
      if (v === null || v === undefined) delete m[k];
      else m[k] = v;
    }
    return { ...pouzivatel, user_metadata: m };
  };
  await ctx.route(
    (u) => u.pathname.endsWith("/auth/v1/user"),
    async (route) => {
      const req = route.request();
      const metoda = req.method();
      let zapis = null;
      if (metoda === "PUT") {
        try {
          zapis = req.postDataJSON();
        } catch {
          zapis = null;
        }
        // Zmena hesla a pod. ide na server; podvrhuje sa len zápis metadát.
        if (!zapis?.data || Object.keys(zapis).some((k) => k !== "data")) return route.fallback();
      } else if (metoda !== "GET") return route.fallback();
      if (zapis) {
        // Namiesto zápisu sa prečíta používateľ (tou istou reláciou) a vráti s novými hodnotami.
        const h = await req.allHeaders();
        try {
          const r = await fetch(req.url(), {
            headers: { apikey: h.apikey ?? "", authorization: h.authorization ?? "" },
          });
          const telo = await r.json();
          const headers = { "access-control-allow-origin": h.origin ?? "*" };
          if (!r.ok) return route.fulfill({ status: r.status, json: telo, headers });
          Object.assign(ucet.zmeny, zapis.data);
          return route.fulfill({ status: 200, json: prekry(telo), headers });
        } catch {
          return route.abort().catch(() => {});
        }
      }
      let odpoved;
      try {
        odpoved = await route.fetch();
      } catch {
        return route.abort().catch(() => {});
      }
      let telo;
      try {
        telo = await odpoved.json();
      } catch {
        return route.fulfill({ response: odpoved });
      }
      if (!odpoved.ok() || !telo || typeof telo !== "object")
        return route.fulfill({ response: odpoved });
      return route.fulfill({ response: odpoved, json: prekry(telo) });
    },
  );
}

/** Kontext jedného toku — pomocníci, upratovanie, zber chýb. */
function vytvorKontext(tok, pokus, prehliadac) {
  // Nastavenia účtu, ktoré vidí len tento tok (pozri podvrhniNastaveniaUctu).
  const ucet = { zmeny: {} };
  const podvrh =
    nastaveniaUctu && !BEZ_PODVRHU.includes(tok.meno) && !SKUTOCNY_UCET.includes(tok.meno);
  const upratovanie = [];
  const kroky = [];
  const chybyStranky = [];
  const hlasky = [];
  const konteksty = [];
  const upozornenia = [];
  let cisloSuboru = 0;

  async function novaStranka({ mobil = false, firma = tok.firma ?? "test", sirka, jazyk } = {}) {
    const ctx = await prehliadac.newContext({
      storageState: ulozenaRelacia,
      viewport: mobil
        ? { width: sirka ?? 390, height: 844 }
        : { width: sirka ?? 1400, height: 1000 },
      ...(mobil ? { isMobile: true, hasTouch: true } : {}),
      locale: "sk-SK",
      acceptDownloads: true,
    });
    konteksty.push(ctx);
    if (podvrh) await podvrhniNastaveniaUctu(ctx, ucet);
    // Firma sa nastaví len pri prvom načítaní karty — prepínač firiem v toku ju potom smie zmeniť.
    await ctx.addInitScript(
      ([id, jazykStranky]) => {
        try {
          if (!sessionStorage.getItem("e2e-firma")) {
            localStorage.setItem("faktero.active_company", id);
            if (jazykStranky) localStorage.setItem("faktero.jazyk", jazykStranky);
            sessionStorage.setItem("e2e-firma", "1");
          }
        } catch {
          /* bez úložiska */
        }
      },
      [FIRMY[firma] ?? firma, jazyk ?? null],
    );
    /*
      Chyby, dialógy a hlášky sa sledujú na každej stránke kontextu — aj na tej,
      ktorú si tok otvorí sám (napr. „zatvorenie a otvorenie appky" cez
      ctx.newPage()). Inak by hlášky z novej stránky do t.hlasky nikdy neprišli.
    */
    const sleduj = (page) => {
      page.on("pageerror", (e) => chybyStranky.push(`${page.url()} ${String(e).slice(0, 300)}`));
      page.on("dialog", (d) => d.dismiss().catch(() => {}));
      const zber = setInterval(async () => {
        for (const x of await page
          .locator("[data-sonner-toast]")
          .allInnerTexts()
          .catch(() => [])) {
          const h = x.replace(/\s+/g, " ").trim();
          if (h && !hlasky.includes(h)) hlasky.push(h);
        }
      }, 400);
      page.on("close", () => clearInterval(zber));
    };
    ctx.on("page", sleduj);
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    return page;
  }

  const t = {
    tok: tok.meno,
    pokus,
    znacka: ZNACKA,
    firmy: FIRMY,
    base: BASE,
    rest,
    restAnon: restKlient(null),
    dnes: dnes(),
    vystup: VYSTUP,
    hlasky,
    chybyStranky,
    upozornenia,
    page: null,
    novaStranka,
    log: (...a) => log(`  [${tok.meno}]`, ...a),
    /**
     * Nastavenia účtu (user_metadata) len pre tento tok — napr. { dizajn: "kompaktny" };
     * null kľúč zmaže. Skutočný účet sa nemení, takže súbežné toky to neovplyvní.
     */
    nastavUcet(zmeny) {
      if (!podvrh)
        throw new Error(
          "nastavUcet: tok je v SKUTOCNY_UCET/BEZ_PODVRHU alebo sa nastavenia účtu nedali prečítať",
        );
      Object.assign(ucet.zmeny, zmeny);
    },
    /** Pomenovaný krok — v súhrne je vidno, kde tok skončil. */
    async krok(nazov, fn) {
      const k = { nazov, ok: false, ms: 0 };
      kroky.push(k);
      const z = Date.now();
      try {
        const v = await fn();
        k.ok = true;
        return v;
      } catch (e) {
        e.message = `${nazov}: ${e.message}`;
        throw e;
      } finally {
        k.ms = Date.now() - z;
      }
    },
    over(podmienka, sprava) {
      if (!podmienka) throw new Error(sprava);
    },
    /** Upratanie sa spustí po toku (aj po páde) v opačnom poradí. */
    uprac(nazov, fn) {
      upratovanie.push({ nazov, fn });
    },
    async go(cesta, page = t.page) {
      await page.goto(`${BASE}${cesta}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    },
    /** Klikne a uloží stiahnutý súbor; vráti cestu. */
    async stiahni(klik, meno, page = t.page) {
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), klik()]);
      cisloSuboru++;
      const ciel = path.join(
        VYSTUP,
        "subory",
        `${tok.meno}-${cisloSuboru}-${meno}-${dl.suggestedFilename()}`,
      );
      await dl.saveAs(ciel);
      return ciel;
    },
    /** Potvrdí okno `potvrd()` (role alertdialog). */
    async potvrd(page = t.page, tlacidlo) {
      const d = page.getByRole("alertdialog").last();
      await d.waitFor({ timeout: 10000 });
      const b = tlacidlo ? d.getByRole("button", { name: tlacidlo }) : d.getByRole("button").last();
      await b.click();
    },
    /** Čaká, kým REST dotaz nevráti, čo treba (dáta sa zapisujú asynchrónne). */
    async cakajNa(popis, fn, { limit = 20000, krok = 700 } = {}) {
      const koniec = Date.now() + limit;
      let posledne;
      while (Date.now() < koniec) {
        posledne = await fn();
        if (posledne) return posledne;
        await new Promise((r) => setTimeout(r, krok));
      }
      throw new Error(`nedočkal som sa: ${popis}`);
    },
  };

  async function upratVsetko() {
    for (const u of upratovanie.reverse()) {
      try {
        await u.fn();
      } catch (e) {
        upozornenia.push(
          `upratanie „${u.nazov}“ zlyhalo: ${String(e?.message ?? e).slice(0, 300)}`,
        );
      }
    }
  }
  async function zavri() {
    for (const c of konteksty) await c.close().catch(() => {});
  }
  return { t, kroky, upratVsetko, zavri, konteksty };
}

async function spustiTok(tok, pokus, prehliadac) {
  const { t, kroky, upratVsetko, zavri, konteksty } = vytvorKontext(tok, pokus, prehliadac);
  const z = Date.now();
  const vysledok = { tok: tok.meno, popis: tok.popis, pokus, ok: false, ms: 0, kroky, chyba: null };
  const limit = Math.max(
    30000,
    Math.min(tok.limit ?? 150000, KONIEC_BEHU_MS - (Date.now() - zaciatok)),
  );
  let casovac;
  try {
    if (!tok.bezPrehliadaca) t.page = await t.novaStranka();
    await Promise.race([
      tok.spusti(t),
      new Promise((_, nie) => {
        casovac = setTimeout(
          () => nie(new Error(`časový limit ${Math.round(limit / 1000)} s`)),
          limit,
        );
      }),
    ]);
    vysledok.ok = true;
  } catch (e) {
    vysledok.chyba = String(e?.message ?? e)
      .split("\n")
      .slice(0, 3)
      .join(" ")
      .slice(0, 800);
    // Snímka každej otvorenej stránky toku.
    let i = 0;
    for (const c of konteksty)
      for (const p of c.pages()) {
        i++;
        const cesta = path.join(VYSTUP, `${tok.meno}-pokus${pokus}-chyba${i}.png`);
        await p.screenshot({ path: cesta, fullPage: true, timeout: 10000 }).catch(() => {});
        vysledok.snimky = [
          ...(vysledok.snimky ?? []),
          { subor: path.basename(cesta), url: p.url() },
        ];
      }
  } finally {
    clearTimeout(casovac);
    await upratVsetko();
    await zavri();
  }
  vysledok.ms = Date.now() - z;
  vysledok.upozornenia = t.upozornenia;
  vysledok.chybyStranky = t.chybyStranky.slice(0, 10);
  if (!vysledok.ok) vysledok.hlasky = t.hlasky.slice(-8);
  return vysledok;
}

/* ---------------------------------------------------------------- beh */

// Skupiny z e2e/skupiny.mjs zúžené na vybrané toky; tok bez skupiny ide na koniec, sám.
const poMene = new Map(toky.map((x) => [x.meno, x]));
const zaradene = new Set();
const skupiny = [];
for (const sk of SKUPINY) {
  const vSkupine = sk.toky.filter((m) => poMene.has(m));
  vSkupine.forEach((m) => zaradene.add(m));
  if (vSkupine.length) skupiny.push({ ...sk, toky: vSkupine.map((m) => poMene.get(m)) });
}
const bezSkupiny = toky.filter((x) => !zaradene.has(x.meno) && !NAKONIEC.includes(x.meno));
const nakoniec = [
  ...NAKONIEC.filter((m) => poMene.has(m)).map((m) => poMene.get(m)),
  ...bezSkupiny,
];
// Koľko skupín beží naraz (každá vo vlastnom prehliadači); 1 = všetko za sebou.
const SUBEZNE = Math.max(1, Math.min(3, Number(process.env.E2E_SUBEZNE ?? 3)));
// (Skupina len z tokov bez prehliadača beží navyše — Chromium nepotrebuje.)

const vysledky = [];
let chybaPrihlasenia = null;
const prehliadace = [];
const novyPrehliadac = async () => {
  const p = await chromium.launch();
  prehliadace.push(p);
  return p;
};

try {
  log(
    `E2E ${BASE} commit ${COMMIT}, ${toky.length} tokov, výstup ${VYSTUP}\n` +
      skupiny.map((sk) => `  skupina ${sk.meno}: ${sk.toky.length} tokov`).join("\n") +
      (nakoniec.length ? `\n  nakoniec sériovo: ${nakoniec.map((x) => x.meno).join(", ")}` : "") +
      `\n  súbežne najviac ${SUBEZNE} prehliadače`,
  );
  for (const x of bezSkupiny)
    log(`! tok ${x.meno} nemá skupinu v e2e/skupiny.mjs — beží až na konci, sám`);
  await prihlas(await novyPrehliadac());
  const jwt = relaciaOdkazom?.access_token ?? (await prihlasRest(heslo)).jwt;
  rest = restKlient(jwt);
  nastaveniaUctu = await nacitajNastaveniaUctu(jwt).catch((e) => {
    log(`! nastavenia účtu sa nedajú prečítať (${e.message}) — toky ich uvidia skutočné`);
    return null;
  });
} catch (e) {
  chybaPrihlasenia = `prihlásenie zlyhalo: ${String(e?.message ?? e).slice(0, 300)}`;
  log(chybaPrihlasenia);
}

/** Spustí toky za sebou v jednom prehliadači; výsledky pridá do `vysledky`. */
async function spustiZaSebou(zoznam, prehliadac, skupina) {
  const z = Date.now();
  const tag = skupina ? `[${skupina}] ` : "";
  for (const tok of zoznam) {
    if (chybaPrihlasenia) {
      vysledky.push({
        tok: tok.meno,
        popis: tok.popis,
        skupina,
        ok: false,
        ms: 0,
        chyba: chybaPrihlasenia,
      });
      continue;
    }
    if (Date.now() - zaciatok > LIMIT_BEHU_MS) {
      vysledky.push({
        tok: tok.meno,
        popis: tok.popis,
        skupina,
        ok: false,
        ms: 0,
        chyba: "nespustený — vypršal čas celého behu",
      });
      continue;
    }
    log(`${tag}▶ ${tok.meno}`);
    let v = await spustiTok(tok, 1, prehliadac);
    if (!v.ok && OPAKUJ && Date.now() - zaciatok < LIMIT_BEHU_MS) {
      log(`${tag}  ✗ ${tok.meno}: ${v.chyba} — skúšam znova`);
      const druhy = await spustiTok(tok, 2, prehliadac);
      druhy.prvyPokus = { chyba: v.chyba, ms: v.ms, snimky: v.snimky };
      druhy.nestabilny = druhy.ok;
      v = druhy;
    }
    v.skupina = skupina;
    log(
      `${tag}${v.ok ? "  ✓" : "  ✗"} ${tok.meno} (${(v.ms / 1000).toFixed(1)} s)${v.ok ? "" : ` — ${v.chyba}`}`,
    );
    for (const u of v.upozornenia ?? []) log(`${tag}  ! ${u}`);
    vysledky.push(v);
  }
  return Math.round((Date.now() - z) / 1000);
}

// Súbežne: každý pracovník má vlastný prehliadač a berie skupiny z fronty;
// skupiny len z tokov bez prehliadača bežia navyše, bez neho.
const trvanieSkupin = {};
const bezPrehl = SUBEZNE > 1 ? skupiny.filter((sk) => sk.toky.every((x) => x.bezPrehliadaca)) : [];
const fronta = skupiny.filter((sk) => !bezPrehl.includes(sk));
await Promise.all([
  ...bezPrehl.map(async (sk) => {
    trvanieSkupin[sk.meno] = await spustiZaSebou(sk.toky, null, sk.meno);
  }),
  ...Array.from({ length: Math.min(SUBEZNE, fronta.length) }, async (_, i) => {
    const prehliadac = i === 0 ? prehliadace[0] : await novyPrehliadac();
    for (let sk = fronta.shift(); sk; sk = fronta.shift())
      trvanieSkupin[sk.meno] = await spustiZaSebou(sk.toky, prehliadac, sk.meno);
  }),
]);
// Potom sám: toky, ktoré zapisujú do viacerých firiem naraz.
if (nakoniec.length) {
  for (const p of prehliadace.slice(1)) await p.close().catch(() => {});
  trvanieSkupin.nakoniec = await spustiZaSebou(nakoniec, prehliadace[0], "nakoniec");
}

for (const p of prehliadace) await p.close().catch(() => {});
// Súhrn v poradí súborov, nie v poradí, v akom toky dobehli.
const poradie = new Map(toky.map((x, i) => [x.meno, i]));
vysledky.sort((x, y) => poradie.get(x.tok) - poradie.get(y.tok));

/*
  Kontrola upratania: všetky toky pomenúvajú dáta značkou behu (E2E-MMDD-HHMMSS).
  Čo s ňou po behu ostalo v QA firmách, je diera v upratovaní niektorého toku —
  beh kvôli tomu nezlyhá, ale súhrn to vypíše.
*/
const zvysky = [];
if (rest && !chybaPrihlasenia) {
  const firmy = Object.values(FIRMY).join(",");
  const vzor = encodeURIComponent(`${ZNACKA}*`);
  for (const [tabulka, stlpec] of [
    ["invoices", "invoice_number"],
    ["invoices", "customer_name"],
    ["purchase_invoices", "invoice_number"],
    ["purchase_invoices", "supplier_name"],
    ["expense_documents", "document_number"],
    ["expense_documents", "supplier_name"],
    ["customers", "name"],
    ["quotes", "quote_number"],
    ["jobs", "job_number"],
    ["vehicles", "name"],
    ["api_keys", "name"],
    ["doklad_navyky", "nazov_dodavatela"],
    ["pravidla_uctovania", "nazov"],
    ["predlohy_uctovania", "nazov"],
    ["bank_transactions", "counterparty"],
    ["bank_transactions", "description"],
    ["cash_entries", "description"],
    ["other_documents", "subject"],
    ["products", "name"],
    ["sales_orders", "order_number"],
    ["sales_orders", "customer_name"],
    ["purchase_orders", "order_number"],
    ["vyuctovania_vydavkov", "nazov"],
    ["financing_contracts", "name"],
    ["recurring_invoices", "name"],
    ["company_bank_accounts", "name"],
  ]) {
    const r = await rest
      .get(`${tabulka}?company_id=in.(${firmy})&${stlpec}=like.${vzor}&select=company_id&limit=50`)
      .catch(() => null);
    if (r?.status === 200 && r.data?.length) zvysky.push(`${tabulka}.${stlpec}: ${r.data.length}`);
  }
  // Firma založená tokom (nemecká firma v de-firma) — firmy nemajú company_id.
  const f = await rest.get(`companies?name=like.${vzor}&select=id&limit=50`).catch(() => null);
  if (f?.status === 200 && f.data?.length) zvysky.push(`companies.name: ${f.data.length}`);
  if (zvysky.length) log(`! po behu ostali dáta so značkou ${ZNACKA}: ${zvysky.join(", ")}`);
}

const zlyhane = vysledky.filter((v) => !v.ok);
const suhrn = {
  ok: zlyhane.length === 0,
  base: BASE,
  commit: COMMIT,
  znacka: ZNACKA,
  zaciatok: new Date(zaciatok).toISOString(),
  trvanie_s: Math.round((Date.now() - zaciatok) / 1000),
  prešlo: vysledky.length - zlyhane.length,
  zlyhalo: zlyhane.length,
  zlyhane: zlyhane.map((v) => v.tok),
  nestabilne: vysledky.filter((v) => v.nestabilny).map((v) => v.tok),
  zvysky,
  skupiny: trvanieSkupin,
  vystup: VYSTUP,
  toky: vysledky,
};
writeFileSync(path.join(VYSTUP, "suhrn.json"), JSON.stringify(suhrn, null, 2));
log(
  `${suhrn.ok ? "VŠETKO PREŠLO" : "ZLYHALO"}: ${suhrn.prešlo}/${vysledky.length} za ${suhrn.trvanie_s} s` +
    (zlyhane.length ? ` — ${suhrn.zlyhane.join(", ")}` : ""),
);
process.exit(suhrn.ok ? 0 : 1);
