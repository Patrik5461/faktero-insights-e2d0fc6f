/*
  Zoznamy a formuláre na telefóne (QA firma Test) — v kompaktnom aj klasickom
  rozložení:
  - zoznamy dokladov (bločky, prijaté, ponuky, pohyby banky, objednávky, iné
    doklady, vyúčtovania, zákazky, opakované, DPH prehľad) na 390 px nemajú
    tabuľku posúvanú vo vnútri karty — riadky sú karty a suma je vidieť;
  - plávajúce tlačidlo AI (na telefóne záložka pri pravom okraji) nekryje
    žiadny text, ikonu ani tlačidlo — hore na stránke ani po odrolovaní;
  - hlavička nového vyúčtovania a zákazky: „…“ nie je sám v prázdnom riadku;
  - nová prijatá faktúra (kompaktné): popis IČO a Odpočítania dane sedí
    v rámčeku poľa ako pri ostatných poliach;
  - nová faktúra na 1440 px: lepkavá lišta akcií sa dá odrolovať z každej
    sekcie („Daňový režim“ celý nad lištou);
  - zoznam bločkov: stĺpec „Stav dokladu“ len keď firma má vlastné stavy.
  QA účet sa na tok prepne do daného rozloženia (v spusti.mjs len pre tento
  tok cez t.nastavUcet, skutočný účet sa nemení). Nič iné sa nezapisuje.
  So `E2E_SNIMKY=<priečinok>` uloží snímky (390 px celé stránky, 1440 nová faktúra).
*/
import { mkdirSync } from "node:fs";
import path from "node:path";
import { nastavUcetToku } from "./64-nahlad-strana.mjs";
import { posuvStranky } from "./70-mobil-ai-hlavicka.mjs";

export const ZOZNAMY = [
  ["blocky", "/doklady?stav=vsetky"],
  ["prijate", "/prijate-faktury"],
  ["faktury", "/faktury"],
  ["ponuky", "/ponuky"],
  ["banka-pohyby", "/bankove-ucty/transakcie"],
  ["objednavky", "/objednavky"],
  ["ostatne", "/ostatne-doklady"],
  ["vyuctovania", "/doklady/vyuctovania"],
  ["zakazky", "/zakazky"],
  ["opakovane", "/opakovane"],
  ["dph", "/uctovnictvo/dph"],
];

/** Stránky, kde tlačidlo AI kedysi krylo ikony alebo sumy. */
export const AI_STRANKY = [
  ["vykazy", "/uctovnictvo/vykazy"],
  ["adresar", "/odberatelia"],
  ["nespracovane", "/nespracovane"],
  ["pokladna", "/pokladna"],
  ["sklad", "/sklad"],
];

async function nacitaj(t, page, cesta) {
  await t.go(cesta, page);
  await page
    .waitForFunction(
      () => !/Načítavam/.test(document.querySelector("main")?.innerText ?? ""),
      null,
      { timeout: 15000 },
    )
    .catch(() => {});
  await page.waitForTimeout(900);
}

/**
 * Tabuľky v `main`, ktoré sa na telefóne posúvajú do strany vo vnútri obalu
 * (suma za pravým okrajom). Vráti popisy (hlavičky prvých stĺpcov).
 */
export async function posuvneTabulky(page) {
  return page.evaluate(() => {
    const zle = [];
    for (const tab of document.querySelectorAll("main table")) {
      const r = tab.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      for (let a = tab.parentElement; a && a.tagName !== "MAIN"; a = a.parentElement) {
        const o = getComputedStyle(a).overflowX;
        if ((o === "auto" || o === "scroll") && a.scrollWidth > a.clientWidth + 2) {
          const hlavicka = [...tab.querySelectorAll("th")]
            .map((th) => th.innerText.trim())
            .filter(Boolean)
            .slice(0, 3)
            .join("/");
          zle.push(`${hlavicka || "tabuľka"} (${a.scrollWidth} > ${a.clientWidth} px)`);
          break;
        }
      }
    }
    return zle;
  });
}

/**
 * Čo z obsahu `main` kryje tlačidlo AI pri danom odrolovaní (texty, ikony,
 * tlačidlá, polia). Kontroluje sa hore, v strede a dole na stránke.
 */
export async function coKryjeAi(page) {
  return page.evaluate(async () => {
    const ai = document.querySelector("[data-ai-prepinac]");
    if (!ai) return { ai: false, zle: [] };
    const vysledok = new Set();
    const vyska = document.documentElement.scrollHeight;
    for (const y of [0, Math.round(vyska / 2), vyska]) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 350));
      const a = ai.getBoundingClientRect();
      const prvky = document.querySelectorAll(
        "main button, main a[href], main input, main select, main svg, main img, main span, main td, main th, main p, main div, main h1, main h2, main h3, main label",
      );
      for (const el of prvky) {
        // Len prvky s vlastným textom alebo ovládače/ikony — kontajnery (karty) áno, ale až cez text.
        const ovladac = /^(BUTTON|A|INPUT|SELECT|SVG|IMG)$/i.test(el.tagName);
        const maText = [...el.childNodes].some(
          (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
        );
        if (!ovladac && !maText) continue;
        let r;
        if (maText && !ovladac) {
          // Skutočná šírka textu, nie celej (možno širokej) bunky.
          const rng = document.createRange();
          rng.selectNodeContents(el);
          r = rng.getBoundingClientRect();
        } else r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const st = getComputedStyle(el);
        if (st.visibility === "hidden" || st.opacity === "0") continue;
        const x = Math.min(r.right, a.right) - Math.max(r.left, a.left);
        const yy = Math.min(r.bottom, a.bottom) - Math.max(r.top, a.top);
        if (x > 1 && yy > 1) {
          // Prvok orezaný predkom (posúvaný obal) mimo obrazovky sa neráta.
          const bod = document.elementsFromPoint(
            Math.max(r.left, a.left) + x / 2,
            Math.max(r.top, a.top) + yy / 2,
          );
          if (!bod.includes(el) && !bod.some((b) => el.contains(b))) continue;
          const text = (el.getAttribute("aria-label") || el.innerText || el.tagName)
            .trim()
            .slice(0, 30);
          vysledok.add(text);
        }
      }
    }
    window.scrollTo(0, 0);
    return { ai: true, zle: [...vysledok] };
  });
}

/** Nie je „…“ v hlavičke sám v riadku (bez nadpisu a bez ďalšieho tlačidla)? */
export async function osamoteneMenu(page) {
  return page.evaluate(() => {
    const b = document.querySelector('button[aria-label="Ďalšie akcie"]');
    const h1 = document.querySelector("h1");
    if (!b || !h1) return null;
    const rb = b.getBoundingClientRect();
    const rh = h1.getBoundingClientRect();
    if (Math.abs(rb.top + rb.height / 2 - (rh.top + rh.height / 2)) < 16) return null;
    const vRiadku = [...b.parentElement.parentElement.querySelectorAll("button, a")].filter((x) => {
      if (x === b) return false;
      const r = x.getBoundingClientRect();
      return r.width && Math.abs(r.top - rb.top) < 8;
    });
    return vRiadku.length ? null : `„…“ je sám v riadku ${Math.round(rb.top)} px pod nadpisom`;
  });
}

/** Popis zloženého poľa (IČO, Odpočítanie dane) v rámčeku, nie nad poľom. */
export async function popisMimoRamceka(page, popisy) {
  return page.evaluate((popisy) => {
    const zle = [];
    for (const p of popisy) {
      const el = [...document.querySelectorAll("main label span, main label div")].find(
        (x) => x.childElementCount === 0 && x.textContent.trim() === p,
      );
      if (!el) {
        zle.push(`${p}: pole sa nenašlo`);
        continue;
      }
      const pole = el
        .closest("label")
        ?.querySelector("input:not([type=checkbox]), .pole-zaskrtnutie, select");
      if (!pole) {
        zle.push(`${p}: bez poľa`);
        continue;
      }
      const rp = el.getBoundingClientRect();
      const rf = pole.getBoundingClientRect();
      if (!(rp.top < rf.top && rp.bottom > rf.top))
        zle.push(`${p}: popis nad poľom (${Math.round(rp.bottom)} ≤ ${Math.round(rf.top)})`);
    }
    return zle;
  }, popisy);
}

async function strana(t, dizajn, moznosti) {
  const p = await t.novaStranka(moznosti);
  await p.context().addInitScript((d) => {
    try {
      localStorage.setItem("faktero.dizajn", d);
    } catch {
      /* bez úložiska */
    }
  }, dizajn);
  return p;
}

export default {
  popis:
    "mobil 390 px: zoznamy ako karty so sumou, AI nič nekryje, hlavičky a polia v rámčeku (kompaktné aj klasické)",
  limit: 900000,
  async spusti(t) {
    const snimky = process.env.E2E_SNIMKY || null;
    if (snimky) mkdirSync(snimky, { recursive: true });
    const nalezy = [];

    const ids = await t.krok("príprava: zákazka a stavy dokladov", async () => {
      const z = await t.rest.get(
        `jobs?company_id=eq.${t.firmy.test}&select=id&order=created_at.desc&limit=1`,
      );
      const s = await t.rest.get(`stavy_dokladov?company_id=eq.${t.firmy.test}&select=id&limit=1`);
      return { zakazka: z.data?.[0]?.id ?? null, maStavy: (s.data ?? []).length > 0 };
    });

    for (const dizajn of ["kompaktny", "faktero"]) {
      await nastavUcetToku(t, {
        dizajn,
        vzhlad_nespracovanych: dizajn === "kompaktny" ? "kompaktny" : "klasicky",
      });
      const page = await strana(t, dizajn, { mobil: true });
      const snimka = async (meno) => {
        if (!snimky) return;
        await page
          .screenshot({
            path: path.join(snimky, `390-${dizajn}-${meno}.png`),
            fullPage: true,
            timeout: 15000,
          })
          .catch(() => {});
      };

      for (const [meno, cesta] of [...ZOZNAMY, ...AI_STRANKY]) {
        await t.krok(`${dizajn} 390: ${meno}`, async () => {
          await nacitaj(t, page, cesta);
          const posuv = await posuvStranky(page);
          if (posuv > 1)
            nalezy.push(`${dizajn} ${meno}: stránka sa posúva do strany o ${posuv} px`);
          const tab = await posuvneTabulky(page);
          if (tab.length)
            nalezy.push(`${dizajn} ${meno}: tabuľka posúvaná v karte — ${tab.join("; ")}`);
          const ai = await coKryjeAi(page);
          if (!ai.ai) t.upozornenia.push(`${dizajn} ${meno}: tlačidlo AI na stránke nie je`);
          else if (ai.zle.length)
            nalezy.push(`${dizajn} ${meno}: AI kryje ${ai.zle.slice(0, 4).join(" | ")}`);
          await snimka(meno);
        });
      }

      const hlavicky = [["vyuctovanie-nove", "/doklady/vyuctovania/novy"]];
      if (ids.zakazka) hlavicky.push(["zakazka", `/zakazky/${ids.zakazka}`]);
      else t.upozornenia.push("vo firme Test nie je zákazka — hlavička zákazky neoverená");
      for (const [meno, cesta] of hlavicky) {
        await t.krok(`${dizajn} 390: hlavička ${meno}`, async () => {
          await nacitaj(t, page, cesta);
          const zle = await osamoteneMenu(page);
          if (zle) nalezy.push(`${dizajn} ${meno}: ${zle}`);
          const posuv = await posuvStranky(page);
          if (posuv > 1) nalezy.push(`${dizajn} ${meno}: posuv do strany ${posuv} px`);
          await snimka(meno);
        });
      }

      await t.krok(`${dizajn} 390: nová prijatá faktúra`, async () => {
        await nacitaj(t, page, "/prijate-faktury/nova");
        if (dizajn === "kompaktny") {
          const zle = await popisMimoRamceka(page, ["IČO", "Odpočítanie dane"]);
          for (const z of zle) nalezy.push(`kompaktny prijatá nová: ${z}`);
        }
        await snimka("prijata-nova");
      });
      await page.context().close();

      // Široká obrazovka: nová faktúra (lepkavá lišta) a stĺpce bločkov.
      const siroka = await strana(t, dizajn, { sirka: 1440 });
      await siroka.setViewportSize({ width: 1440, height: 900 });
      await t.krok(`${dizajn} 1440: nová faktúra — lišta akcií nekryje Daňový režim`, async () => {
        await nacitaj(t, siroka, "/faktury/nova");
        const r = await siroka.evaluate(async () => {
          const h = [...document.querySelectorAll("main h2, main h3, main div, main span")].find(
            (x) => x.childElementCount === 0 && /^Daňový režim$/i.test(x.textContent.trim()),
          );
          if (!h) return { chyba: "sekcia Daňový režim sa nenašla" };
          const karta = h.closest("section, [class*='rounded']") ?? h;
          const lista = [...document.querySelectorAll("main *")].find((x) => {
            const s = getComputedStyle(x);
            return (s.position === "sticky" || s.position === "fixed") && s.bottom !== "auto";
          });
          if (!lista) return { chyba: null, bezListy: true };
          // Odroluj tak, aby sekcia bola dole nad lištou, a pozri, či sa celá zmestí.
          // Prilepená lišta stojí `bottom` px nad spodkom okna (sticky bottom-4 = 16 px) —
          // bez neho tok odroloval sekciu 8 px POD lištu a hlásil prekryv, ktorý
          // používateľ odrolovaním ďalej nemá (snímka 1440 po odrolovaní na koniec).
          const vyskaListy = lista.getBoundingClientRect().height;
          const odSpodku = parseFloat(getComputedStyle(lista).bottom) || 0;
          const rk = karta.getBoundingClientRect();
          window.scrollBy(0, rk.bottom - (window.innerHeight - odSpodku - vyskaListy - 8));
          await new Promise((res) => setTimeout(res, 300));
          const rk2 = karta.getBoundingClientRect();
          const rl = lista.getBoundingClientRect();
          // Koniec stránky: posledná karta musí ísť odrolovať nad lištu.
          window.scrollTo(0, document.documentElement.scrollHeight);
          await new Promise((res) => setTimeout(res, 300));
          const rl2 = lista.getBoundingClientRect();
          const posledna = [...document.querySelectorAll("main form > *, main section")]
            .filter((x) => x !== lista && !lista.contains(x) && x.getBoundingClientRect().height)
            .pop();
          const rp = posledna?.getBoundingClientRect();
          return {
            chyba:
              rk2.bottom > rl.top + 1
                ? `sekcia Daňový režim končí ${Math.round(rk2.bottom)} px, lišta začína ${Math.round(rl.top)} px`
                : rp && rp.bottom > rl2.top + 1
                  ? `posledná sekcia sa nedá odrolovať nad lištu (${Math.round(rp.bottom)} > ${Math.round(rl2.top)})`
                  : null,
          };
        });
        if (r.chyba) nalezy.push(`${dizajn} 1440 nová faktúra: ${r.chyba}`);
        if (snimky)
          await siroka
            .screenshot({ path: path.join(snimky, `1440-${dizajn}-faktura-nova-okno.png`) })
            .catch(() => {});
      });
      await t.krok(`${dizajn} 1440: bločky — stĺpec Stav dokladu`, async () => {
        await nacitaj(t, siroka, "/doklady?stav=vsetky");
        const stlpec = await siroka
          .locator("main th", { hasText: /^Stav dokladu$/ })
          .count()
          .catch(() => 0);
        if (stlpec && !ids.maStavy)
          nalezy.push(
            `${dizajn} bločky: stĺpec „Stav dokladu“ je prázdny (firma nemá vlastné stavy)`,
          );
      });
      await siroka.context().close();
    }
    if (snimky) t.log(`snímky: ${snimky}`);
    for (const n of nalezy) t.log(`nález: ${n}`);
    t.over(!nalezy.length, `nálezy (${nalezy.length}): ${nalezy.join("; ")}`);
  },
};
