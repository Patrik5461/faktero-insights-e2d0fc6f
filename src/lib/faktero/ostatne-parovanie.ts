import { normMeno, normVs } from "./parovanie";
import { DRUHY_NA_UHRADU, type DruhOstatneho } from "./ostatne-doklady";
export { upravIban, upravVs } from "./ostatne-doklady";

/**
 * Párovanie iných dokladov (predpis poistného, platobný výmer, pokuta…)
 * s odchádzajúcimi pohybmi na účte.
 *
 * Pravidlá sú bližšie prijatej faktúre než bločku: doklad je záväzok, ktorý
 * firma platí sama, suma musí sedieť na cent a najsilnejší údaj je
 * **variabilný symbol** (Sociálna aj zdravotná poisťovňa a finančná správa
 * podľa neho platbu priraďujú). Druhý silný údaj je **IBAN**, na ktorý sa
 * platí — úrad má svoj účet a firma naň inak takmer neposiela.
 *
 * Rozdiel oproti faktúre je v čase: predpis býva doručený neskôr, než sa
 * zaplatí (dátum doručenia je často deň nahratia), preto okno nejde od
 * doručenia, ale okolo lehoty — 60 dní pred ňou až 120 dní po nej.
 *
 * Nič sa nepáruje samo. Aj istá dvojica je len návrh, potvrdzuje človek.
 */

export type PohybOstatneho = {
  id: string;
  booking_date: string;
  /** Záporná suma je odchádzajúca platba — len tá môže uhradiť predpis. */
  amount: number;
  currency: string | null;
  variable_symbol: string | null;
  counterparty: string | null;
  counterparty_iban?: string | null;
  description: string | null;
};

export type OstatnyNaUhradu = {
  id: string;
  kind: string | null;
  sender: string | null;
  subject?: string | null;
  amount: number | null;
  currency: string | null;
  due_date: string | null;
  received_date: string | null;
  variable_symbol: string | null;
  iban: string | null;
  paid_at?: string | null;
};

export type ZhodaOstatneho = {
  transactionId: string;
  otherDocumentId: string;
  skore: number;
  istota: "auto" | "navrh";
  dovody: string[];
};

/** Koľko dní pred lehotou a po nej sa platba hľadá. */
export const OKNO_PRED = 60;
export const OKNO_PO = 120;
/** Bez VS, IBAN-u aj odosielateľa sa ponúkne len platba takto blízko lehoty. */
const OKNO_LEN_SUMA = 7;

function zaokruhli(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function dni(neskorsi: string, skorsi: string): number | null {
  const a = Date.parse(neskorsi);
  const b = Date.parse(skorsi);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86400000);
}

export function normIban(v: string | null | undefined): string {
  return String(v ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

/** IBAN na zobrazenie po štyroch znakoch (v úzkom okne sa zalomí medzi skupinami). */
export function ibanNaZobrazenie(v: string | null | undefined): string | null {
  const i = normIban(v);
  return i ? i.replace(/(.{4})(?=.)/g, "$1 ") : null;
}

/** VS na úhradu — len číslice, bez úvodných núl (ako banka). Prázdny reťazec = nemáme. */
export function vsNaUhradu(v: string | null | undefined): string {
  return normVs(v);
}

/** Je doklad výzvou na úhradu, ku ktorej sa hľadá platba? */
export function jeNaUhradu(d: Pick<OstatnyNaUhradu, "kind" | "amount">): boolean {
  const suma = Number(d.amount ?? 0);
  return DRUHY_NA_UHRADU.includes(d.kind as DruhOstatneho) && Number.isFinite(suma) && suma > 0;
}

function menaSedi(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normMeno(a);
  const y = normMeno(b);
  if (!x || !y || x.length < 3 || y.length < 3) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/** Okno dátumov, v ktorom sa platba hľadá (pre dotaz do banky). */
export function oknoPlatby(d: Pick<OstatnyNaUhradu, "due_date" | "received_date">): {
  od: string;
  do: string;
} | null {
  const ref = d.due_date || d.received_date;
  if (!ref) return null;
  const t = Date.parse(ref);
  if (!Number.isFinite(t)) return null;
  const den = (n: number) => new Date(t + n * 86400000).toISOString().slice(0, 10);
  return { od: den(-OKNO_PRED), do: den(OKNO_PO) };
}

/**
 * Nakoľko pohyb sedí na iný doklad. `null` = spolu súvisieť nemôžu.
 */
export function ohodnotOstatny(
  p: PohybOstatneho,
  d: OstatnyNaUhradu,
): Omit<ZhodaOstatneho, "transactionId" | "otherDocumentId"> | null {
  if (!(p.amount < 0)) return null;
  if (!jeNaUhradu(d)) return null;
  if (d.paid_at) return null;
  if ((p.currency || "EUR").toUpperCase() !== (d.currency || "EUR").toUpperCase()) return null;
  if (Math.abs(zaokruhli(Math.abs(p.amount)) - zaokruhli(Number(d.amount))) >= 0.005) return null;

  const ref = d.due_date || d.received_date;
  if (!ref) return null;
  const odLehoty = dni(p.booking_date, ref);
  if (odLehoty === null || odLehoty < -OKNO_PRED || odLehoty > OKNO_PO) return null;

  const dovody: string[] = ["suma sedí na cent"];
  let skore = 0.4;
  let rozpoznany = false;

  const vsP = normVs(p.variable_symbol);
  const vsD = normVs(d.variable_symbol);
  if (vsP.length >= 3 && vsD.length >= 3 && vsP === vsD) {
    skore += 0.45;
    rozpoznany = true;
    dovody.push(`variabilný symbol ${p.variable_symbol} sedí na doklad`);
  }
  const ibP = normIban(p.counterparty_iban);
  const ibD = normIban(d.iban);
  if (ibP.length >= 15 && ibP === ibD) {
    skore += rozpoznany ? 0.1 : 0.35;
    rozpoznany = true;
    dovody.push("platba odišla na IBAN z dokladu");
  }
  if (!rozpoznany && (menaSedi(p.counterparty, d.sender) || menaSedi(p.description, d.sender))) {
    skore += 0.25;
    rozpoznany = true;
    dovody.push(`platba pre ${d.sender}`);
  }

  if (d.due_date) {
    const rozdiel = Math.abs(odLehoty);
    if (rozdiel <= 3) {
      skore += 0.15;
      dovody.push("zaplatené v lehote");
    } else if (odLehoty < 0) {
      skore += 0.1;
      dovody.push(`zaplatené ${rozdiel} dní pred lehotou`);
    } else {
      skore += 0.05;
      dovody.push(`zaplatené ${odLehoty} dní po lehote`);
    }
  }

  // Sama suma bez VS, IBAN-u a odosielateľa: len tesne pri lehote, inak by sa
  // ponúkali cudzie platby s náhodne rovnakou sumou.
  if (!rozpoznany && !(d.due_date && Math.abs(odLehoty) <= OKNO_LEN_SUMA)) return null;

  return {
    skore: zaokruhli(Math.min(skore, 1)),
    istota: rozpoznany && skore >= 0.8 ? "auto" : "navrh",
    dovody,
  };
}

/**
 * Pospája pohyby s dokladmi. Každý pohyb aj doklad najviac raz, najprv
 * najsilnejšie dvojice. Rovnako silná druhá možnosť na ten istý pohyb (dva
 * mesačné predpisy na rovnakú sumu) zhodí istotu — rozhodne človek.
 */
export function sparujOstatne(pohyby: PohybOstatneho[], doklady: OstatnyNaUhradu[]): ZhodaOstatneho[] {
  const vsetky: ZhodaOstatneho[] = [];
  for (const p of pohyby) {
    for (const d of doklady) {
      const h = ohodnotOstatny(p, d);
      if (h) vsetky.push({ transactionId: p.id, otherDocumentId: d.id, ...h });
    }
  }
  vsetky.sort((a, b) => b.skore - a.skore);

  const pouzitePohyby = new Set<string>();
  const pouziteDoklady = new Set<string>();
  const vybrane: ZhodaOstatneho[] = [];
  for (const z of vsetky) {
    if (pouzitePohyby.has(z.transactionId) || pouziteDoklady.has(z.otherDocumentId)) continue;
    const remiza = vsetky.some(
      (iny) =>
        iny !== z &&
        Math.abs(iny.skore - z.skore) < 0.005 &&
        ((iny.transactionId === z.transactionId &&
          iny.otherDocumentId !== z.otherDocumentId &&
          !pouziteDoklady.has(iny.otherDocumentId)) ||
          (iny.otherDocumentId === z.otherDocumentId &&
            iny.transactionId !== z.transactionId &&
            !pouzitePohyby.has(iny.transactionId))),
    );
    pouzitePohyby.add(z.transactionId);
    pouziteDoklady.add(z.otherDocumentId);
    vybrane.push(
      remiza
        ? { ...z, istota: "navrh", dovody: [...z.dovody, "rovnako dobre sedí aj iná dvojica"] }
        : z,
    );
  }
  return vybrane;
}

/**
 * Poradie pohybov na ručný výber k dokladu (alebo dokladov k pohybu): najprv
 * tie, ktoré by párovanie ponúklo, potom rovnaká suma, potom najbližšie
 * k lehote. Nič sa nevyhadzuje — človek môže vybrať aj inú sumu.
 */
export function poradieNaVyber(
  p: PohybOstatneho,
  d: OstatnyNaUhradu,
): number {
  const h = ohodnotOstatny(p, d);
  if (h) return 10 + h.skore;
  const rovnakaSuma =
    d.amount != null && Math.abs(zaokruhli(Math.abs(p.amount)) - zaokruhli(Number(d.amount))) < 0.005;
  const ref = d.due_date || d.received_date;
  const vzd = ref ? Math.abs(dni(p.booking_date, ref) ?? 999) : 999;
  return (rovnakaSuma ? 5 : 0) + 1 / (1 + vzd);
}
