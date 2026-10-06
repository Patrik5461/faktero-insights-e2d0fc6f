/*
  Money S3 — doklady so zaúčtovaním (faktúry vydané aj prijaté, bločky).

  Podľa oficiálnych XSD schém Money S3 (`_Document.xsd`, `__Faktura.xsd`,
  `__UcDokl.xsd`, `__IntDokl.xsd` z balíka www.money.sk/wp-content/uploads/
  2024/02/schemas-1.zip, v programe `Data/XMLDE/Schemas`). Schémy sú
  sekvencie — **poradie elementov je záväzné**, preto sa tu skladá presne
  v poradí schémy a test výsledok overuje proti nim
  (`__fixtures__/money-s3-uct-schemas`).

  Kam čo ide:
  - vystavená faktúra → `SeznamFaktVyd/FaktVyd`
  - prijatá faktúra a bloček ako faktúra → `SeznamFaktPrij/FaktPrij`
  - bloček platený hotovosťou → `SeznamPokDokl/PokDokl` (výdaj)
  - bloček platený kartou → `SeznamIntDokl/IntDokl`

  Zaúčtovanie: zkratka předkontace (`PredKontac`, na položke `Predkontac`,
  na pokladničnom doklade `PrKont`) a členenia DPH (`KodDPH`, `Cleneni`),
  stredisko, zákazka a činnosť. Rozúčtovaný doklad (rôzne kódy po riadkoch)
  ide s položkami, z ktorých každá nesie svoje kódy. Interný doklad Money
  předkontaci na hlavičke ani normálne položky pri importe nespracuje
  („zatím neřešeno" v schéme) — ide preto s rozúčtovacími položkami
  priamo na účty MD/Dal z číselníka predkontácií.

  Sumy sú kladné; dobropis nesie príznak `Dobropis` (rovnako ako doterajší
  export vydaných faktúr). Sumy v hlavičke sú v domácej mene agendy, doklad
  v cudzej mene má navyše blok `Valuty` s kurzom.
*/

import type { DokladUctovania, KodUctovania, RiadokUctovania } from "./zauctovanie-export";
import { rozdelUcet } from "./zauctovanie-export";

export type NastaveniaMoney = {
  /** Zkratky číselných řad v Money (max. 5 znakov). */
  radVydane?: string | null;
  radPrijate?: string | null;
  radPokladna?: string | null;
  radInterne?: string | null;
  /** Zkratka pokladne pre pokladničné doklady. */
  pokladna?: string | null;
  /**
   * Účet DPH na vstupe (napr. `343100`) — len pre interné doklady, ktoré
   * Money importuje ako rozúčtovacie položky priamo na účty.
   */
  ucetDph?: string | null;
};

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const f2 = (n: unknown) => (Math.round((Number(n ?? 0) + Number.EPSILON) * 100) / 100).toFixed(2);
const f4 = (n: unknown) => (Math.round((Number(n ?? 0) + Number.EPSILON) * 10000) / 10000).toFixed(4);
const skrat = (s: unknown, max: number) => String(s ?? "").trim().slice(0, max);
/** Element len keď má hodnotu — prázdne voliteľné elementy sa nevypisujú. */
const el = (nazov: string, hodnota: unknown, odsadenie = "") => {
  const v = String(hodnota ?? "").trim();
  return v ? `\n${odsadenie}<${nazov}>${esc(v)}</${nazov}>` : "";
};

/** Hladiny sadzieb dokladu: základná (≥ 20 %), znížená (najvyššia pod 20 %), ostatné. */
function hladiny(riadky: RiadokUctovania[]) {
  const sadzby = [...new Set(riadky.map((r) => Number(r.sadzba) || 0))].filter((s) => s > 0);
  const zakladna = sadzby.filter((s) => s >= 20).sort((a, b) => b - a)[0];
  const znizena = sadzby.filter((s) => s < 20).sort((a, b) => b - a)[0];
  const dalsie = sadzby.filter((s) => s !== zakladna && s !== znizena).sort((a, b) => b - a);
  return { zakladna, znizena, dalsie };
}

function sucet(riadky: RiadokUctovania[], sadzba: number | undefined) {
  if (sadzba == null) return { zaklad: 0, dph: 0 };
  const v = riadky.filter((r) => (Number(r.sadzba) || 0) === sadzba);
  return {
    zaklad: v.reduce((a, r) => a + r.zaklad, 0),
    dph: v.reduce((a, r) => a + r.dph, 0),
  };
}

/** `souhrnDPHType`: Zaklad0, Zaklad5, Zaklad22, DPH5, DPH22, SeznamDalsiSazby. */
function souhrnDph(riadky: RiadokUctovania[], prepocet: (x: number) => number, o: string): string {
  const h = hladiny(riadky);
  const nulova = riadky.filter((r) => !(Number(r.sadzba) || 0)).reduce((a, r) => a + r.zaklad, 0);
  const z = sucet(riadky, h.znizena);
  const v = sucet(riadky, h.zakladna);
  const dalsie = h.dalsie
    .map((s) => {
      const x = sucet(riadky, s);
      return `
${o}    <DalsiSazba>
${o}      <Popis>Znížená sadzba ${s} %</Popis>
${o}      <HladinaDPH>1</HladinaDPH>
${o}      <Sazba>${s}</Sazba>
${o}      <Zaklad>${f2(prepocet(x.zaklad))}</Zaklad>
${o}      <DPH>${f2(prepocet(x.dph))}</DPH>
${o}    </DalsiSazba>`;
    })
    .join("");
  return `<SouhrnDPH>
${o}  <Zaklad0>${f2(prepocet(nulova))}</Zaklad0>
${o}  <Zaklad5>${f2(prepocet(z.zaklad))}</Zaklad5>
${o}  <Zaklad22>${f2(prepocet(v.zaklad))}</Zaklad22>
${o}  <DPH5>${f2(prepocet(z.dph))}</DPH5>
${o}  <DPH22>${f2(prepocet(v.dph))}</DPH22>${dalsie ? `\n${o}  <SeznamDalsiSazby>${dalsie}\n${o}  </SeznamDalsiSazby>` : ""}
${o}</SouhrnDPH>`;
}

/** `dokladFirmaType` v poradí schémy: ObchNazev, ObchAdresa, ICO, DIC, DICSK, EMail. */
function firma(d: DokladUctovania, tag: string, o: string): string {
  const p = d.partner;
  const icDph = skrat(p.icDph, 20);
  return `<${tag}>
${o}  <ObchNazev>${esc(p.nazov)}</ObchNazev>
${o}  <ObchAdresa>${el("Ulice", p.ulica, `${o}    `)}${el("Misto", p.mesto, `${o}    `)}${el("PSC", p.psc, `${o}    `)}${el("KodStatu", skrat(p.stat, 2).toUpperCase(), `${o}    `)}
${o}  </ObchAdresa>${el("ICO", skrat(p.ico, 10), `${o}  `)}${el("DIC", icDph, `${o}  `)}${el("DICSK", skrat(p.dic, 20), `${o}  `)}${el("EMail", skrat(p.email, 50), `${o}  `)}
${o}</${tag}>`;
}

type Mena = {
  cudzia: boolean;
  kod: string;
  /** Prepočet sumy dokladu do domácej meny agendy. */
  naDomacu: (x: number) => number;
  mnozstvo: number;
  kurz: number;
};

/** `Valuty` hlavičky — v poradí Mena, SouhrnDPH, Celkem (ako doterajší export). */
function valuty(d: DokladUctovania, m: Mena, o: string): string {
  if (!m.cudzia) return "";
  return `
${o}<Valuty>
${o}  <Mena>
${o}    <Kod>${esc(m.kod)}</Kod>
${o}    <Mnozstvi>${m.mnozstvo}</Mnozstvi>
${o}    <Kurs>${(m.mnozstvo / m.kurz).toFixed(4)}</Kurs>
${o}  </Mena>
${o}  ${souhrnDph(d.riadky, (x) => x, `${o}  `)}
${o}  <Celkem>${f2(d.celkom)}</Celkem>
${o}</Valuty>`;
}

/** Položka faktúry (`polFakturyType`) z riadku zaúčtovania alebo položky dokladu. */
function polozkaFaktury(
  p: {
    popis: string;
    mnozstvo: number;
    sadzba: number;
    cena: number;
    zaklad: number;
    dph: number;
    predkontacia: string | null;
    clenenie: string | null;
  },
  d: DokladUctovania,
  m: Mena,
  poradie: number,
  o: string,
): string {
  const mn = p.mnozstvo || 1;
  return `
${o}<Polozka>
${o}  <Popis>${esc(skrat(p.popis, 50))}</Popis>
${o}  <PocetMJ>${f4(mn)}</PocetMJ>
${o}  <SazbaDPH>${Number(p.sadzba) || 0}</SazbaDPH>
${o}  <Cena>${f4(m.naDomacu(p.cena))}</Cena>
${o}  <SouhrnDPH>
${o}    <Zaklad_MJ>${f4(m.naDomacu(p.zaklad / mn))}</Zaklad_MJ>
${o}    <DPH_MJ>${f4(m.naDomacu(p.dph / mn))}</DPH_MJ>
${o}    <Zaklad>${f2(m.naDomacu(p.zaklad))}</Zaklad>
${o}    <DPH>${f2(m.naDomacu(p.dph))}</DPH>${
    m.cudzia
      ? `
${o}    <Valuty>
${o}      <Zaklad_MJ>${f4(p.zaklad / mn)}</Zaklad_MJ>
${o}      <DPH_MJ>${f4(p.dph / mn)}</DPH_MJ>
${o}      <Zaklad>${f2(p.zaklad)}</Zaklad>
${o}      <DPH>${f2(p.dph)}</DPH>
${o}    </Valuty>`
      : ""
  }
${o}  </SouhrnDPH>
${o}  <CenaTyp>0</CenaTyp>${el("Cinnost", d.cinnost, `${o}  `)}
${o}  <Poradi>${poradie}</Poradi>${el("KodDPH", p.clenenie, `${o}  `)}${el("Stredisko", d.stredisko, `${o}  `)}${el("Zakazka", d.zakazka, `${o}  `)}${el("Predkontac", p.predkontacia, `${o}  `)}${m.cudzia ? `\n${o}  <Valuty>${f4(p.cena)}</Valuty>` : ""}
${o}</Polozka>`;
}

const sucetRiadkov = (rr: { zaklad: number; dph: number }[]) =>
  Math.round(rr.reduce((a, r) => a + r.zaklad + r.dph, 0) * 100) / 100;

/** Položky faktúry: skutočné položky, keď sedia so zaúčtovaním; inak riadky zaúčtovania. */
function polozkyFaktury(d: DokladUctovania, m: Mena, o: string): string {
  const polozkySedia =
    d.polozky.length > 0 && Math.abs(sucetRiadkov(d.polozky) - sucetRiadkov(d.riadky)) < 0.01;
  if (polozkySedia && (d.agenda === "vystavena" || !d.rozuctovany)) {
    return d.polozky
      .map((p, i) =>
        polozkaFaktury(
          {
            popis: p.nazov,
            mnozstvo: p.mnozstvo,
            sadzba: p.sadzba,
            cena: p.cena,
            zaklad: p.zaklad,
            dph: p.dph,
            // Bez rozúčtovania stačia kódy hlavičky; inak nesie každá položka svoje.
            predkontacia: d.rozuctovany ? (p.predkontacia ?? d.predkontacia) : null,
            clenenie: d.rozuctovany ? (p.clenenie ?? d.clenenie) : null,
          },
          d,
          m,
          i + 1,
          o,
        ),
      )
      .join("");
  }
  // Bez položiek a bez rozúčtovania stačí súhrn v hlavičke (bezpoložková faktúra).
  if (!d.rozuctovany) return "";
  return d.riadky
    .map((r, i) =>
      polozkaFaktury(
        {
          popis: r.text || d.text || "Plnenie",
          mnozstvo: 1,
          sadzba: r.sadzba,
          cena: r.zaklad,
          zaklad: r.zaklad,
          dph: r.dph,
          predkontacia: r.predkontacia,
          clenenie: r.clenenie,
        },
        d,
        m,
        i + 1,
        o,
      ),
    )
    .join("");
}

/** Kódy, ktoré Money pozná len do 10 znakov (zkratkaType); dlhší kód by import odmietol. */
function dlhyKod(d: DokladUctovania): string | null {
  const kody: [string, string | null][] = [
    ["predkontácia", d.predkontacia],
    ["členenie DPH", d.clenenie],
    ["stredisko", d.stredisko],
    ["činnosť", d.cinnost],
    ["zákazka", d.zakazka],
    ...d.riadky.flatMap((r) => [
      ["predkontácia", r.predkontacia] as [string, string | null],
      ["členenie DPH", r.clenenie] as [string, string | null],
    ]),
  ];
  const zly = kody.find(([, k]) => String(k ?? "").trim().length > 10);
  return zly ? `${zly[0]} „${zly[1]}" má viac ako 10 znakov — Money ho neprijme` : null;
}

/** Zjednodušená faktúra: bloček do 1 000 € alebo s členením KV B3. */
function zjednodusena(d: DokladUctovania): boolean {
  if (d.agenda !== "doklad") return false;
  return d.kv === "B3" || (!d.kv && d.celkom <= 1000);
}

function faktura(d: DokladUctovania, m: Mena, nast: NastaveniaMoney, o: string): string {
  const vydana = d.agenda === "vystavena";
  const tag = vydana ? "FaktVyd" : "FaktPrij";
  const rada = skrat(vydana ? nast.radVydane : (nast.radPrijate ?? d.rad), 5);
  const datUcPr = d.datumZauctovania ?? (vydana ? d.datumVystavenia : (d.datumPrijatia ?? d.datumVystavenia));
  // Číslo vydanej faktúry ostáva naše; prijatá dostane číslo z radu Money a
  // číslo dodávateľa ide do „Číslo přijatého dokladu".
  const doklad = vydana ? skrat(d.cislo, 10) : "";
  const vs = skrat(d.vs ?? (vydana ? d.cislo : ""), 20);
  const druh = d.druh === "zaloha" ? "L" : "N";
  // Pri rozúčtovaní nesú kódy položky; hlavička dostane kód len keď je jeden.
  const pk = d.rozuctovany ? "" : (d.riadky[0]?.predkontacia ?? d.predkontacia);
  const kod = d.rozuctovany ? "" : (d.riadky[0]?.clenenie ?? d.clenenie);
  const h = hladiny(d.riadky);
  return `
${o}<${tag}>${el("Doklad", doklad, `${o}  `)}${el("Rada", rada, `${o}  `)}
${o}  <Popis>${esc(skrat(d.text, 50))}</Popis>${el("Vystaveno", d.datumVystavenia, `${o}  `)}${el("DatUcPr", datUcPr, `${o}  `)}${el("PlnenoDPH", d.datumDodania ?? d.datumVystavenia, `${o}  `)}${el("Splatno", d.datumSplatnosti, `${o}  `)}${
    d.druh === "dobropis" ? el("Doruceno", d.datumPrijatia ?? d.datumVystavenia, `${o}  `) : ""
  }${el("KonstSym", skrat(d.ks, 4), `${o}  `)}${el("KodDPH", kod, `${o}  `)}${
    zjednodusena(d) ? `\n${o}  <ZjednD>1</ZjednD>` : ""
  }${el("VarSymbol", vs, `${o}  `)}${el("SpecSymbol", skrat(d.ss, 20), `${o}  `)}${
    vydana ? "" : el("PrijatDokl", skrat(d.cislo, 50), `${o}  `)
  }${el("ParSymbol", vydana ? "" : vs, `${o}  `)}${
    d.druh === "dobropis" ? el("PuvDoklad", skrat(d.opravuje, 50), `${o}  `) : ""
  }${el("Zakazka", d.zakazka, `${o}  `)}
${o}  <Druh>${druh}</Druh>
${o}  <Dobropis>${d.druh === "dobropis" ? 1 : 0}</Dobropis>${el("PredKontac", pk, `${o}  `)}${el("Cinnost", d.cinnost, `${o}  `)}${
    h.znizena != null ? `\n${o}  <SazbaDPH1>${h.znizena}</SazbaDPH1>` : ""
  }${h.zakladna != null ? `\n${o}  <SazbaDPH2>${h.zakladna}</SazbaDPH2>` : ""}
${o}  ${souhrnDph(d.riadky, m.naDomacu, `${o}  `)}
${o}  <Celkem>${f2(m.naDomacu(d.celkom))}</Celkem>${valuty(d, m, `${o}  `)}${el(
    "Poznamka",
    [d.poznamka, d.intPoznamka].filter(Boolean).join("\n"),
    `${o}  `,
  )}${el("Stredisko", d.stredisko, `${o}  `)}
${o}  ${firma(d, "DodOdb", `${o}  `)}${(() => {
    const pol = polozkyFaktury(d, m, `${o}    `);
    return pol ? `\n${o}  <SeznamPolozek>${pol}\n${o}  </SeznamPolozek>` : "";
  })()}
${o}</${tag}>`;
}

/** Normálna položka pokladničného dokladu (`normPolozUDType`) z riadku zaúčtovania. */
function normPolozka(r: RiadokUctovania, d: DokladUctovania, m: Mena, i: number, o: string): string {
  return `
${o}<NormPolozka>
${o}  <Poradi>${i}</Poradi>
${o}  <Popis>${esc(skrat(r.text || d.text || "Výdaj", 50))}</Popis>
${o}  <Cena>${f4(m.naDomacu(r.zaklad))}</Cena>${m.cudzia ? `\n${o}  <Valuty>${f4(r.zaklad)}</Valuty>` : ""}
${o}  <CenaTyp>0</CenaTyp>
${o}  <SazbaDPH>${Number(r.sadzba) || 0}</SazbaDPH>
${o}  <PocetMJ>1</PocetMJ>${el("PrKont", r.predkontacia, `${o}  `)}${el("Cleneni", r.clenenie, `${o}  `)}${el("Stred", d.stredisko, `${o}  `)}${el("Zakazka", d.zakazka, `${o}  `)}${el("Cinnost", d.cinnost, `${o}  `)}
${o}</NormPolozka>`;
}

function pokladnicny(d: DokladUctovania, m: Mena, nast: NastaveniaMoney, o: string): string {
  const pokl = skrat(nast.pokladna ?? d.pokladna, 10);
  const datum = d.datumVystavenia;
  const h = hladiny(d.riadky);
  const pk = d.rozuctovany ? "" : (d.riadky[0]?.predkontacia ?? d.predkontacia);
  const cl = d.rozuctovany ? "" : (d.riadky[0]?.clenenie ?? d.clenenie);
  return `
${o}<PokDokl>
${o}  <Vydej>1</Vydej>
${o}  <Popis>${esc(skrat(d.text, 50))}</Popis>${el("DatUcPr", d.datumZauctovania ?? datum, `${o}  `)}${el("DatVyst", datum, `${o}  `)}${el("DatPlat", datum, `${o}  `)}${el("DatPln", d.datumDodania ?? datum, `${o}  `)}${el("PrijatDokl", skrat(d.cislo, 50), `${o}  `)}${el("VarSym", skrat(d.vs, 20), `${o}  `)}
${o}  ${firma(d, "Adresa", `${o}  `)}${el("Pokl", pokl, `${o}  `)}${el("PrKont", pk, `${o}  `)}${el("Cleneni", cl, `${o}  `)}${el("Stred", d.stredisko, `${o}  `)}${el("Zakazka", d.zakazka, `${o}  `)}${el("Cinnost", d.cinnost, `${o}  `)}${
    h.znizena != null ? `\n${o}  <SSazba>${h.znizena}</SSazba>` : ""
  }${h.zakladna != null ? `\n${o}  <ZSazba>${h.zakladna}</ZSazba>` : ""}
${o}  ${souhrnDph(d.riadky, m.naDomacu, `${o}  `)}
${o}  <Celkem>${f2(m.naDomacu(d.celkom))}</Celkem>${valuty(d, m, `${o}  `)}${el(
    "Pozn",
    [d.poznamka, d.intPoznamka].filter(Boolean).join("\n"),
    `${o}  `,
  )}${el("DRada", skrat(nast.radPokladna ?? d.rad, 5), `${o}  `)}${
    zjednodusena(d) ? `\n${o}  <ZjednD>1</ZjednD>` : ""
  }${
    d.rozuctovany
      ? `\n${o}  <SeznamNormPolozek>${d.riadky.map((r, i) => normPolozka(r, d, m, i + 1, `${o}    `)).join("")}\n${o}  </SeznamNormPolozek>`
      : ""
  }
${o}</PokDokl>`;
}

/** Účet z číselníka pre `UcMD`/`UcD` (max. 9 znakov, bez oddeľovača). */
function ucet(v: unknown): string | null {
  const u = rozdelUcet(v);
  if (!u) return null;
  const s = `${u.synteticky}${u.analyticky}`;
  return s.length <= 9 ? s : null;
}

/**
 * Interný doklad (`intDoklType`) s rozúčtovacími položkami na účty.
 * Vráti chybu, keď sa doklad nedá poskladať (chýbajú účty).
 */
function interny(
  d: DokladUctovania,
  m: Mena,
  nast: NastaveniaMoney,
  kody: Record<string, KodUctovania>,
  o: string,
): { xml: string } | { chyba: string } {
  const clenenia = [...new Set(d.riadky.map((r) => r.clenenie ?? ""))];
  if (clenenia.length > 1)
    return { chyba: "interný doklad v Money nesie len jedno členenie DPH, doklad ich má viac" };
  const ucetDph = ucet(nast.ucetDph);
  const polozky: string[] = [];
  for (const r of d.riadky) {
    const k = kody[String(r.predkontacia ?? "")];
    const md = ucet(k?.ucetMd);
    const dal = ucet(k?.ucetD);
    if (!md || !dal)
      return {
        chyba: `predkontácia „${r.predkontacia ?? "—"}" nemá v číselníku účty MD a Dal — interný doklad ide v Money priamo na účty`,
      };
    const polozka = (popis: string, ucMd: string, castka: number, dph: boolean) => `
${o}  <RozuctPolozka>
${o}    <Popis>${esc(skrat(popis, 50))}</Popis>
${o}    <UcMD>${esc(ucMd)}</UcMD>
${o}    <UcD>${esc(dal)}</UcD>
${o}    <Castka>${f2(m.naDomacu(castka))}</Castka>${el("Stred", d.stredisko, `${o}    `)}${el("Zakazka", d.zakazka, `${o}    `)}${el("Cinnost", d.cinnost, `${o}    `)}${el("ParSym", skrat(d.vs, 20), `${o}    `)}
${o}    <TypCena>${dph ? 1 : 0}</TypCena>
${o}    <SazbaDPH>${Number(r.sadzba) || 0}</SazbaDPH>
${o}  </RozuctPolozka>`;
    if (r.zaklad) polozky.push(polozka(r.text || d.text || "Základ", md, r.zaklad, false));
    if (r.dph) {
      // Daň bez odpočtu ide do nákladu (účet MD predkontácie), inak na účet DPH.
      const ucMd = r.odpocet ? ucetDph : md;
      if (!ucMd) return { chyba: "chýba účet DPH (napr. 343100) v nastaveniach exportu do Money" };
      polozky.push(polozka(`DPH ${Number(r.sadzba) || 0} %`, ucMd, r.dph, true));
    }
  }
  const datum = d.datumVystavenia;
  const h = hladiny(d.riadky);
  const xml = `
${o}<IntDokl>
${o}  <Popis>${esc(skrat(d.text, 50))}</Popis>${el("DatUcPr", d.datumZauctovania ?? datum, `${o}  `)}${el("DatPln", d.datumDodania ?? datum, `${o}  `)}
${o}  <CisloZapoc></CisloZapoc>${el("PrijatDokl", skrat(d.cislo, 50), `${o}  `)}${el("VarSym", skrat(d.vs, 20), `${o}  `)}${el("ParSym", skrat(d.vs, 20), `${o}  `)}
${o}  ${firma(d, "Adresa", `${o}  `)}${el("Cleneni", clenenia[0], `${o}  `)}${el("Stred", d.stredisko, `${o}  `)}${el("Zakazka", d.zakazka, `${o}  `)}${el("Cinnost", d.cinnost, `${o}  `)}${
    h.znizena != null ? `\n${o}  <SSazba>${h.znizena}</SSazba>` : ""
  }${h.zakladna != null ? `\n${o}  <ZSazba>${h.zakladna}</ZSazba>` : ""}
${o}  ${souhrnDph(d.riadky, m.naDomacu, `${o}  `)}
${o}  <Celkem>${f2(m.naDomacu(d.celkom))}</Celkem>${valuty(d, m, `${o}  `)}${el(
    "Pozn",
    [d.poznamka, d.intPoznamka].filter(Boolean).join("\n"),
    `${o}  `,
  )}${el("DRada", skrat(nast.radInterne ?? d.rad, 5), `${o}  `)}${polozky.join("")}
${o}</IntDokl>`;
  return { xml };
}

/**
 * Dávka pre Money S3 (`MoneyData`). Doklad, ktorý formát neunesie, sa vráti
 * v `preskocene` („<číslo> — dôvod") a dávku nezhodí.
 */
export function buildMoneyS3Uctovanie(opts: {
  firma: Record<string, any>;
  doklady: DokladUctovania[];
  kody: Record<string, KodUctovania>;
  nastavenia?: NastaveniaMoney;
}): { xml: string; preskocene: string[] } {
  const nast = opts.nastavenia ?? {};
  const domaca = String(opts.firma?.default_currency ?? "EUR").toUpperCase() || "EUR";
  const preskocene: string[] = [];
  const vydane: string[] = [];
  const prijate: string[] = [];
  const pokladna: string[] = [];
  const interne: string[] = [];

  for (const d of opts.doklady) {
    const nazov = d.cislo || d.partner.nazov || d.id;
    if (!d.riadky.length) {
      preskocene.push(`${nazov} — doklad nemá sumy`);
      continue;
    }
    if (d.odpocetZalohy > 0) {
      preskocene.push(`${nazov} — odpočet zálohy treba v Money zaúčtovať ručne`);
      continue;
    }
    if (d.agenda === "vystavena" && d.cislo.length > 10) {
      preskocene.push(`${nazov} — číslo faktúry má viac ako 10 znakov, Money ho neprijme`);
      continue;
    }
    const dlhy = dlhyKod(d);
    if (dlhy) {
      preskocene.push(`${nazov} — ${dlhy}`);
      continue;
    }
    const mena = d.mena || domaca;
    const cudzia = mena !== domaca;
    // `kurz` je počet jednotiek cudzej meny za jedno euro (ako pri faktúrach).
    const kurz = Number(d.kurz ?? 0) || 0;
    if (cudzia && !kurz) {
      preskocene.push(`${nazov} — doklad v mene ${mena} nemá kurz`);
      continue;
    }
    const m: Mena = {
      cudzia,
      kod: mena,
      naDomacu: (x) => (cudzia ? Number(x ?? 0) / kurz : Number(x ?? 0)),
      mnozstvo: kurz >= 10 ? 100 : 1,
      kurz,
    };

    if (d.agenda === "vystavena") vydane.push(faktura(d, m, nast, "    "));
    // Pokladničný doklad bez pokladne Money nezaloží — kým firma zkratku
    // pokladne nevyplní, ide bloček ako faktúra prijatá (rovnako ako pri Pohode).
    else if (d.agenda === "doklad" && d.forma === "pokladna" && String(nast.pokladna ?? d.pokladna ?? "").trim())
      pokladna.push(pokladnicny(d, m, nast, "    "));
    else if (d.agenda === "doklad" && d.forma === "interny") {
      const r = interny(d, m, nast, opts.kody, "    ");
      if ("chyba" in r) preskocene.push(`${nazov} — ${r.chyba}`);
      else interne.push(r.xml);
    } else prijate.push(faktura(d, m, nast, "    "));
  }

  const zoznam = (tag: string, polozky: string[]) =>
    polozky.length ? `\n  <${tag}>${polozky.join("")}\n  </${tag}>` : "";
  // Poradie zoznamov podľa `_Document.xsd`: FaktPrij, FaktVyd, IntDokl, PokDokl.
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<MoneyData ICAgendy="${esc(opts.firma?.ico ?? "")}" JazykVerze="SK" description="Doklady z Faktero">${zoznam(
    "SeznamFaktPrij",
    prijate,
  )}${zoznam("SeznamFaktVyd", vydane)}${zoznam("SeznamIntDokl", interne)}${zoznam("SeznamPokDokl", pokladna)}
</MoneyData>`;
  return { xml, preskocene };
}
