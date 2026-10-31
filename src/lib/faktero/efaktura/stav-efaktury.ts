/**
 * Stav eFaktúry vystavenej faktúry — z riadkov `efaktura_deliveries`.
 *
 * Bez textov (tie si dáva každé rozhranie samo — web cez `t()`, appka cez
 * vlastný slovník), len kódy. Pravidlá sú tie isté ako v zozname faktúr na
 * webe: rozhoduje **posledné** doručenie dokumentu, zlyhané či technicky
 * odmietnuté sa neráta za odoslané. Navyše sa číta to, čo ePošták pošle v
 * stave dokumentu (`raw_response`):
 *
 * - `deliveryFailure` — konečný dôvod, prečo doklad do Peppolu neodišiel
 *   (napr. `participant_not_found`). Doklad má vtedy stav, ktorý
 *   `mapTransportStatus` prepíše na `pending`, takže by sa inak tváril ako
 *   „odoslaný“.
 * - `invoiceResponseStatus` — odpoveď odberateľa (UBL kódy AB/IP/UQ/CA/RE/AP/PD):
 *   prijal ju, zamietol, alebo má otázku.
 *
 * Pozor na `accepted` v stĺpci `status`: to je „ePošták doklad prevzal“, prvý
 * krok v jeho histórii, nie prijatie odberateľom — preto znamená „odoslaná“.
 */

export type StavEfakturyKod = "odoslana" | "dorucena" | "prijata" | "zamietnuta" | "zlyhala";

/** Prečo eFaktúra neodišla alebo neprešla — kód, ktorý rozhranie preloží. */
export type DovodEfaktury =
  | "nie_v_peppole"
  | "typ_neprijima"
  | "validacia"
  | "odmietnuta_technicky"
  | "adresar_nedostupny"
  | "doprava_zlyhala"
  | "bez_efaktury"
  | "duplicitne_cislo"
  | "sluzba_nedostupna"
  | "neznamy";

/** Odpoveď odberateľa, ktorá si zaslúži poznámku pri stave. */
export type OdpovedOdberatela = "otazka" | "spracuva" | "s_vyhradou" | "zaplatena";

export type StavEfaktury = {
  stav: StavEfakturyKod;
  /** Kedy nastal zobrazený stav (ISO). */
  kedy: string | null;
  /** Kedy faktúra odišla (ISO). */
  odoslana: string | null;
  kanal: string | null;
  dovod?: DovodEfaktury;
  /** Text chyby od služby (už očistený, zväčša po slovensky) — len ako doplnok. */
  detail?: string | null;
  odpoved?: OdpovedOdberatela;
  /** Počet pokusov o doručenie (riadkov). */
  pokusov: number;
};

/** Riadok doručenia tak, ako ho vráti výber nižšie (`STLPCE_DORUCENIA`). */
export type RiadokDorucenia = {
  status?: string | null;
  channel?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  /** `raw_response->deliveryFailure` */
  zlyhanie?: unknown;
  /** `raw_response->>invoiceResponseStatus` */
  odpoved?: string | null;
};

/**
 * Stĺpce pre vnorený výber `efaktura_deliveries` — bez celého `raw_response`
 * (býva pár kB na doklad), len dve polia, ktoré stav potrebuje.
 */
export const STLPCE_DORUCENIA =
  "status, channel, sent_at, delivered_at, created_at, updated_at, error_code, error_message, zlyhanie:raw_response->deliveryFailure, odpoved:raw_response->>invoiceResponseStatus";

/** Vnorený výber k `invoices` — jeden dotaz na celý zoznam, nie dotaz na faktúru. */
export const VYBER_EFAKTURY_K_FAKTURE = `efaktura_documents(efaktura_deliveries(${STLPCE_DORUCENIA}))`;

const KODY_ZLYHANIA: Record<string, DovodEfaktury> = {
  participant_not_found: "nie_v_peppole",
  recipient_not_found: "nie_v_peppole",
  document_type_not_accepted: "typ_neprijima",
  validation_failed: "validacia",
  rejected_by_receiver: "odmietnuta_technicky",
  receiver_lookup_unavailable: "adresar_nedostupny",
  transport_failed: "doprava_zlyhala",
};

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Ľudský dôvod chyby z toho, čo uložil server alebo poslal ePošták. */
export function dovodChyby(d: RiadokDorucenia): { dovod: DovodEfaktury; detail: string | null } {
  const z = (d.zlyhanie && typeof d.zlyhanie === "object" ? d.zlyhanie : null) as {
    code?: unknown;
    message?: unknown;
    detail?: unknown;
  } | null;
  const kodZlyhania = text(z?.code);
  if (kodZlyhania && KODY_ZLYHANIA[kodZlyhania]) {
    return { dovod: KODY_ZLYHANIA[kodZlyhania], detail: text(z?.detail) ?? text(z?.message) };
  }
  const kod = text(d.error_code) ?? "";
  const sprava = text(d.error_message) ?? text(z?.detail) ?? text(z?.message);
  const vsetko = `${kod} ${sprava ?? ""}`;
  if (kod === "missing_firm_id") return { dovod: "bez_efaktury", detail: null };
  if (/DUPLICATE_INVOICE_NUMBER|už má odoslanú faktúru s týmto číslom/.test(vsetko))
    return { dovod: "duplicitne_cislo", detail: null };
  if (/PARTICIPANT_NOT_FOUND|RECIPIENT_NOT_REGISTERED|recipient_not_found/i.test(vsetko))
    return { dovod: "nie_v_peppole", detail: null };
  if (/^5\d\d$/.test(kod) || /^HTTP 5\d\d/.test(sprava ?? ""))
    return { dovod: "sluzba_nedostupna", detail: null };
  if (/^40[13]$/.test(kod)) return { dovod: "bez_efaktury", detail: null };
  if (d.status === "rejected") return { dovod: "odmietnuta_technicky", detail: sprava };
  return { dovod: "neznamy", detail: sprava };
}

function odpovedOdberatela(kod: string): OdpovedOdberatela | undefined {
  if (kod === "UQ") return "otazka";
  if (kod === "AB" || kod === "IP") return "spracuva";
  if (kod === "CA") return "s_vyhradou";
  if (kod === "PD") return "zaplatena";
  return undefined;
}

function cas(d: RiadokDorucenia): number {
  const t = Date.parse(d.created_at ?? d.sent_at ?? "");
  return Number.isFinite(t) ? t : 0;
}

/**
 * Stav eFaktúry z jej doručení. `null` = faktúra eFaktúrou zatiaľ neodišla.
 */
export function stavEfaktury(dorucenia: RiadokDorucenia[] | null | undefined): StavEfaktury | null {
  if (!dorucenia?.length) return null;
  const posledne = [...dorucenia].sort((a, b) => cas(a) - cas(b))[dorucenia.length - 1];
  const zaklad = {
    odoslana: posledne.sent_at ?? posledne.created_at ?? null,
    kanal: posledne.channel ?? null,
    pokusov: dorucenia.length,
  };
  const odpoved = (text(posledne.odpoved) ?? "").toUpperCase();
  const zmena = posledne.updated_at ?? posledne.delivered_at ?? posledne.sent_at ?? null;

  // Odpoveď odberateľa je konečná — po nej už nič „nezlyhá“.
  if (odpoved === "RE") return { ...zaklad, stav: "zamietnuta", kedy: zmena };
  if (odpoved === "AP" || odpoved === "CA" || odpoved === "PD")
    return { ...zaklad, stav: "prijata", kedy: zmena, odpoved: odpovedOdberatela(odpoved) };

  const zlyhanie = posledne.zlyhanie && typeof posledne.zlyhanie === "object";
  if (zlyhanie || posledne.status === "failed" || posledne.status === "rejected") {
    const { dovod, detail } = dovodChyby(posledne);
    return { ...zaklad, stav: "zlyhala", kedy: zmena, dovod, detail };
  }
  if (posledne.status === "delivered") {
    return {
      ...zaklad,
      stav: "dorucena",
      kedy: posledne.delivered_at ?? zmena,
      odpoved: odpovedOdberatela(odpoved),
    };
  }
  return { ...zaklad, stav: "odoslana", kedy: zaklad.odoslana };
}

/**
 * Stav z vnoreného výberu `VYBER_EFAKTURY_K_FAKTURE`. PostgREST vráti dokument
 * ako objekt (invoice_id je unikátne) alebo pole — zvládne oboje.
 */
export function stavEfakturyZVyberu(efakturaDocuments: unknown): StavEfaktury | null {
  const dokumenty = Array.isArray(efakturaDocuments)
    ? efakturaDocuments
    : efakturaDocuments
      ? [efakturaDocuments]
      : [];
  const dorucenia: RiadokDorucenia[] = [];
  for (const d of dokumenty as { efaktura_deliveries?: RiadokDorucenia[] | null }[]) {
    for (const r of d?.efaktura_deliveries ?? []) dorucenia.push(r);
  }
  return stavEfaktury(dorucenia);
}

/** Filter zoznamu podľa eFaktúry. */
export type FilterEfaktury = "odoslane" | "chyba";

export function prejdeFiltromEfaktury(
  s: StavEfaktury | null | undefined,
  filter: FilterEfaktury,
): boolean {
  if (!s) return false;
  if (filter === "chyba") return s.stav === "zlyhala" || s.stav === "zamietnuta";
  return s.stav === "odoslana" || s.stav === "dorucena" || s.stav === "prijata";
}
