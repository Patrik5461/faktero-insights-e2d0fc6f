/**
 * ABRA Flexi (winstrom XML) — doklady so zaúčtovaním.
 *
 * Názvy prvkov sú overené na vlastnostiach evidencií priamo zo servera Flexi
 * (`demo.flexibee.eu/c/demo/<evidencia>/properties.json`) a na ich vzorových
 * dátach:
 *  - vystavená faktúra → `faktura-vydana`, prijatá faktúra aj bloček zaúčtovaný
 *    ako faktúra → `faktura-prijata` (položky v `polozkyFaktury`),
 *  - bloček platený v hotovosti → `pokladni-pohyb` s `typPohybuK=typPohybu.vydej`
 *    (položky v `polozkyDokladu`, povinná `pokladna`),
 *  - bloček platený kartou → `interni-doklad` (položky v `polozkyIntDokladu`).
 *
 * Predkontácia ide do `typUcOp` (predpis zaúčtovania), členenie do `clenDph`
 * (riadky DPH), stredisko, zákazka a činnosť do rovnomenných väzieb — všetko
 * ako `code:<kód>`, takže kódy v číselníku Faktera musia byť kódmi z Flexi.
 * Doklad s jedným kódom ide ako bezpoložkový (`bezPolozek`) so sumami po
 * sadzbách v hlavičke; rozúčtovaný ide s účtovnými položkami
 * (`typPolozky.ucetni`), z ktorých každá nesie vlastný predpis a riadok DPH.
 *
 * Identita dokladu je `ext:FAKTERO:<agenda>:<id>` — opakovaný import ten istý
 * doklad aktualizuje, nezaloží druhý. Interné číslo (`kod`) prijatých dokladov
 * sa neposiela: pridelí ho Flexi z dokladovej rady typu dokladu, číslo
 * dodávateľa ide do `cisDosle`.
 *
 * Dobropis má sumy záporné (tak ich má aj Flexi na opravnom doklade).
 */

import type { DokladUctovania, KodUctovania, RiadokUctovania } from "./zauctovanie-export";

export type NastaveniaFlexi = {
  /** Typ vystavenej faktúry (číselník `typ-faktury-vydane`), predvolene FAKTURA. */
  typDoklVydana?: string | null;
  /** Typ vystaveného dobropisu, predvolene DOBROPIS. */
  typDoklDobropisVydany?: string | null;
  /** Typ prijatej faktúry (`typ-faktury-prijate`), predvolene FAKTURA. */
  typDoklPrijata?: string | null;
  /** Typ prijatého dobropisu; prázdny = ten istý typ ako prijatá faktúra so zápornými sumami. */
  typDoklDobropisPrijaty?: string | null;
  /** Typ pokladničného pohybu (`typ-pokladni-pohyb`), predvolene STANDARD. */
  typDoklPokladna?: string | null;
  /** Typ interného dokladu (`typ-interniho-dokladu`), predvolene INT. DOKLAD. */
  typDoklInterny?: string | null;
  /** Kód pokladne (`pokladna`) — bez neho Flexi pokladničný doklad nezaloží. */
  pokladna?: string | null;
};

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const dve = (n: number) => r2(n).toFixed(2);

const esc = (h: unknown): string =>
  String(h ?? "")
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const kod = (v: unknown) => String(v ?? "").trim();

/** Väzba do číselníka Flexi; prázdna hodnota sa nezapíše vôbec. */
function vazba(nazov: string, hodnota: unknown, odsadenie: string): string {
  const k = kod(hodnota);
  return k ? `\n${odsadenie}<${nazov}>code:${esc(k)}</${nazov}>` : "";
}

function pole(nazov: string, hodnota: unknown, odsadenie: string, max?: number): string {
  let v = String(hodnota ?? "").trim();
  if (!v) return "";
  if (max) v = v.slice(0, max);
  return `\n${odsadenie}<${nazov}>${esc(v)}</${nazov}>`;
}

type Priehradka = "Zakl" | "Sniz" | "Sniz2" | "Osv";

/**
 * Sadzby dokladu na priehradky Flexi: najvyššia kladná je základná, ďalšie
 * znížená a 2. znížená, nula je oslobodené. Percentá si Flexi drží vo
 * vlastnom číselníku podľa obdobia, preto sa posiela priehradka.
 */
function priehradky(riadky: RiadokUctovania[]): (sadzba: number) => Priehradka {
  const kladne = [...new Set(riadky.map((r) => Number(r.sadzba) || 0))]
    .filter((s) => s > 0)
    .sort((a, b) => b - a);
  return (sadzba: number) => {
    const s = Number(sadzba) || 0;
    if (s <= 0) return "Osv";
    const i = kladne.indexOf(s);
    return i <= 0 ? "Zakl" : i === 1 ? "Sniz" : "Sniz2";
  };
}

const TYP_SZB: Record<Priehradka, string> = {
  Zakl: "typSzbDph.dphZakl",
  Sniz: "typSzbDph.dphSniz",
  Sniz2: "typSzbDph.dphSniz2",
  Osv: "typSzbDph.dphOsv",
};

/** Súčty hlavičky po priehradkách (`sumZklZakl`, `sumDphSniz`, `sumOsv`…). */
function sumyHlavicky(d: DokladUctovania, zn: number, o: string): string {
  const pr = priehradky(d.riadky);
  const zaklad: Record<Priehradka, number> = { Zakl: 0, Sniz: 0, Sniz2: 0, Osv: 0 };
  const dan: Record<Priehradka, number> = { Zakl: 0, Sniz: 0, Sniz2: 0, Osv: 0 };
  for (const r of d.riadky) {
    const p = pr(r.sadzba);
    zaklad[p] += r.zaklad;
    dan[p] += r.dph;
  }
  const out: string[] = [];
  if (zaklad.Osv) out.push(`${o}<sumOsv>${dve(zn * zaklad.Osv)}</sumOsv>`);
  for (const p of ["Zakl", "Sniz", "Sniz2"] as const) {
    if (!zaklad[p] && !dan[p]) continue;
    out.push(`${o}<sumZkl${p}>${dve(zn * zaklad[p])}</sumZkl${p}>`);
    out.push(`${o}<sumDph${p}>${dve(zn * dan[p])}</sumDph${p}>`);
  }
  out.push(`${o}<sumCelkem>${dve(zn * d.celkom)}</sumCelkem>`);
  return "\n" + out.join("\n");
}

/** Účtovné položky rozúčtovaného dokladu — každá s vlastným predpisom a riadkom DPH. */
function uctovnePolozky(d: DokladUctovania, zn: number, tag: string, o: string): string {
  const pr = priehradky(d.riadky);
  return d.riadky
    .map((r) => {
      const nazov = r.text || d.text;
      return `${o}<${tag}>${pole("nazev", nazov, o + "  ", 255)}
${o}  <typPolozkyK>typPolozky.ucetni</typPolozkyK>
${o}  <mnozMj>${zn < 0 ? "-1" : "1"}</mnozMj>
${o}  <cenaMj>${dve(r.zaklad)}</cenaMj>
${o}  <typCenyDphK>typCeny.bezDph</typCenyDphK>
${o}  <typSzbDphK>${TYP_SZB[pr(r.sadzba)]}</typSzbDphK>
${o}  <szbDph>${dve(r.sadzba)}</szbDph>
${o}  <sumZkl>${dve(zn * r.zaklad)}</sumZkl>
${o}  <sumDph>${dve(zn * r.dph)}</sumDph>
${o}  <sumCelkem>${dve(zn * (r.zaklad + r.dph))}</sumCelkem>${vazba("typUcOp", r.predkontacia, o + "  ")}${vazba(
        "clenDph",
        r.clenenie,
        o + "  ",
      )}${vazba("stredisko", d.stredisko, o + "  ")}${vazba("zakazka", d.zakazka, o + "  ")}${vazba(
        "cinnost",
        d.cinnost,
        o + "  ",
      )}
${o}</${tag}>`;
    })
    .join("\n");
}

function poznamka(d: DokladUctovania): string {
  return [d.poznamka, d.intPoznamka].filter(Boolean).join(" · ");
}

export function buildFlexiUctovanie(opts: {
  firma: Record<string, any>;
  doklady: DokladUctovania[];
  /** Číselník predkontácií — kód predkontácie sa posiela ako kód predpisu zaúčtovania. */
  kody: Record<string, KodUctovania>;
  nastavenia?: NastaveniaFlexi;
}): { xml: string; preskocene: string[] } {
  const n = opts.nastavenia ?? {};
  const domaca = String(opts.firma?.default_currency ?? "EUR").toUpperCase() || "EUR";
  const preskocene: string[] = [];
  const vystup: string[] = [];

  for (const d of opts.doklady) {
    const cislo = d.cislo || d.id;
    if (d.mena !== domaca) {
      // Polia `sum*` sú v domácej mene, cudzia patrí do `*Men` s kurzom —
      // radšej doklad vynechať než poslať 10 000 Kč ako eurá.
      preskocene.push(`${cislo} — doklad v mene ${d.mena}, Flexi ho čaká v domácej mene`);
      continue;
    }
    if (d.druh === "zaloha") {
      preskocene.push(`${cislo} — zálohová faktúra, Flexi ju vedie ako vlastný typ Záloha`);
      continue;
    }
    if (d.odpocetZalohy > 0) {
      preskocene.push(`${cislo} — faktúra s odpočtom zálohy, odpočet treba vo Flexi naviazať na zálohu ručne`);
      continue;
    }
    if (!d.riadky.length) {
      preskocene.push(`${cislo} — doklad nemá sumy`);
      continue;
    }

    const zn = d.druh === "dobropis" ? -1 : 1;
    const ext = `ext:FAKTERO:${d.agenda}:${d.id}`;
    const o = "    ";

    let tag: string;
    let tagPolozky: string;
    let kolekcia: string;
    let typDokl: string;
    let hlavicka = "";

    if (d.agenda === "vystavena") {
      tag = "faktura-vydana";
      tagPolozky = "faktura-vydana-polozka";
      kolekcia = "polozkyFaktury";
      typDokl =
        zn < 0 ? kod(n.typDoklDobropisVydany) || "DOBROPIS" : kod(n.typDoklVydana) || "FAKTURA";
      hlavicka =
        pole("kod", d.cislo, o, 20) +
        pole("varSym", d.vs || d.cislo.replace(/\D/g, ""), o, 20) +
        pole("datVyst", d.datumVystavenia, o) +
        pole("duzpPuv", d.datumDodania, o) +
        pole("datSplat", d.datumSplatnosti, o);
    } else if (d.forma === "pokladna") {
      if (!kod(n.pokladna) && !kod(d.pokladna)) {
        preskocene.push(`${cislo} — bloček v hotovosti, chýba kód pokladne vo Flexi`);
        continue;
      }
      tag = "pokladni-pohyb";
      tagPolozky = "pokladni-pohyb-polozka";
      kolekcia = "polozkyDokladu";
      typDokl = kod(n.typDoklPokladna) || "STANDARD";
      hlavicka =
        `\n${o}<typPohybuK>typPohybu.vydej</typPohybuK>` +
        vazba("pokladna", kod(d.pokladna) || n.pokladna, o) +
        pole("cisDosle", d.cislo, o, 40) +
        pole("varSym", d.vs, o, 20) +
        pole("datVyst", d.datumVystavenia, o) +
        pole("duzpPuv", d.datumDodania, o);
    } else if (d.forma === "interny") {
      tag = "interni-doklad";
      tagPolozky = "interni-doklad-polozka";
      kolekcia = "polozkyIntDokladu";
      typDokl = kod(n.typDoklInterny) || "INT. DOKLAD";
      hlavicka =
        pole("cisDosle", d.cislo, o, 40) +
        pole("varSym", d.vs, o, 20) +
        pole("datVyst", d.datumVystavenia, o) +
        pole("duzpPuv", d.datumDodania, o);
    } else {
      tag = "faktura-prijata";
      tagPolozky = "faktura-prijata-polozka";
      kolekcia = "polozkyFaktury";
      typDokl =
        (zn < 0 ? kod(n.typDoklDobropisPrijaty) : "") || kod(n.typDoklPrijata) || "FAKTURA";
      hlavicka =
        pole("cisDosle", d.cislo, o, 40) +
        pole("varSym", d.vs, o, 20) +
        // Pri prijatej faktúre je `datVyst` dátum prijatia („Přijato").
        pole("datVyst", d.datumPrijatia || d.datumVystavenia, o) +
        pole("duzpPuv", d.datumDodania, o) +
        pole("datSplat", d.datumSplatnosti, o) +
        pole("iban", d.partner.iban, o, 50);
    }

    const partner =
      pole("nazFirmy", d.partner.nazov, o, 255) +
      pole("ulice", d.partner.ulica, o, 255) +
      pole("mesto", d.partner.mesto, o, 255) +
      pole("psc", d.partner.psc, o, 20) +
      pole("ic", d.partner.ico, o, 20) +
      pole("dic", d.partner.icDph || d.partner.dic, o, 20);

    const spolocne =
      vazba("typDokl", typDokl, o) +
      hlavicka +
      pole("datUcto", d.datumZauctovania, o) +
      `\n${o}<mena>code:${esc(d.mena)}</mena>` +
      partner +
      pole("popis", d.text, o, 255) +
      pole("poznam", poznamka(d), o, 255);

    // Doklad s jedným kódom: kódy v hlavičke, bez položiek. Rozúčtovaný:
    // účtovné položky, každá so svojím predpisom a riadkom DPH.
    const telo = d.rozuctovany
      ? `\n${o}<bezPolozek>false</bezPolozek>\n${o}<${kolekcia}>\n${uctovnePolozky(
          d,
          zn,
          tagPolozky,
          o + "  ",
        )}\n${o}</${kolekcia}>`
      : `\n${o}<bezPolozek>true</bezPolozek>` +
        sumyHlavicky(d, zn, o) +
        vazba("typUcOp", d.predkontacia, o) +
        vazba("clenDph", d.clenenie, o);

    vystup.push(`  <${tag}>
${o}<id>${esc(ext)}</id>${spolocne}${vazba("stredisko", d.stredisko, o)}${vazba(
      "zakazka",
      d.zakazka,
      o,
    )}${vazba("cinnost", d.cinnost, o)}${telo}
  </${tag}>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<winstrom version="1.0">
${vystup.join("\n")}
</winstrom>
`;
  return { xml, preskocene };
}
