/*
  Nastavenia exportu do účtovníctva a nastavenia banky firmy.

  Ukladajú sa v `companies.uctovanie_nastavenia` pod kľúčmi `export` a `banka`
  (nový stĺpec netreba a kopírovanie nastavení do iných firiem ich prenesie
  samo). Predvolená hodnota každej voľby je presne to, ako sa Faktero správalo
  doteraz — firma, ktorá nič nenastaví, dostane ten istý súbor ako predtým.

  Čisté funkcie bez databázy; čítajú ich exporty (`export.server.ts`),
  párovanie s bankou, sťahovanie pohybov aj hromadný príkaz.
*/

/** Ktorý dátum ide do „Dátumu zápisu" prijatého dokladu (Pohoda `date`). */
export type DatumZapisu = "vyhotovenie" | "dodanie" | "dorucenie";
/**
 * Ktorý dátum ide do „Dátumu odpočtu" prijatého dokladu (Pohoda `dateTax`).
 * `neskorsi` = neskorší z dátumu dodania a doručenia — podľa § 51 zákona
 * o DPH sa odpočet dá uplatniť najskôr v období, keď platiteľ faktúru má.
 */
export type DatumOdpoctu = "dodanie" | "zauctovanie" | "dorucenie" | "neskorsi";
/** Text prijatého dokladu (Pohoda `text`). */
export type TextPrijateho = "auto" | "polozka" | "poznamka" | "dodavatel_cislo";
/** Text vystavenej faktúry (Pohoda `text`). */
export type TextVystavenej = "auto" | "poznamka" | "odberatel_cislo" | "cislo";
/** Interná poznámka prijatého dokladu a bločku (Pohoda `intNote`). */
export type InternaPoznamka = "interna" | "poznamka" | "interna_poznamka" | "dodavatel_cislo";
/** Partner dokladu a adresár účtovného programu. */
export type PartneriExportu = "nepridavat" | "parovat";
/** Agenda daňového dokladu k prijatej platbe. */
export type DokladKPlatbe = "interne" | "vydane";
/** Názov vygenerovaných položiek odpočtu uhradenej zálohy. */
export type NazovOdpoctu = "doklad" | "sadzba" | "doklad_sadzba";

export type NastaveniaExportu = {
  datumZapisu: DatumZapisu;
  datumOdpoctu: DatumOdpoctu;
  textPrijate: TextPrijateho;
  textVystavene: TextVystavenej;
  intPoznamkaPrijate: InternaPoznamka;
  intPoznamkaBlocky: InternaPoznamka;
  partneri: PartneriExportu;
  dokladKPlatbe: DokladKPlatbe;
  /** Doklad bez iných položiek dostane položky z rozpisu DPH (po jednej na sadzbu). */
  polozkyZRozpisu: boolean;
  nazovOdpoctu: NazovOdpoctu;
};

export const PREDVOLENE_EXPORTU: NastaveniaExportu = {
  datumZapisu: "vyhotovenie",
  datumOdpoctu: "dodanie",
  textPrijate: "auto",
  textVystavene: "auto",
  intPoznamkaPrijate: "interna",
  intPoznamkaBlocky: "interna",
  partneri: "nepridavat",
  dokladKPlatbe: "interne",
  polozkyZRozpisu: false,
  nazovOdpoctu: "doklad",
};

/** Povolené hodnoty každej voľby — aj pre validáciu pri ukladaní. */
export const MOZNOSTI_EXPORTU = {
  datumZapisu: ["vyhotovenie", "dodanie", "dorucenie"],
  datumOdpoctu: ["dodanie", "zauctovanie", "dorucenie", "neskorsi"],
  textPrijate: ["auto", "polozka", "poznamka", "dodavatel_cislo"],
  textVystavene: ["auto", "poznamka", "odberatel_cislo", "cislo"],
  intPoznamkaPrijate: ["interna", "poznamka", "interna_poznamka", "dodavatel_cislo"],
  intPoznamkaBlocky: ["interna", "poznamka", "interna_poznamka", "dodavatel_cislo"],
  partneri: ["nepridavat", "parovat"],
  dokladKPlatbe: ["interne", "vydane"],
  nazovOdpoctu: ["doklad", "sadzba", "doklad_sadzba"],
} as const satisfies Record<Exclude<keyof NastaveniaExportu, "polozkyZRozpisu">, readonly string[]>;

const jeden = <T extends string>(v: unknown, povolene: readonly T[], predvolene: T): T =>
  povolene.includes(v as T) ? (v as T) : predvolene;

/**
 * Nastavenia exportu z `uctovanie_nastavenia` firmy (celý JSON alebo už
 * vybraný kľúč `export`). Neznáma či chýbajúca hodnota = predvolená.
 */
export function nastaveniaExportu(v: unknown): NastaveniaExportu {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const x = (o.export && typeof o.export === "object" ? o.export : o) as Record<string, unknown>;
  const p = PREDVOLENE_EXPORTU;
  const m = MOZNOSTI_EXPORTU;
  return {
    datumZapisu: jeden(x.datumZapisu, m.datumZapisu, p.datumZapisu),
    datumOdpoctu: jeden(x.datumOdpoctu, m.datumOdpoctu, p.datumOdpoctu),
    textPrijate: jeden(x.textPrijate, m.textPrijate, p.textPrijate),
    textVystavene: jeden(x.textVystavene, m.textVystavene, p.textVystavene),
    intPoznamkaPrijate: jeden(x.intPoznamkaPrijate, m.intPoznamkaPrijate, p.intPoznamkaPrijate),
    intPoznamkaBlocky: jeden(x.intPoznamkaBlocky, m.intPoznamkaBlocky, p.intPoznamkaBlocky),
    partneri: jeden(x.partneri, m.partneri, p.partneri),
    dokladKPlatbe: jeden(x.dokladKPlatbe, m.dokladKPlatbe, p.dokladKPlatbe),
    polozkyZRozpisu: typeof x.polozkyZRozpisu === "boolean" ? x.polozkyZRozpisu : p.polozkyZRozpisu,
    nazovOdpoctu: jeden(x.nazovOdpoctu, m.nazovOdpoctu, p.nazovOdpoctu),
  };
}

const den = (v: unknown): string => {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};

/**
 * Dátumy prijatého dokladu podľa nastavenia.
 *
 * - `vystavenie` — dátum na doklade (`issue_date`),
 * - `dodanie` — dátum dodania; bez neho dátum vystavenia (ako doteraz),
 * - `dorucenie` — kedy doklad do firmy prišiel (`received_date`, pri bločku
 *   dátum uloženia); bez neho dátum vystavenia,
 * - `zauctovanie` — dátum zaúčtovania z exportu (uzávierka či pevný dátum),
 *   bez neho dátum zápisu.
 */
export function datumyPrijateho(
  d: { vystavenie: unknown; dodanie: unknown; dorucenie: unknown; zauctovanie?: unknown },
  n: Pick<NastaveniaExportu, "datumZapisu" | "datumOdpoctu">,
): { zapis: string; odpocet: string } {
  const vystavenie = den(d.vystavenie);
  const dodanie = den(d.dodanie) || vystavenie;
  const dorucenie = den(d.dorucenie) || vystavenie;
  const zapis =
    n.datumZapisu === "dodanie" ? dodanie : n.datumZapisu === "dorucenie" ? dorucenie : vystavenie;
  const odpocet =
    n.datumOdpoctu === "dorucenie"
      ? dorucenie
      : n.datumOdpoctu === "zauctovanie"
        ? den(d.zauctovanie) || zapis
        : n.datumOdpoctu === "neskorsi"
          ? ([dodanie, dorucenie].filter(Boolean).sort().at(-1) ?? "")
          : dodanie;
  return { zapis, odpocet };
}

/**
 * Nápoveda k zákonnosti voľby dátumu odpočtu (§ 51 ods. 1 zákona o DPH:
 * odpočet najskôr v období, v ktorom platiteľ faktúru má). `null` = v poriadku.
 */
export function upozornenieOdpoctu(
  n: Pick<NastaveniaExportu, "datumOdpoctu" | "datumZapisu">,
): string | null {
  if (n.datumOdpoctu === "dodanie")
    return "Keď faktúra príde až v neskoršom mesiaci než dodanie, odpočet DPH patrí až do obdobia doručenia — taký doklad v účtovnom programe skontrolujte, alebo zvoľte „neskorší z dátumu dodania a doručenia“.";
  if (n.datumOdpoctu === "zauctovanie")
    return "Dátum zaúčtovania nesmie byť skorší než doručenie faktúry — inak by sa DPH odpočítala skôr, než to zákon dovoľuje.";
  return null;
}

/** Text, ktorý sa skladá z partnera a čísla dokladu. */
export function partnerACislo(partner: unknown, cislo: unknown): string {
  return [
    String(partner ?? "").trim(),
    String(cislo ?? "").trim() ? `č. ${String(cislo).trim()}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Interná poznámka prijatého dokladu podľa nastavenia. */
export function internaPoznamka(
  d: { int_poznamka?: unknown; note?: unknown; supplier_name?: unknown; document_number?: unknown },
  format: InternaPoznamka,
): string {
  const interna = String(d.int_poznamka ?? "").trim();
  const poznamka = String(d.note ?? "").trim();
  if (format === "poznamka") return poznamka;
  if (format === "interna_poznamka") return [interna, poznamka].filter(Boolean).join(" · ");
  if (format === "dodavatel_cislo") return partnerACislo(d.supplier_name, d.document_number);
  return interna;
}

/**
 * Názov vygenerovanej položky odpočtu zálohy.
 * `doklad` — „Odpočet zálohy DD123 (k ZF5)" (ako doteraz), `sadzba` —
 * „Odpočet zálohy 23 %", `doklad_sadzba` — oboje.
 */
export function nazovPolozkyOdpoctu(
  doklad: string,
  sadzba: number | null | undefined,
  format: NazovOdpoctu,
): string {
  const s = sadzba == null || !Number.isFinite(Number(sadzba)) ? "" : `${Number(sadzba)} %`;
  if (format === "sadzba" && s) return `Odpočet zálohy ${s}`;
  if (format === "doklad_sadzba" && s) return `${doklad}${doklad ? " " : ""}${s}`.trim();
  return doklad;
}

/* ------------------------------------------------------------------ banka */

/** Čo ide v hromadnom príkaze do správy pre príjemcu. */
export type TextPrijemcu = "cislo" | "len_cislo" | "vs" | "poznamka";

export type NastaveniaBanky = {
  /**
   * Bloček sa s pohybom páruje bez ohľadu na spôsob platby (ako doteraz).
   * Vypnuté = bloček platený kartou len s platbou kartou, prevod len s
   * pohybom, ktorý platbou kartou nie je.
   */
  ignorovatTypPlatby: boolean;
  /** Pohyby staršie než tento dátum sa zo sťahovania z banky neukladajú. */
  synchronizovatOd: string | null;
  /** Automatické párovanie (nočné aj tlačidlom) nesiaha na pohyby pred týmto dátumom. */
  autoParovanieOd: string | null;
  textPrijemcu: TextPrijemcu;
};

export const PREDVOLENE_BANKY: NastaveniaBanky = {
  ignorovatTypPlatby: true,
  synchronizovatOd: null,
  autoParovanieOd: null,
  textPrijemcu: "cislo",
};

export const MOZNOSTI_TEXTU_PRIJEMCU = ["cislo", "len_cislo", "vs", "poznamka"] as const;

/** Nastavenia banky z `uctovanie_nastavenia` (celý JSON alebo kľúč `banka`). */
export function nastaveniaBanky(v: unknown): NastaveniaBanky {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const x = (o.banka && typeof o.banka === "object" ? o.banka : o) as Record<string, unknown>;
  return {
    ignorovatTypPlatby:
      typeof x.ignorovatTypPlatby === "boolean"
        ? x.ignorovatTypPlatby
        : PREDVOLENE_BANKY.ignorovatTypPlatby,
    synchronizovatOd: den(x.synchronizovatOd) || null,
    autoParovanieOd: den(x.autoParovanieOd) || null,
    textPrijemcu: jeden(x.textPrijemcu, MOZNOSTI_TEXTU_PRIJEMCU, PREDVOLENE_BANKY.textPrijemcu),
  };
}

/** Pohyby od dátumu (vrátane); bez dátumu všetky. */
export function lenOdDatumu<T extends { booking_date?: unknown }>(
  riadky: T[],
  od: string | null | undefined,
): T[] {
  const d = den(od);
  if (!d) return riadky;
  return riadky.filter((r) => {
    const b = den(r.booking_date);
    return !b || b >= d;
  });
}

/**
 * Je pohyb platbou kartou? Banky to hovoria len v texte pohybu („Platba
 * kartou", „POS", maskované číslo karty „**** 1234").
 */
export function jePlatbaKartou(p: { description?: unknown; counterparty?: unknown }): boolean {
  const t = `${String(p.description ?? "")} ${String(p.counterparty ?? "")}`;
  return /kart(ou|a\b)|\bcard\b|\bPOS\b|(?:\*{2,}|\bx{2,})\s*\d{4}\b|\b\d{4,6}\s*(?:\*{2,}|x{2,})/i.test(
    t,
  );
}

/**
 * Sedí spôsob platby bločku na pohyb? Pri `ignorovatTypPlatby` vždy (okrem
 * hotovosti, tú banka nevidí nikdy — to rieši párovanie samo).
 */
export function platbaSedi(
  platba: string | null | undefined,
  pohyb: { description?: unknown; counterparty?: unknown },
  ignorovat: boolean,
): boolean {
  if (ignorovat) return true;
  if (platba === "karta") return jePlatbaKartou(pohyb);
  if (platba === "prevod") return !jePlatbaKartou(pohyb);
  return true;
}
