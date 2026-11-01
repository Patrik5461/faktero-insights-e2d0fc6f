/**
 * Prijatá faktúra, ktorá vznikla z prijatej eFaktúry — údaje pre odznak
 * „eFaktúra prijatá“ a sekciu eFaktúry v detaile.
 *
 * Väzbu zapisuje zaevidovanie (`zaevidujPrijatuEfakturu` v
 * `zaevidovanie-efaktury.server.ts`): riadok `efaktura_received_documents`
 * dostane `matched_supplier_invoice_id` = id prijatej faktúry. Platí to aj
 * pri **pripojení** k faktúre, ktorá už prišla inou cestou (mailom, skenom) —
 * tá má potom iný `source`, ale eFaktúru má. Naopak `source = 'efaktura'` bez
 * väzby ostane, keď bol riadok eFaktúry zmazaný; aj taká faktúra z eFaktúry
 * vznikla, len o nej už nevieme podrobnosti.
 *
 * Bez textov, len údaje — web aj appka si ich preložia samy.
 */

/**
 * Stĺpce pre vnorený výber `efaktura_received_documents` k `purchase_invoices`.
 * Bez XML a bez celého výsledku kontroly (býva desiatky kB) — tie si detail
 * dopýta sám. Stačia aj na otvorenie náhľadu pôvodnej eFaktúry v appke
 * (`DetailEfaktury` chce riadok v tvare `PrijataEfakturaApp`).
 */
export const STLPCE_PRIJATEJ_EFAKTURY =
  "id, channel, sender_name, sender_participant_id, document_number, issue_date, due_date, currency, total, vat_total, status, received_at, processed_at, matched_supplier_invoice_id, nespracovany_id, kontrola_chyby, kontrola_varovania, skontrolovane_at, druh:parsed_data->>documentKind";

/** Vnorený výber k `purchase_invoices` — jeden dotaz na celý zoznam. */
export const VYBER_EFAKTURY_K_PRIJATEJ = `efaktura_received_documents(${STLPCE_PRIJATEJ_EFAKTURY})`;

/** Riadok eFaktúry tak, ako ho vráti výber vyššie. */
export type RiadokPrijatejEfaktury = {
  id: string;
  channel?: string | null;
  sender_name?: string | null;
  sender_participant_id?: string | null;
  document_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  currency?: string | null;
  total?: number | string | null;
  vat_total?: number | string | null;
  status?: string | null;
  received_at?: string | null;
  processed_at?: string | null;
  matched_supplier_invoice_id?: string | null;
  nespracovany_id?: string | null;
  kontrola_chyby?: number | null;
  kontrola_varovania?: number | null;
  skontrolovane_at?: string | null;
  druh?: string | null;
};

export type PrijataEfakturaFaktury = {
  /** Riadok eFaktúry; `null` = faktúra je z eFaktúry, ale riadok už nie je. */
  efaktura: RiadokPrijatejEfaktury | null;
  /** Kanál príjmu (`peppol`, …). */
  kanal: string | null;
  odosielatel: string | null;
  /** Peppol ID odosielateľa (`0245:…`). */
  peppolId: string | null;
  /** Kedy eFaktúra prišla (ISO). */
  prisla: string | null;
  /** Kedy sa z nej stala prijatá faktúra (ISO). */
  zaevidovana: string | null;
  /** Výsledok automatickej kontroly; `null` = kontrola ešte nebežala. */
  kontrola: { chyby: number; varovania: number } | null;
};

function cas(r: RiadokPrijatejEfaktury): number {
  const t = Date.parse(r.received_at ?? "");
  return Number.isFinite(t) ? t : 0;
}

/**
 * Údaje eFaktúry z vnoreného výberu. `null` = faktúra nevznikla z eFaktúry.
 * K jednej faktúre môže byť pripojených viac eFaktúr (dodávateľ ju poslal
 * dvakrát) — rozhoduje posledná prijatá.
 */
export function prijataEfakturaZVyberu(
  vyber: unknown,
  source?: string | null,
): PrijataEfakturaFaktury | null {
  const riadky = (Array.isArray(vyber) ? vyber : vyber ? [vyber] : []).filter(
    (r): r is RiadokPrijatejEfaktury => !!r && typeof r === "object" && "id" in r,
  );
  if (!riadky.length) {
    if (source !== "efaktura") return null;
    return {
      efaktura: null,
      kanal: null,
      odosielatel: null,
      peppolId: null,
      prisla: null,
      zaevidovana: null,
      kontrola: null,
    };
  }
  const r = [...riadky].sort((a, b) => cas(a) - cas(b))[riadky.length - 1];
  const skontrolovana = r.skontrolovane_at != null || r.kontrola_chyby != null;
  return {
    efaktura: r,
    kanal: r.channel ?? null,
    odosielatel: r.sender_name?.trim() || null,
    peppolId: r.sender_participant_id?.trim() || null,
    prisla: r.received_at ?? null,
    zaevidovana: r.processed_at ?? null,
    kontrola: skontrolovana
      ? { chyby: Number(r.kontrola_chyby ?? 0), varovania: Number(r.kontrola_varovania ?? 0) }
      : null,
  };
}

/** Kontrola našla chyby — odznak aj sekcia sú vtedy červené. */
export function maChybyKontroly(p: PrijataEfakturaFaktury | null | undefined): boolean {
  return (p?.kontrola?.chyby ?? 0) > 0;
}

/** Filter zoznamu prijatých faktúr „eFaktúra: prijaté“. */
export function jeZPrijatejEfaktury(p: PrijataEfakturaFaktury | null | undefined): boolean {
  return !!p;
}

/** Nález kontroly tak, ako ho uloží `ulozenie.ts` (stačí kód a popis). */
export type NalezPrijatej = {
  kod: string;
  zavaznost: string;
  popis?: string;
  parametre?: Record<string, string | number>;
  kategoria?: string;
};

/**
 * Chyby kontroly na zobrazenie — najprv chyby, potom varovania, najviac `max`.
 * Popis je slovenská šablóna so `{x}`; doplní sa z parametrov.
 */
export function nalezyNaZobrazenie(
  nalezy: unknown,
  max = 5,
): { kod: string; chyba: boolean; text: string }[] {
  if (!Array.isArray(nalezy)) return [];
  const platne = (nalezy as NalezPrijatej[]).filter(
    (n) => n && typeof n.kod === "string" && typeof n.zavaznost === "string",
  );
  const zoradene = [
    ...platne.filter((n) => n.zavaznost === "chyba"),
    ...platne.filter((n) => n.zavaznost !== "chyba"),
  ];
  return zoradene.slice(0, max).map((n) => ({
    kod: n.kod,
    chyba: n.zavaznost === "chyba",
    text: String(n.popis ?? "").replace(/\{(\w+)\}/g, (_, k: string) =>
      n.parametre && n.parametre[k] != null
        ? String(n.parametre[k])
        : k === "kat" && n.kategoria
          ? n.kategoria
          : "",
    ),
  }));
}
