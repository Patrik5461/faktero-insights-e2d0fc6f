/**
 * Upomienky nemeckej firmy — po nemecky a podľa § 286 a § 288 BGB.
 *
 * Čo z toho vyplýva pre text:
 *  - **Verzug** (omeškanie) nevzniká samotnou splatnosťou na faktúre —
 *    jednostranne určený dátum „zahlbar bis“ podľa BGH nestačí na § 286 Abs. 2
 *    Nr. 1 BGB. Dlžník je v omeškaní po upomienke (Mahnung, § 286 Abs. 1),
 *    alebo bez nej 30 dní po splatnosti a doručení faktúry (§ 286 Abs. 3) —
 *    spotrebiteľ však len vtedy, keď ho na to faktúra upozornila, a to
 *    faktúry z Faktera nerobia. Preto: od 1. upomienky (prvá odoslaná) sa
 *    počíta omeškanie od nasledujúceho dňa; bez nej pri podnikateľovi
 *    od 31. dňa po splatnosti, pri spotrebiteľovi žiadne.
 *  - **Úroky z omeškania** (§ 288 BGB): spotrebiteľ základná sadzba + 5
 *    percentuálnych bodov (Abs. 1), podnikateľ + 9 bodov (Abs. 2). Základná
 *    sadzba (Basiszinssatz, § 247 BGB) sa mení 1. 1. a 1. 7. — vyhlasuje ju
 *    Deutsche Bundesbank. Úrok sa počíta po dňoch (deň / 365) a po polrokoch,
 *    lebo každý polrok môže mať inú sadzbu.
 *  - **Paušál 40 €** (§ 288 Abs. 5 BGB) — len keď dlžník nie je spotrebiteľ.
 *
 * Podnikateľ = odberateľ s IČO, Steuernummer alebo USt-IdNr. na faktúre.
 * Spotrebiteľa s nimi ľahko nespoznať (živnostník bez USt-IdNr. má aspoň
 * Steuernummer), preto je to zjednodušenie — upomienku si človek pred
 * odoslaním pozrie.
 */

import { datumNaDoklade } from "./faktura-jazyk";
import { formatujCislo, formatujMenu } from "./mena";

/**
 * Basiszinssatz podľa § 247 BGB (Deutsche Bundesbank), platný od dátumu.
 *
 * Hodnoty do 1. 7. 2025 sú vyhlásené (Bundesbank). K 1. 1. 2026 ostala sadzba
 * 1,27 % (referenčná sadzba ECB sa v 2. polroku 2025 nemenila) — OVERIŤ.
 * Sadzbu k 1. 7. 2026 treba doplniť z bundesbank.de („Basiszinssatz“) —
 * kým tu nie je, počíta sa ďalej s poslednou známou hodnotou.
 */
export const BASISZINSSATZ: { od: string; sadzba: number }[] = [
  { od: "2023-01-01", sadzba: 1.62 },
  { od: "2023-07-01", sadzba: 3.12 },
  { od: "2024-01-01", sadzba: 3.62 },
  { od: "2024-07-01", sadzba: 3.37 },
  { od: "2025-01-01", sadzba: 2.27 },
  { od: "2025-07-01", sadzba: 1.27 },
  // OVERIŤ na bundesbank.de — posledná známa hodnota pre 1. polrok 2026.
  { od: "2026-01-01", sadzba: 1.27 },
];

/** Paušál za omeškanie pri podnikateľovi (§ 288 Abs. 5 BGB). */
export const VERZUGSPAUSCHALE_EUR = 40;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function denPlus(datum: string, dni: number): string {
  const d = new Date(`${datum.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dni);
  return d.toISOString().slice(0, 10);
}

function dniMedzi(od: string, do_: string): number {
  return Math.round(
    (new Date(`${do_}T00:00:00Z`).getTime() - new Date(`${od}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

/** Základná sadzba platná v daný deň (pred prvým záznamom prvý záznam). */
export function basiszinssatz(datum: string): number {
  let s = BASISZINSSATZ[0].sadzba;
  for (const z of BASISZINSSATZ) if (z.od <= datum) s = z.sadzba;
  return s;
}

/** Sadzba úrokov z omeškania: základná + 9 bodov (podnikateľ) alebo + 5 (spotrebiteľ). */
export function sadzbaVerzug(datum: string, b2b: boolean): number {
  return r2(basiszinssatz(datum) + (b2b ? 9 : 5));
}

/**
 * Úroky z omeškania od `od` (prvý deň omeškania, vrátane) do `do_` (vrátane),
 * po úsekoch s rovnakou základnou sadzbou. Deň / 365.
 */
export function urokyZOmeskania(suma: number, od: string, do_: string, b2b: boolean): number {
  if (!(suma > 0) || !od || !do_ || do_ < od) return 0;
  const hranice = BASISZINSSATZ.map((z) => z.od).filter((d) => d > od && d <= do_);
  const body = [od, ...hranice, denPlus(do_, 1)];
  let spolu = 0;
  for (let i = 0; i < body.length - 1; i++) {
    const dni = dniMedzi(body[i], body[i + 1]);
    spolu += (suma * sadzbaVerzug(body[i], b2b) * dni) / 100 / 365;
  }
  return r2(spolu);
}

/** Je odberateľ podnikateľ (B2B)? IČO, Steuernummer alebo USt-IdNr. na faktúre. */
export function jePodnikatel(inv: {
  customer_ico?: string | null;
  customer_dic?: string | null;
  customer_ic_dph?: string | null;
}): boolean {
  return [inv.customer_ico, inv.customer_dic, inv.customer_ic_dph].some((x) =>
    String(x ?? "").trim(),
  );
}

/**
 * Prvý deň omeškania. Po prvej odoslanej upomienke nasledujúci deň (§ 286
 * Abs. 1 BGB), inak pri podnikateľovi 31. deň po splatnosti (§ 286 Abs. 3 —
 * doručenie faktúry sa predpokladá najneskôr v deň splatnosti). Spotrebiteľ
 * bez upomienky v omeškaní nie je → `null`.
 */
export function zaciatokOmeskania(vstup: {
  splatnost?: string | null;
  prvaUpomienka?: string | null;
  b2b: boolean;
}): string | null {
  const kandidati: string[] = [];
  if (vstup.prvaUpomienka) kandidati.push(denPlus(vstup.prvaUpomienka.slice(0, 10), 1));
  if (vstup.b2b && vstup.splatnost) kandidati.push(denPlus(vstup.splatnost.slice(0, 10), 31));
  if (!kandidati.length) return null;
  return kandidati.sort()[0];
}

export type OmeskanieDe = {
  b2b: boolean;
  od: string | null;
  sadzba: number;
  basis: number;
  uroky: number;
  pausal: number;
};

export function omeskanieDe(vstup: {
  suma: number;
  splatnost?: string | null;
  prvaUpomienka?: string | null;
  b2b: boolean;
  dnes: string;
}): OmeskanieDe {
  const od = zaciatokOmeskania(vstup);
  const plati = od != null && od <= vstup.dnes;
  return {
    b2b: vstup.b2b,
    od: plati ? od : null,
    sadzba: sadzbaVerzug(vstup.dnes, vstup.b2b),
    basis: basiszinssatz(vstup.dnes),
    uroky: plati ? urokyZOmeskania(vstup.suma, od!, vstup.dnes, vstup.b2b) : 0,
    pausal: plati && vstup.b2b ? VERZUGSPAUSCHALE_EUR : 0,
  };
}

const PREDMET: Record<1 | 2 | 3, string> = {
  1: "Zahlungserinnerung: Rechnung {cislo}",
  2: "Mahnung: Rechnung {cislo}",
  3: "Letzte Mahnung: Rechnung {cislo}",
};

/**
 * Predmet a text upomienky po nemecky. 1. upomienka je zdvorilá pripomienka
 * bez úrokov (ona sama omeškanie zakladá); 2. a 3. vyčíslia úroky a pri
 * podnikateľovi paušál, keď už omeškanie trvá.
 */
export function upomienkaDe(vstup: {
  cislo: number;
  invoice: {
    invoice_number?: string | null;
    total?: unknown;
    currency?: string | null;
    due_date?: string | null;
  };
  firma: string;
  omeskanie: OmeskanieDe;
}): { predmet: string; text: string } {
  const n = vstup.cislo as 1 | 2 | 3;
  const inv = vstup.invoice;
  const mena = inv.currency ?? "EUR";
  const cislo = String(inv.invoice_number ?? "");
  const suma = Number(inv.total ?? 0);
  const eur = (x: number) => formatujMenu(x, mena, "de-DE");
  const splatna = inv.due_date ? datumNaDoklade(inv.due_date, "de") : "";
  const pct = (x: number) => formatujCislo(x, 2, 2, "de-DE");
  const o = vstup.omeskanie;

  const odsek: string[] = [];
  if (n === 1) {
    odsek.push(
      `sicher ist es Ihrer Aufmerksamkeit entgangen: Unsere Rechnung ${cislo} über ${eur(suma)} war am ${splatna} fällig und ist bei uns noch nicht eingegangen.`,
      "Bitte überweisen Sie den Betrag innerhalb der nächsten 7 Tage. Sollten Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.",
    );
  } else {
    odsek.push(
      n === 2
        ? `trotz unserer Zahlungserinnerung ist die Rechnung ${cislo} über ${eur(suma)}, fällig am ${splatna}, noch nicht beglichen.`
        : `die Rechnung ${cislo} über ${eur(suma)}, fällig am ${splatna}, ist trotz unserer Mahnungen weiterhin offen.`,
    );
    if (o.od) {
      const zaklad = o.b2b ? "9" : "5";
      const casti = [
        `Seit dem ${datumNaDoklade(o.od, "de")} befinden Sie sich in Zahlungsverzug (§ 286 BGB). Gemäß § 288 BGB berechnen wir Verzugszinsen von ${pct(o.sadzba)} % p. a. (${zaklad} Prozentpunkte über dem Basiszinssatz von ${pct(o.basis)} %), bis heute ${eur(o.uroky)}.`,
      ];
      if (o.pausal)
        casti.push(
          `Zusätzlich steht uns die Verzugspauschale von ${eur(o.pausal)} zu (§ 288 Abs. 5 BGB).`,
        );
      odsek.push(casti.join(" "));
      odsek.push(
        `Bitte überweisen Sie den offenen Betrag von insgesamt ${eur(r2(suma + o.uroky + o.pausal))} innerhalb von 7 Tagen.`,
      );
    } else {
      odsek.push("Bitte überweisen Sie den Betrag innerhalb von 7 Tagen.");
    }
    if (n === 3)
      odsek.push(
        "Sollte die Zahlung nicht fristgerecht eingehen, werden wir die Forderung ohne weitere Ankündigung gerichtlich geltend machen bzw. einem Inkassounternehmen übergeben.",
      );
    odsek.push(
      "Sollten Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.",
    );
  }

  return {
    predmet: PREDMET[n].replace("{cislo}", cislo),
    text: [
      "Sehr geehrte Damen und Herren,",
      ...odsek,
      `Mit freundlichen Grüßen\n${vstup.firma}`,
    ].join("\n\n"),
  };
}
