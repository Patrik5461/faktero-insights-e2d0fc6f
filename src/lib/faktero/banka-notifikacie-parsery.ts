/**
 * Pravidlové čítanie notifikácií bánk, ktorých tvar mailu poznáme zo zdroja.
 *
 * Zdroj tvarov: open-source knižnica `tomaj/bank-mails-parser` (MIT),
 * https://github.com/tomaj/bank-mails-parser — fixtures v `tests/fixtures/`
 * (skutočné maily s anonymizovanými účtami), a produkčné filtre odosielateľov
 * Denníka N v `remp2020/crm-payments-module`
 * (https://github.com/remp2020/crm-payments-module, `src/Commands/*MailConfirmationCommand.php`).
 *
 * - Tatra banka (b-mail, `b-mail@tatrabanka.sk`, predmet „Kredit na ucte"),
 * - ČSOB SK (ČSOB Info 24 – Avízo, `AdminTBS@csob.sk`),
 * - ČSOB CZ (CEB Info / ČSOB Info, `notification@csob.cz`, „CEB Info: Zaúčtování platby").
 *
 * Ostatné banky (VÚB, SLSP, Fio, ČS, KB, RB, Air Bank, Moneta, UniCredit,
 * mBank, Prima, 365.bank, Poštová banka, Revolut) doslovný tvar mailu
 * nezverejňujú — tie číta AI (`banka-notifikacie-ai.ts`). Keď príde prvý
 * skutočný mail, pravidlo sa dá doplniť sem.
 *
 * Polia sa berú len zo začiatku riadku („Částka: …"), nie odkiaľkoľvek z
 * textu — inak by platiteľ správou pre príjemcu „Částka: 999" prepísal sumu.
 */
import {
  citajDatum,
  citajSumu,
  citajSumuSoZnamienkom,
  ibanPlatny,
  normIban,
  normMena,
  PRAZDNA_NOTIFIKACIA,
  symbol,
  textPola,
  type Notifikacia,
} from "./banka-notifikacie";

export type VstupPravidla = { predmet: string | null; text: string };

/** Bez diakritiky a malými — banky píšu raz s ňou, raz bez (TB b-mail je bez). */
function bezDiakritiky(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Text na čítanie: jednotné konce riadkov, bez pevných medzier a U+2028. */
function upravText(t: string): string {
  return t.replace(/\r\n?|\u2028|\u2029/g, "\n").replace(/[\u00a0\u202f]/g, " ");
}

/**
 * Hodnota poľa, ktoré začína riadok: „  Variabilní symbol:   123". Menovka sa
 * porovnáva bez diakritiky a veľkosti písmen. Prvý výskyt vyhráva.
 */
export function pole(blok: string, menovky: string[]): string | null {
  const riadky = blok.split("\n");
  const ciele = menovky.map((m) => bezDiakritiky(m).toLowerCase());
  for (const r of riadky) {
    const holy = bezDiakritiky(r).toLowerCase().trimStart();
    for (const c of ciele) {
      if (!holy.startsWith(c)) continue;
      const zvysok = holy.slice(c.length);
      const m = zvysok.match(/^\s*:\s*/);
      if (!m) continue;
      // Hodnota z pôvodného riadku (s diakritikou) — rovnaká dĺžka po NFD neplatí,
      // preto sa hľadá dvojbodka v pôvodnom texte.
      const povodny = r.trimStart();
      const dvojbodka = povodny.indexOf(":");
      const hodnota = povodny.slice(dvojbodka + 1).trim();
      return hodnota || null;
    }
  }
  return null;
}

/** Symboly z „/VS1234/SS56/KS0308" (referencia platiteľa). */
function symbolyZReferencie(s: string | null): {
  vs: string | null;
  ss: string | null;
  ks: string | null;
} {
  const t = String(s ?? "");
  return {
    vs: symbol(t.match(/\/VS(\d{1,10})/i)?.[1]),
    ss: symbol(t.match(/\/SS(\d{1,10})/i)?.[1]),
    ks: symbol(t.match(/\/KS(\d{1,10})/i)?.[1]),
  };
}

/** VS v texte správy: „VS123", „VS: 123", „(Ref)123(/Ref)" (SEPA štruktúrovaná referencia). */
function vsZoSpravy(s: string | null): string | null {
  const t = String(s ?? "");
  return (
    symbol(t.match(/\(Ref\)\s*(\d{1,10})\s*\(\/Ref\)/i)?.[1]) ??
    symbol(t.match(/\bVS\s*:?\s*(\d{1,10})\b/i)?.[1])
  );
}

/** Suma s menou z „+1 234,56 CZK" / „1 243,29 USD". */
function sumaAMena(s: string | null): {
  suma: number | null;
  mena: string | null;
  znamienko: "+" | "-" | null;
} {
  const t = String(s ?? "").trim();
  const m = t.match(/^([+\-\u2212]?)\s*([\d][\d\s.,]*)\s*([A-Za-z]{3}|€|Kč)\.?/);
  if (!m) return { suma: null, mena: null, znamienko: null };
  return {
    suma: citajSumu(m[2]),
    mena: normMena(m[3]),
    znamienko: m[1] === "+" ? "+" : m[1] ? "-" : null,
  };
}

/** Riadky 1:1 ako v maile bez prázdnych okrajov — na `sprava`. */
function spoj(...casti: (string | null | undefined)[]): string | null {
  return textPola(casti.filter((c) => c && c.trim()).join(" · "), 300);
}

/* ---------------- Tatra banka (b-mail) ---------------- */

/*
  Vzor (tomaj/bank-mails-parser, tests/fixtures/tatrabanka/notifikacia.txt):
    16.1.2015 12:51 bol zostatok Vasho uctu SK9812353347235 zvyseny o 12,31 EUR.
    aktualny zostatok:                           142,11 EUR
    Popis transakcie: CCINT 1100/000000-261426464
    Referencia platitela: /VS1234056789/SS/KS
    Informacia pre prijemcu: test-sprava
  Debet: „… znizeny o 1 243,29 USD."
*/
export function citajTatrabanku(v: VstupPravidla): Notifikacia[] | null {
  const text = upravText(v.text);
  const holy = bezDiakritiky(text);
  const m = holy.match(
    /(\d{1,2}\.\d{1,2}\.\d{4})(?:\s+\d{1,2}:\d{2})?\s+bol\s+zostatok\s+vasho\s+uctu\s+([A-Za-z0-9 ]+?)\s+(zvyseny|znizeny)\s+o\s+([\d][\d .,]*?)\s*([A-Za-z]{3})\b/i,
  );
  if (!m) return null;
  const referencia = pole(text, ["Referencia platitela"]);
  const info = pole(text, ["Informacia pre prijemcu", "Informácia pre príjemcu"]);
  const popis = pole(text, ["Popis transakcie"]);
  const sym = symbolyZReferencie(referencia);
  // Referencia bez lomiek je pri SEPA meno/odkaz platiteľa, nie symboly.
  const refText = referencia && !referencia.startsWith("/") ? referencia : null;
  const zost = pole(text, ["aktualny zostatok", "aktuálny zostatok"]);
  const zostatokSuma = zost ? sumaAMena(zost) : null;
  return [
    {
      ...PRAZDNA_NOTIFIKACIA,
      jePohyb: true,
      smer: m[3]!.toLowerCase() === "zvyseny" ? "kredit" : "debet",
      suma: citajSumu(m[4]),
      mena: normMena(m[5]),
      datum: citajDatum(m[1]),
      vs: sym.vs ?? vsZoSpravy(info) ?? vsZoSpravy(refText),
      ks: sym.ks,
      ss: sym.ss,
      sprava: spoj(info && !/^\(CdtrRefInf\)/i.test(info) ? info : null, refText, popis),
      ibanUctu: m[2]!.replace(/\s+/g, "").toUpperCase(),
      // Zostatok len v mene pohybu — pri platbe v USD je zostatok účtu v EUR.
      zostatok:
        zostatokSuma && zostatokSuma.mena === normMena(m[5])
          ? citajSumuSoZnamienkom(zost!.replace(/[A-Za-z€]+.*$/, ""))
          : null,
    },
  ];
}

/* ---------------- ČSOB SK (ČSOB Info 24 – Avízo) ---------------- */

/*
  Vzor (tomaj/bank-mails-parser, tests/fixtures/csob-sk/sepa-platba.txt):
    dovoľujeme si Vám oznámiť, že dňa 6.9.2019 bola na účte SK13 7500 0000 0040 1942 5381 PETIT PRESS, A.S. zaúčtovaná suma SEPA platobného príkazu:
    suma:                    +1150,00 EUR
    z účtu:                  SK91 7500 0000 0030 2072 9058
    názov protiúčtu:         NOVAK JOZEF
    referencia platiteľa:    /VS212049000/SS964/KS0308
    informácia pre príjemcu: Maroko 2019 rodicia
    Zostatok na účte po zaúčtovaní sumy platobnej operácie: +14050,70 EUR
  V jednom maile môže byť viac pohybov (viac-transakcii.txt).
*/
const ZACIATOK_CSOB_SK = /(?=d[nň]a\s+\d{1,2}\.\d{1,2}\.\d{4}\s+bola\s+na\s+[uú][cč]te)/i;

export function citajCsobSk(v: VstupPravidla): Notifikacia[] | null {
  const text = upravText(v.text);
  const bloky = text.split(ZACIATOK_CSOB_SK);
  const out: Notifikacia[] = [];
  for (const blok of bloky) {
    const hlava = blok.match(
      /^[dD][nň]a\s+(\d{1,2}\.\d{1,2}\.\d{4})\s+bola\s+na\s+[uú][cč]te\s+([A-Z]{2}\d{2}(?:\s?\d{4}){1,7}(?:\s?\d{1,4})?)(?!\d)/,
    );
    if (!hlava) continue;
    const s = sumaAMena(pole(blok, ["suma"]));
    if (s.suma == null || !s.znamienko) continue;
    const protiucet = pole(blok, ["z účtu", "na účet", "protiúčet"]);
    const sym = symbolyZReferencie(pole(blok, ["referencia platiteľa"]));
    const info = pole(blok, ["informácia pre príjemcu"]);
    const zost = blok.match(
      /Zostatok na [uú][cč]te po za[uú][cč]tovan[ií] sumy platobnej oper[aá]cie:\s*([+\-\u2212]?\s*[\d][\d\s.,]*)/i,
    );
    out.push({
      ...PRAZDNA_NOTIFIKACIA,
      jePohyb: true,
      smer: s.znamienko === "+" ? "kredit" : "debet",
      suma: s.suma,
      mena: s.mena,
      datum: citajDatum(hlava[1]),
      vs: sym.vs ?? vsZoSpravy(info),
      ks: sym.ks,
      ss: sym.ss,
      sprava: textPola(info, 300),
      protistrana: textPola(pole(blok, ["názov protiúčtu"]), 120),
      protistranaIban: protiucet ? normIban(protiucet) : null,
      ibanUctu: normIban(hlava[2]),
      zostatok: zost ? citajSumuSoZnamienkom(zost[1]!.trim()) : null,
    });
  }
  return out.length ? out : null;
}

/* ---------------- ČSOB CZ (CEB Info / ČSOB Info) ---------------- */

/*
  Vzor (tomaj/bank-mails-parser, tests/fixtures/csob-cz/dosla-platba.txt):
    Dne 25.9.2018 byla na účtu 123456789 zaúčtovaná transakce typu: Došlá platba.
    Účet: 123456789, CZK, CRM INTERNATION
    Částka: +1 234,56 CZK
    Účet protistrany: 1122334455/9999
    Název protistrany: Capi Hnizdo a.s.
    Variabilní symbol: 23456789
    Konstantní symbol: 3456
    Zůstatek na účtu po zaúčtování transakce: +1 234 567,89 CZK.
  Ďalej „Příchozí úhrada", „Příchozí úhrada okamžitá" (VS aj v „Zpráva
  příjemci: VS…"), „transakce platební kartou", „SEPA převod" (Identifikace,
  Účel platby). Viac pohybov v jednom maile.
*/
const ZACIATOK_CSOB_CZ = /(?=Dne\s+\d{1,2}\.\d{1,2}\.\d{4}\s+byl[ao]?\s+na\s+[uú][cč]tu)/i;

export function citajCsobCz(v: VstupPravidla): Notifikacia[] | null {
  const text = upravText(v.text);
  const bloky = text.split(ZACIATOK_CSOB_CZ);
  const out: Notifikacia[] = [];
  for (const blok of bloky) {
    const hlava = blok.match(
      /^Dne\s+(\d{1,2}\.\d{1,2}\.\d{4})\s+byl[ao]?\s+na\s+[uú][cč]tu\s+([\d\-/]+)/i,
    );
    if (!hlava) continue;
    const s = sumaAMena(pole(blok, ["Částka"]));
    if (s.suma == null || !s.znamienko) continue;
    const zprava = pole(blok, ["Zpráva příjemci", "Zpráva pro příjemce"]);
    const ucel = pole(blok, ["Účel platby"]);
    const vs =
      symbol(pole(blok, ["Variabilní symbol"])) ??
      vsZoSpravy(zprava) ??
      symbol(pole(blok, ["Identifikace"])?.match(/^\d{1,10}$/)?.[0]);
    const protiucet = pole(blok, ["Účet protistrany", "Z účtu", "Na účet"]);
    const zost = blok.match(
      /Z[uů]statek na [uú][cč]tu po za[uú][cč]tov[aá]n[ií] transakce:\s*([+\-\u2212]?\s*[\d][\d\s.,]*)/i,
    );
    out.push({
      ...PRAZDNA_NOTIFIKACIA,
      jePohyb: true,
      smer: s.znamienko === "+" ? "kredit" : "debet",
      suma: s.suma,
      mena: s.mena,
      datum: citajDatum(hlava[1]),
      vs,
      ks: symbol(pole(blok, ["Konstantní symbol"])),
      ss: symbol(pole(blok, ["Specifický symbol"])),
      sprava: spoj(zprava, ucel),
      protistrana: textPola(pole(blok, ["Název protistrany"]), 120),
      protistranaIban: protiucet && /\d/.test(protiucet) ? normIban(protiucet) : null,
      ibanUctu: hlava[2]!,
      zostatok: zost ? citajSumuSoZnamienkom(zost[1]!.replace(/\.$/, "").trim()) : null,
      referencia: textPola(pole(blok, ["Číslo transakce ČSOB"]), 80),
    });
  }
  return out.length ? out : null;
}

/* ---------------- Výber pravidla ---------------- */

const PRAVIDLA: Record<string, (v: VstupPravidla) => Notifikacia[] | null> = {
  tatrabanka: citajTatrabanku,
  csob_sk: citajCsobSk,
  csob_cz: citajCsobCz,
};

/** Banky, ktoré majú pravidlové čítanie. */
export const BANKY_S_PRAVIDLOM = Object.keys(PRAVIDLA);

/**
 * Prečíta mail pravidlom vybranej banky. Keď banka pravidlo nemá alebo naň
 * mail nesedí, `null` — vtedy ide na rad AI.
 */
export function citajPravidlom(kodBanky: string | null, v: VstupPravidla): Notifikacia[] | null {
  const pravidlo = kodBanky ? PRAVIDLA[kodBanky] : null;
  if (!pravidlo) return null;
  const r = pravidlo(v);
  if (!r || !r.length) return null;
  return r.map((n) => ({
    ...n,
    protistranaIban:
      n.protistranaIban && ibanPlatny(n.protistranaIban)
        ? normIban(n.protistranaIban)
        : n.protistranaIban,
  }));
}
