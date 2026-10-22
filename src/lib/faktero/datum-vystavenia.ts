/*
  Dátum vystavenia pri prvom odoslaní.

  Faktúra vystavená včera a odoslaná až dnes nesie dátum, ktorý nesedí s tým,
  kedy ju odberateľ dostal. Pri prvom odoslaní (e-mailom aj eFaktúrou) sa preto
  dátum vystavenia musí prepísať na dnešok — bez toho odoslanie neprejde.

  Výnimkou je doklad, ktorý sa zmeniť nedá (uzamknuté obdobie, už vyvezený do
  účtovníctva): vtedy sa smie odoslať s pôvodným dátumom, ale len po výslovnom
  potvrdení. Inak by sa taká faktúra nedala poslať nikdy.

  Tu je len čistá logika — rovnaké pravidlo používa okno na webe, appka aj
  server, ktorý odoslanie bez zmeny dátumu odmietne.
*/

/** Dnešok v Bratislave (YYYY-MM-DD) — nie v UTC, kde je o polnoci ešte včera. */
export function dnesBratislava(teraz: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(teraz);
}

/** Typy vydaných dokladov, ktoré sa odosielajú odberateľovi — všetky z `invoices`. */
export const TYPY_S_KONTROLOU_DATUMU = [
  "regular",
  "proforma",
  "credit_note",
  "debit_note",
  "advance_payment",
] as const;

export type FakturaNaKontrolu = {
  type?: string | null;
  status?: string | null;
  issue_date?: string | null;
  delivery_date?: string | null;
  due_date?: string | null;
  povodna_splatnost?: string | null;
  invoice_number?: string | null;
  exported_at?: string | null;
  sent_at?: string | null;
};

/**
 * Či doklad už odberateľovi odišiel — e-mailom, eFaktúrou alebo „iným spôsobom".
 * Upomienka ani opätovné odoslanie nie je prvé odoslanie, tie sa nekontrolujú.
 */
export function uzOdoslana(
  f: Pick<FakturaNaKontrolu, "status" | "sent_at">,
  stopy: { emailOdoslany?: boolean; efakturaOdoslana?: boolean } = {},
): boolean {
  return (
    Boolean(f.sent_at) ||
    f.status === "sent" ||
    Boolean(stopy.emailOdoslany) ||
    Boolean(stopy.efakturaOdoslana)
  );
}

/** Stav doručenia eFaktúry, ktorý sa za odoslanie neráta. */
export function dorucenieZlyhalo(status: string | null | undefined): boolean {
  return ["failed", "error", "rejected"].includes(String(status ?? "").toLowerCase());
}

/**
 * Treba pred odoslaním zmeniť dátum vystavenia?
 *
 * Len pri prvom odoslaní a len keď je dátum starší ako dnešok. Uhradená
 * faktúra sa nekontroluje — platba už prebehla na doklad s tým dátumom,
 * posiela sa jej kópia. Stornovaná sa neodosiela vôbec.
 */
export function trebaAktualnyDatum(
  f: FakturaNaKontrolu,
  odoslana: boolean,
  dnes: string = dnesBratislava(),
): boolean {
  if (!f.issue_date) return false;
  if (!TYPY_S_KONTROLOU_DATUMU.includes(String(f.type ?? "regular") as any)) return false;
  if (f.status === "cancelled" || f.status === "paid") return false;
  if (odoslana) return false;
  return f.issue_date.slice(0, 10) < dnes;
}

/** Prečo sa dátum zmeniť nedá — `null`, keď sa dá. */
export function dovodNemoznejZmeny(
  f: FakturaNaKontrolu,
  lockedUntil: string | null | undefined,
): string | null {
  if (lockedUntil && f.issue_date && f.issue_date.slice(0, 10) <= lockedUntil.slice(0, 10)) {
    return "Obdobie je uzamknuté uzávierkou do {datum}, dátum vystavenia sa už zmeniť nedá.";
  }
  if (f.exported_at) {
    return "Faktúra je už vyvezená do účtovníctva — zmena dátumu by v účtovníctve nesedela.";
  }
  return null;
}

function naDen(d: string): number {
  const [r, m, dd] = d.slice(0, 10).split("-").map(Number);
  return Date.UTC(r, m - 1, dd) / 86400000;
}

function zDna(n: number): string {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

/** Posunie dátum o toľko dní, o koľko sa posunul dátum vystavenia — lehota ostane rovnaká. */
export function posunOLehotu(
  datum: string | null | undefined,
  staryVystavenia: string,
  novyVystavenia: string,
): string | null {
  if (!datum) return null;
  return zDna(naDen(datum) + (naDen(novyVystavenia) - naDen(staryVystavenia)));
}

/** Prechádza zmena do iného mesiaca alebo roka? Číslo faktúry ostáva pôvodné. */
export function ineObdobie(stary: string, novy: string): "rok" | "mesiac" | null {
  if (stary.slice(0, 4) !== novy.slice(0, 4)) return "rok";
  if (stary.slice(0, 7) !== novy.slice(0, 7)) return "mesiac";
  return null;
}

/**
 * Dátum dodania sa pri zmene nemení. Faktúra bez neho ho ale preberala
 * z dátumu vystavenia (PDF, výkaz DPH) — vtedy sa doplní pôvodný dátum,
 * aby sa dodanie zmenou vystavenia nepohlo. Pri dobropise a ťarchopise
 * rozhoduje dátum vystavenia, dodanie sa nedopĺňa.
 */
export function datumDodaniaPoZmene(f: FakturaNaKontrolu): string | null {
  if (f.delivery_date) return f.delivery_date;
  if (f.type === "credit_note" || f.type === "debit_note" || f.type === "proforma") return null;
  return f.issue_date ?? null;
}

export type ZmenaDatumu = {
  issue_date: string;
  due_date: string | null;
  delivery_date: string | null;
  povodna_splatnost: string | null;
};

/** Hodnoty, ktoré sa pri zmene na dnešok zapíšu. */
export function zmenaNaDnes(f: FakturaNaKontrolu, dnes: string = dnesBratislava()): ZmenaDatumu {
  const stary = String(f.issue_date).slice(0, 10);
  return {
    issue_date: dnes,
    due_date: posunOLehotu(f.due_date, stary, dnes),
    delivery_date: datumDodaniaPoZmene(f),
    povodna_splatnost: posunOLehotu(f.povodna_splatnost, stary, dnes),
  };
}

export type KontrolaDatumu = {
  /** Treba niečo urobiť — inak sa odosiela rovno. */
  treba: boolean;
  /** Dá sa dátum zmeniť; keď nie, `dovod` povie prečo. */
  mozno: boolean;
  dovod: string | null;
  datum: string | null;
  dnes: string;
  novaSplatnost: string | null;
  povodnaSplatnost: string | null;
  dodanie: string | null;
  ineObdobie: "rok" | "mesiac" | null;
  cislo: string | null;
  /** Koniec uzamknutého obdobia, keď je dôvodom zámok. */
  zamknuteDo: string | null;
};

export function kontrolaDatumu(
  f: FakturaNaKontrolu,
  odoslana: boolean,
  lockedUntil: string | null | undefined,
  dnes: string = dnesBratislava(),
): KontrolaDatumu {
  const treba = trebaAktualnyDatum(f, odoslana, dnes);
  const dovod = treba ? dovodNemoznejZmeny(f, lockedUntil) : null;
  const zmena = treba ? zmenaNaDnes(f, dnes) : null;
  return {
    treba,
    mozno: treba && !dovod,
    dovod,
    datum: f.issue_date ?? null,
    dnes,
    novaSplatnost: zmena?.due_date ?? null,
    povodnaSplatnost: f.due_date ?? null,
    dodanie: zmena?.delivery_date ?? null,
    ineObdobie: treba && f.issue_date ? ineObdobie(f.issue_date.slice(0, 10), dnes) : null,
    cislo: f.invoice_number ?? null,
    zamknuteDo: dovod && lockedUntil ? lockedUntil.slice(0, 10) : null,
  };
}

/** Kód chyby, ktorým server odmietne odoslanie so starým dátumom (aj vo verejnom API). */
export const KOD_STARY_DATUM = "issue_date_in_past";

/** Rozpozná odmietnutie zo servera aj v texte chyby, ktorý prejde cez most appky. */
export function jeChybaStarehoDatumu(e: unknown): boolean {
  const s = String((e as any)?.message ?? e ?? "");
  return (e as any)?.code === KOD_STARY_DATUM || /^Dátum vystavenia .* nie je dnešný/.test(s);
}
