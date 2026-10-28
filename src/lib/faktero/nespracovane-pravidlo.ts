/*
  Pravidlo účtovania pri spracovaní nespracovaného dokladu.

  Keď doklad spĺňa podmienky pravidla (dodávateľ, používateľ, predmet mailu,
  spôsob úhrady, typ), jeho kódy sa doplnia rovno do formulára a pri poli
  svieti hviezdička. Zmena dodávateľa pravidlo vyhodnotí znova — hodnoty
  starého pravidla, ktoré človek nezmenil, ustúpia novému. Keď dodávateľ
  sedí na viac pravidiel, človek si vyberie iné a jeho kódy prepíšu
  doterajšie zaúčtovanie.

  Poradie zdrojov ostáva: čo zadal človek > pravidlo > naučené > návrh AI.
*/

import type { DruhNespracovaneho, UdajeNespracovaneho } from "./nespracovane";
import {
  krajinaDokladu,
  prvePravidlo,
  pravidloSedi,
  typPrijatej,
  type DokladNaPorovnanie,
  type Pravidlo,
} from "./pravidla-uctovania";

type PolePravidla = "kategoria" | "predkontacia" | "clenenie" | "kv";
const POLIA: PolePravidla[] = ["kategoria", "predkontacia", "clenenie", "kv"];

function hodnota(u: UdajeNespracovaneho, pole: PolePravidla): string {
  return pole === "kategoria" ? (u.kategoria ?? "") : (u.kody?.[pole] ?? "");
}

function nastav(u: UdajeNespracovaneho, pole: PolePravidla, h: string): UdajeNespracovaneho {
  return pole === "kategoria" ? { ...u, kategoria: h } : { ...u, kody: { ...u.kody, [pole]: h } };
}

function zPravidla(p: Pravidlo, pole: PolePravidla): string {
  const v =
    pole === "kategoria"
      ? p.kategoria
      : pole === "predkontacia"
        ? p.predkontacia
        : pole === "clenenie"
          ? p.clenenie_dph
          : p.kv_clenenie;
  return String(v ?? "").trim();
}

/** Doklad v tvare, v akom ho porovnáva spúšťač `faktero_pravidlo_pre_doklad`. */
export function porovnanieNespracovaneho(
  u: UdajeNespracovaneho,
  druh: DruhNespracovaneho | "" | null,
  kontext: {
    createdBy?: string | null;
    predmetMailu?: string | null;
    odosielatelMailu?: string | null;
    krajinaFirmy?: string | null;
  } = {},
): DokladNaPorovnanie | null {
  if (!druh || druh === "ostatny") return null;
  const blocek = druh === "blocek";
  return {
    supplier_ico: u.dodavatel.ico || null,
    supplier_name: u.dodavatel.nazov || (blocek ? null : "Neurčený dodávateľ"),
    payment_method: u.platba || (blocek ? "karta" : "prevod"),
    created_by: kontext.createdBy ?? null,
    predmet_mailu: kontext.predmetMailu ?? null,
    odosielatel_mailu: kontext.odosielatelMailu ?? null,
    krajina: krajinaDokladu(null, u.dodavatel.icDph),
    krajina_firmy: kontext.krajinaFirmy ?? null,
    variabilny_symbol: blocek ? null : u.vs || null,
    druh: blocek ? "blocek" : "prijata",
    typ: blocek
      ? null
      : typPrijatej(
          druh === "zalohova" ? "proforma" : "regular",
          druh === "dobropis" ? -1 : 1,
          u.opravuje,
        ),
  };
}

/** Pravidlá, ktoré na doklad sedia (v poradí, v akom by ich vybral spúšťač). */
export function zhodnePravidla<T extends Pravidlo>(
  pravidla: T[],
  d: DokladNaPorovnanie | null,
): T[] {
  if (!d) return [];
  const prve = prvePravidlo(pravidla, d);
  const ostatne = pravidla.filter((p) => p !== prve && pravidloSedi(p, d));
  return prve ? [prve, ...ostatne] : [];
}

/**
 * Uplatní pravidlo na údaje formulára.
 *
 * - Hodnoty doterajšieho pravidla, ktoré človek nezmenil, sa najprv vrátia
 *   (pravidlo už nesedí alebo ho nahrádza iné).
 * - Bez `prepisat` sa vyplnia len polia prázdne, s nezmenenou naučenou
 *   hodnotou alebo s nepotvrdeným návrhom AI — pravidlo má pred nimi prednosť.
 * - S `prepisat` (človek pravidlo vybral) prepíše jeho kódy aj to, čo v poli je.
 * - `p = null` pravidlo z dokladu zruší.
 */
export function uplatniPravidlo(
  u: UdajeNespracovaneho,
  p: (Pravidlo & { id?: string }) | null,
  prepisat = false,
): UdajeNespracovaneho {
  let out: UdajeNespracovaneho = { ...u, kody: { ...u.kody } };
  const stare = u.zPravidla ?? {};
  for (const pole of POLIA)
    if (stare[pole] && hodnota(out, pole) === stare[pole]) out = nastav(out, pole, "");
  const { pravidloId: _id, zPravidla: _z, ...bez } = out;
  out = bez as UdajeNespracovaneho;
  if (!p) return out;

  const zapisane: Record<string, string> = {};
  const ai = { ...(out.navrhAi ?? {}) };
  for (const pole of POLIA) {
    const h = zPravidla(p, pole);
    if (!h) continue;
    const teraz = hodnota(out, pole).trim();
    const naucene = Boolean(teraz) && out.naucene?.[pole] === teraz;
    const odAi = Boolean(teraz) && ai[pole] === teraz;
    if (prepisat || !teraz || naucene || odAi) {
      out = nastav(out, pole, h);
      zapisane[pole] = h;
      delete ai[pole];
    }
  }
  // Návrh AI v poliach, ktoré prevzalo pravidlo, už nečaká na potvrdenie.
  if (Object.keys(ai).length !== Object.keys(out.navrhAi ?? {}).length) {
    const { navrhAi: _a, navrhAiDovod: dovod, ...zv } = out;
    out = Object.keys(ai).length
      ? { ...(zv as UdajeNespracovaneho), navrhAi: ai, ...(dovod ? { navrhAiDovod: dovod } : {}) }
      : (zv as UdajeNespracovaneho);
  }
  return {
    ...out,
    ...(p.id ? { pravidloId: p.id } : {}),
    ...(Object.keys(zapisane).length ? { zPravidla: zapisane } : {}),
  };
}

/** Polia, pri ktorých svieti hviezdička (hodnota z pravidla, človek ju nezmenil). */
export function poliaZPravidla(u: UdajeNespracovaneho): PolePravidla[] {
  const z = u.zPravidla ?? {};
  return POLIA.filter((pole) => z[pole] && hodnota(u, pole) === z[pole]);
}
