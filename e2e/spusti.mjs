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
  - beží najviac jeden prehliadač a jeden beh naraz (zámok /tmp/faktero-e2e.lock).

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
} from "./lib/prostredie.mjs";

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
  const r = spawnSync(
    "flock",
    ["-n", "-E", "75", ZAMOK, process.execPath, process.argv[1], ...process.argv.slice(2)],
    { stdio: "inherit", env },
  );
  if (r.status === 75) console.error(`Iný beh E2E ešte prebieha (${ZAMOK}), končím.`);
  process.exit(r.status ?? 1);
}

/* ------------------------------------------------------------- nastavenie */

const args = process.argv.slice(2);
const OPAKUJ = args.includes("--opakuj") || process.env.E2E_OPAKUJ === "1";
const vybrane = args.filter((a) => !a.startsWith("--"));
const LIMIT_BEHU_MS = Number(process.env.E2E_LIMIT_S ?? 1080) * 1000;
// Tvrdý koniec behu: tok spustený tesne pred LIMIT_BEHU_MS dostane len zvyšok do tohto času,
// aby celý beh (vrátane upratovania) skončil pred stropom v po-nasadeni.sh (E2E_STROP_S 1200).
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
const prehliadac = await chromium.launch();
const zaciatok = Date.now();
const ZNACKA = `E2E-${cas.slice(4)}`; // napr. E2E-1030-163012

let rest = null;
let ulozenaRelacia = null;
let relaciaOdkazom = null;

/** Prihlásenie cez formulár; relácia sa potom použije v každom toku. */
async function prihlas() {
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

/** Kontext jedného toku — pomocníci, upratovanie, zber chýb. */
function vytvorKontext(tok, pokus) {
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
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => chybyStranky.push(`${page.url()} ${String(e).slice(0, 300)}`));
    page.on("dialog", (d) => d.dismiss().catch(() => {}));
    const zber = setInterval(async () => {
      for (const x of await page
        .locator("[data-sonner-toast]")
        .allInnerTexts()
        .catch(() => []))
        if (!hlasky.includes(x)) hlasky.push(x.replace(/\s+/g, " ").trim());
    }, 400);
    page.on("close", () => clearInterval(zber));
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

async function spustiTok(tok, pokus) {
  const { t, kroky, upratVsetko, zavri, konteksty } = vytvorKontext(tok, pokus);
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

const vysledky = [];
let chybaPrihlasenia = null;
try {
  log(`E2E ${BASE} commit ${COMMIT}, ${toky.length} tokov, výstup ${VYSTUP}`);
  await prihlas();
  rest = restKlient(relaciaOdkazom?.access_token ?? (await prihlasRest(heslo)).jwt);
} catch (e) {
  chybaPrihlasenia = `prihlásenie zlyhalo: ${String(e?.message ?? e).slice(0, 300)}`;
  log(chybaPrihlasenia);
}

for (const tok of toky) {
  if (chybaPrihlasenia) {
    vysledky.push({ tok: tok.meno, popis: tok.popis, ok: false, ms: 0, chyba: chybaPrihlasenia });
    continue;
  }
  if (Date.now() - zaciatok > LIMIT_BEHU_MS) {
    vysledky.push({
      tok: tok.meno,
      popis: tok.popis,
      ok: false,
      ms: 0,
      chyba: "nespustený — vypršal čas celého behu",
    });
    continue;
  }
  log(`▶ ${tok.meno}`);
  let v = await spustiTok(tok, 1);
  if (!v.ok && OPAKUJ && Date.now() - zaciatok < LIMIT_BEHU_MS) {
    log(`  ✗ ${tok.meno}: ${v.chyba} — skúšam znova`);
    const druhy = await spustiTok(tok, 2);
    druhy.prvyPokus = { chyba: v.chyba, ms: v.ms, snimky: v.snimky };
    druhy.nestabilny = druhy.ok;
    v = druhy;
  }
  log(
    `${v.ok ? "  ✓" : "  ✗"} ${tok.meno} (${(v.ms / 1000).toFixed(1)} s)${v.ok ? "" : ` — ${v.chyba}`}`,
  );
  for (const u of v.upozornenia ?? []) log(`  ! ${u}`);
  vysledky.push(v);
}

await prehliadac.close().catch(() => {});

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
  ]) {
    const r = await rest
      .get(`${tabulka}?company_id=in.(${firmy})&${stlpec}=like.${vzor}&select=company_id&limit=50`)
      .catch(() => null);
    if (r?.status === 200 && r.data?.length) zvysky.push(`${tabulka}.${stlpec}: ${r.data.length}`);
  }
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
  vystup: VYSTUP,
  toky: vysledky,
};
writeFileSync(path.join(VYSTUP, "suhrn.json"), JSON.stringify(suhrn, null, 2));
log(
  `${suhrn.ok ? "VŠETKO PREŠLO" : "ZLYHALO"}: ${suhrn.prešlo}/${vysledky.length} za ${suhrn.trvanie_s} s` +
    (zlyhane.length ? ` — ${suhrn.zlyhane.join(", ")}` : ""),
);
process.exit(suhrn.ok ? 0 : 1);
