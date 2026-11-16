/**
 * Druh prijatého dokladu podľa toho, čo na ňom naisto je.
 *
 * Model odpovedá na otázku „faktúra / bloček / iný doklad“ a väčšinou trafí,
 * ale nie vždy: mesačnú splátku od Orange (VS, IBAN, splatnosť, IČO) dal
 * medzi iné doklady, účtenku z obchodu vie nazvať faktúrou a vrátenie tovaru
 * na bločku dobropisom. Tu sa jeho odpoveď opraví podľa znakov, ktoré sa
 * nedajú pomýliť:
 *
 * - UID z eKasy (`O-` + 32 znakov) alebo kód pokladnice (17 číslic) → bloček,
 * - číslo faktúry + IČO/DIČ dodávateľa + splatnosť a IBAN či VS → faktúra,
 * - výzva obchodného dodávateľa na úhradu (IČO, splatnosť, IBAN/VS, suma),
 *   ktorú model dal medzi „iné“ (nie úrad, poisťovňa, exekúcia, zmluva) → faktúra,
 * - nadpis „Dobropis“, „Opravná faktúra“, „Credit note“, „Gutschrift“ → dobropis,
 * - účtenka z obchodu (nadpis/súbor „účtenka“, „ticket“, „receipt“) bez
 *   splatnosti a účtu na úhradu → bloček, aj keď je suma záporná (vrátenie).
 *
 * Výstup je oprava odpovede modelu (`document_type`, `document_subtype`), nie
 * výsledný druh — ten ďalej určí `navrhDruhu` (vrátane zálohovej, daňového
 * dokladu k platbe a vlastnej vydanej faktúry). Nič sa tu nevolá, len sa číta.
 */

type Ai = Record<string, unknown>;

const NORMALIZUJ = (h: unknown): string =>
  String(h ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[._\-\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

function cislo(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** UID dokladu z eKasy. */
const UID_EKASA = /\bO-[0-9A-F]{32}\b/i;
/** Kód pokladnice eKasa (ORP) — 17 číslic. */
const KOD_POKLADNICE = /^\d{17}$/;

/** Slová účtenky / bločku v nadpise alebo v názve súboru (po normalizácii). */
const BLOCEK_SLOVA =
  /(pokladnicn\w* (doklad|blok)|\buctenk|\bparagon|kassenbon|kassenbeleg|\breceipt\b|pokladni doklad|\bticket\b|\bblocek\b|zjednodusen\w* faktur|eet\b)/;
/** Slová faktúry v nadpise alebo v názve súboru. */
const FAKTURA_SLOVA = /(\bfaktur|\binvoice\b|\brechnung\b|vyuctovan|danov\w* doklad|\bfaktura\b|\bfa\b \d)/;
/** Slová dobropisu. */
const DOBROPIS_SLOVA =
  /(\bdobropis|credit note|\bgutschrift|opravn\w* faktur|opravn\w* danov\w* doklad|storno faktur|rechnungskorrektur|stornorechnung)/;

/** Druhy „iného dokladu“, pri ktorých výzva na platbu faktúrou nie je. */
const OSTATNE_NIE_FAKTURA = new Set(["exekucia", "poistovna", "danovy_urad", "socialna_zdravotna", "zmluva", "leasing_uver", "uradny_list"]);

export type SignalyDruhu = {
  /** UID z eKasy alebo kód pokladnice — bloček naisto. */
  ekasa: boolean;
  /** Nadpis alebo súbor hovorí „účtenka / ticket / receipt / pokladničný doklad“. */
  slovaBlocku: boolean;
  /** Nadpis alebo súbor hovorí „faktúra / vyúčtovanie / invoice / Rechnung“. */
  slovaFaktury: boolean;
  /** Nadpis alebo súbor hovorí „dobropis / opravná faktúra / credit note“. */
  slovaDobropisu: boolean;
  /** Má dodávateľa s IČO/DIČ/IČ DPH. */
  identifikaciaDodavatela: boolean;
  /** Má údaje na úhradu prevodom: splatnosť a IBAN alebo VS. */
  udajeNaUhradu: boolean;
  /** Číslo faktúry + identifikácia dodávateľa + údaje na úhradu. */
  faktura: boolean;
};

export function signalyDruhu(ai: Ai | null | undefined, nazovSuboru?: string | null): SignalyDruhu {
  const a = ai ?? {};
  const uid = [a.ekasa_uid, a.invoice_number, a.document_number].map(text).some((v) => UID_EKASA.test(v));
  const kod = text(a.cash_register_code).replace(/\s/g, "");
  const ekasa = uid || KOD_POKLADNICE.test(kod);
  const nadpis = NORMALIZUJ(a.document_title);
  const subor = NORMALIZUJ(nazovSuboru);
  const spolu = `${nadpis} | ${subor}`;
  const identifikaciaDodavatela = [a.supplier_ico, a.supplier_dic, a.supplier_ic_dph].some((v) => text(v) !== "");
  const udajeNaUhradu = text(a.due_date) !== "" && (text(a.supplier_iban) !== "" || text(a.variable_symbol) !== "");
  return {
    ekasa,
    slovaBlocku: BLOCEK_SLOVA.test(spolu),
    slovaFaktury: FAKTURA_SLOVA.test(spolu),
    // Dobropis len z nadpisu — v názve súboru býva „dobropisy“ aj pri bežných faktúrach z exportu.
    slovaDobropisu: DOBROPIS_SLOVA.test(nadpis),
    identifikaciaDodavatela,
    udajeNaUhradu,
    faktura: text(a.invoice_number) !== "" && identifikaciaDodavatela && udajeNaUhradu,
  };
}

/**
 * Oprava `document_type` / `document_subtype` odpovede modelu podľa znakov na
 * doklade. Vráti len to, čo sa mení (prázdny objekt = model mal pravdu).
 */
export function opravaDruhuZoSignalov(
  ai: Ai | null | undefined,
  nazovSuboru?: string | null,
): { document_type?: string; document_subtype?: string | null } {
  if (!ai) return {};
  const s = signalyDruhu(ai, nazovSuboru);
  const typ = text(ai.document_type).toLowerCase();
  const pod = text(ai.document_subtype).toLowerCase();
  const suma = cislo(ai.amount_total);

  /*
    Faktúra zaplatená pri pokladnici (METRO: bloček „Úhrada faktúry“ s UID
    a za ním faktúra s rekapituláciou DPH) — daňový doklad je faktúra.
  */
  const cisloFaktury = text(ai.invoice_number);
  const fakturaSIdentifikaciou =
    s.slovaFaktury && !s.slovaBlocku && cisloFaktury !== "" && !UID_EKASA.test(cisloFaktury) && s.identifikaciaDodavatela;

  // 1. eKasa — pokladničný doklad, aj vrátenie tovaru (záporná suma).
  if (s.ekasa && !fakturaSIdentifikaciou)
    return typ === "faktura" && pod === "blocek" ? {} : { document_type: "faktura", document_subtype: "blocek" };

  // 2. Iný doklad, ktorý je v skutočnosti faktúrou / výzvou dodávateľa na úhradu.
  if (typ === "ostatny") {
    const druhOstatneho = text(ai.other_kind).toLowerCase();
    if (OSTATNE_NIE_FAKTURA.has(druhOstatneho)) return {};
    const vyzvaNaUhradu = s.identifikaciaDodavatela && s.udajeNaUhradu && (suma ?? 0) !== 0;
    if (s.faktura || vyzvaNaUhradu || (s.slovaFaktury && s.identifikaciaDodavatela && (suma ?? 0) !== 0)) {
      return { document_type: "faktura", document_subtype: s.slovaDobropisu || (suma ?? 0) < 0 ? "dobropis" : pod || null };
    }
    return {};
  }

  // 3. „Bloček“, ktorý má číslo faktúry, splatnosť a účet na úhradu — faktúra.
  if (pod === "blocek") {
    if ((s.faktura && !s.slovaBlocku) || fakturaSIdentifikaciou)
      return { document_type: "faktura", document_subtype: s.slovaDobropisu ? "dobropis" : null };
    return {};
  }

  // 4. Účtenka z obchodu bez údajov na úhradu — bloček (aj vrátenie so zápornou sumou).
  const bezFaktury = !s.faktura && !s.udajeNaUhradu && !s.slovaFaktury;
  if (s.slovaBlocku && bezFaktury && pod !== "zalohova" && !pod.includes("k_platbe")) {
    return { document_type: "faktura", document_subtype: "blocek" };
  }

  // 5. Dobropis podľa nadpisu, keď ho model nazval obyčajnou faktúrou.
  if (s.slovaDobropisu && pod !== "dobropis" && !pod.includes("k_platbe")) return { document_subtype: "dobropis" };

  return {};
}
