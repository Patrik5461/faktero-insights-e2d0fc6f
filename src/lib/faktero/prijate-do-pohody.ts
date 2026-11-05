/*
  Prijatá faktúra v tvare prijatého dokladu pre export do Pohody.

  Export dokladov (`polozkyDokladov`) zapisuje súhrn po sadzbách, nie položky
  — rovnako ako účtovník zadáva prijatú faktúru ručne. Tu sa prijatá faktúra
  len prevedie na ten istý tvar: rozpis DPH, predkontácia a členenie z
  zaúčtovania, číslo faktúry dodávateľa ako `originalDocument`.
*/

import { jeSamozdanenie } from "./datum-prijatia";
import { najblizsiaSadzba, zoradPodlaSadzby } from "./vat-rates";
import { prepocitajPolozku, sumySamofaktury } from "./samofakturacia";
import { maPopisPrijatej, textPrijatejFaktury } from "./text-dokladu";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Položka prijatej faktúry prepočítaná na základ a daň (sumy so znamienkom dokladu). */
export type PolozkaPrijatej = {
  nazov: string;
  mnozstvo: number;
  mj: string | null;
  /** Jednotková cena bez DPH. */
  cena: number;
  sadzba: number;
  zaklad: number;
  dph: number;
  /** Prenesenie daňovej povinnosti (§ 69 ods. 12) — daň odvedie odberateľ. */
  pdp: boolean;
  predkontacia: string | null;
  clenenie: string | null;
  /** Ručne zvolené členenie KV DPH položky (`kv`, staršie `kv_clenenie`). */
  kv?: string | null;
  /** Kategória DPH položky (`vat_category`: standard / out_of_scope / exempt / reverse_charge / needs_review). */
  vat_category?: string | null;
};

/**
 * Celá faktúra v prenesení daňovej povinnosti (§ 69 ods. 12) — dodávateľ
 * neúčtoval žiadnu daň a odvedie ju odberateľ. Formulár ukladá len
 * `dph_rezim: "samozdanenie"`, čítanie dokladu aj `reverse_charge`.
 */
export const celaPdp = (p: any) =>
  (p?.reverse_charge === true || p?.dph_rezim === "samozdanenie") &&
  !Number(p?.vat_amount ?? 0);

const jePdp = (x: any, p: any) =>
  x?.pdp === true ||
  x?.reverse_charge === true ||
  // Celá faktúra v prenesení: položky bez dane sú prenesené — aj keď je pri
  // nich uvedená sadzba, ktorú si odberateľ dopočíta.
  celaPdp(p) ||
  ((p?.reverse_charge === true || p?.dph_rezim === "samozdanenie") && !(Number(x?.vat_rate) > 0));

/**
 * Položky prijatej faktúry so základom a daňou — len keď sedia so súčtami
 * faktúry (na pár centov). Sumy položiek z čítania bývajú raz bez DPH, raz
 * s DPH; rozhodne, ktorému súčtu faktúry sa súčet položiek rovná. Inak null
 * a faktúra ide súhrnom.
 *
 * Sčítava sa **so znamienkom**: zľavy a bonusy sú záporné riadky (Telekom:
 * „Zľavy -18,51“) a absolútna hodnota by ich pripočítala — súčet by nesedel
 * a faktúra by spadla na súhrn s vymyslenou sadzbou. Keď majú všetky položky
 * opačné znamienko než faktúra (dobropis s kladnými riadkami), otočia sa.
 * Základ sa zaokrúhľuje za sadzbu, nie za riadok — rozdiel padne na
 * najväčšiu položku sadzby, aby súčet sedel s faktúrou na cent.
 */
export function polozkyPrijatej(p: any): PolozkaPrijatej[] | null {
  const items: any[] = Array.isArray(p?.items) ? p.items.filter((x: any) => String(x?.name ?? "").trim()) : [];
  if (!items.length) return null;
  if (items.some((x) => x?.vat_rate === null || x?.vat_rate === undefined || !Number.isFinite(Number(x.vat_rate))))
    return null;
  const suma = (x: any) => {
    const t = Number(x?.total);
    return Number.isFinite(t) && x?.total !== null && x?.total !== undefined
      ? t
      : (Number(x?.quantity ?? 1) || 1) * Number(x?.unit_price ?? 0);
  };
  const sucet = items.reduce((a, x) => a + suma(x), 0);
  const bezDph = Number(p?.amount_without_vat ?? 0);
  const sDph = Number(p?.amount_total ?? 0);
  const tol = Math.max(0.03, 0.01 * items.length);
  const blizko = (a: number, b: number) => Math.abs(a - b) <= tol;
  // Smer: položky so znamienkom faktúry, alebo všetky opačne (otočia sa).
  let otoc = 1;
  let netto = blizko(sucet, bezDph);
  let brutto = !netto && blizko(sucet, sDph);
  if (!netto && !brutto && (blizko(-sucet, bezDph) || blizko(-sucet, sDph))) {
    otoc = -1;
    netto = blizko(-sucet, bezDph);
    brutto = !netto;
  }
  if (!netto && !brutto) return null;
  const surove = items.map((x) => {
    const sadzba = Number(x.vat_rate) || 0;
    const pdp = jePdp(x, p);
    const t = otoc * suma(x);
    // Nezaokrúhlený základ — zaokrúhli sa až za sadzbu.
    const zaklad = netto || pdp ? t : t / (1 + sadzba / 100);
    return { x, sadzba, pdp, t, zaklad };
  });
  const out: PolozkaPrijatej[] = surove.map(({ x, sadzba, pdp, zaklad }) => ({
    nazov: String(x.name).trim(),
    mnozstvo: Math.abs(Number(x?.quantity ?? 1)) || 1,
    mj: x?.unit ? String(x.unit) : null,
    cena: 0,
    sadzba,
    zaklad: r2(zaklad),
    dph: 0,
    pdp,
    predkontacia: x?.predkontacia ? String(x.predkontacia) : null,
    clenenie: x?.clenenie ? String(x.clenenie) : null,
    kv: String(x?.kv ?? x?.kv_clenenie ?? "").trim() || null,
    ...(typeof x?.vat_category === "string" && x.vat_category ? { vat_category: String(x.vat_category) } : {}),
  }));
  // Súčet základov za sadzbu = zaokrúhlený nezaokrúhlený súčet.
  const skupiny = new Map<string, number[]>();
  surove.forEach((s, i) => {
    const k = `${s.sadzba}|${s.pdp}`;
    skupiny.set(k, [...(skupiny.get(k) ?? []), i]);
  });
  for (const idx of skupiny.values()) {
    const ciel = r2(idx.reduce((a, i) => a + surove[i].zaklad, 0));
    const rozdiel = r2(ciel - idx.reduce((a, i) => a + out[i].zaklad, 0));
    if (rozdiel) {
      const naj = [...idx].sort((a, b) => Math.abs(out[b].zaklad) - Math.abs(out[a].zaklad))[0];
      out[naj].zaklad = r2(out[naj].zaklad + rozdiel);
    }
  }
  for (const [i, o] of out.entries()) {
    const s = surove[i];
    o.dph = o.pdp ? 0 : r2(netto ? (o.zaklad * o.sadzba) / 100 : s.t - o.zaklad);
    o.cena = r2(o.zaklad / o.mnozstvo);
  }
  // Daň dorovná položka s najväčšou daňou — na faktúre je daň zaokrúhlená po sadzbách.
  const dphFaktury = Number(p?.vat_amount ?? 0);
  const dphPoloziek = out.reduce((a, x) => a + x.dph, 0);
  const rozdiel = r2(dphFaktury - dphPoloziek);
  if (Math.abs(rozdiel) > Math.max(0.05, 0.01 * out.length)) return null;
  if (rozdiel) {
    const naj = out.filter((x) => !x.pdp).sort((a, b) => Math.abs(b.dph) - Math.abs(a.dph))[0];
    if (!naj) return null;
    naj.dph = r2(naj.dph + rozdiel);
  }
  /*
    Základ dorovná položka s najväčším základom. Ceny položiek z čítania sú
    s DPH zaokrúhlené po riadkoch a ich súčet sa od faktúry líši o pár centov
    (PALIERA 4226035034: 486,10 proti 486,08) — bez dorovnania by do
    programov išiel základ 395,20 namiesto 395,18 z faktúry a k tomu
    vymyslené zaokrúhlenie. Len keď hlavička sama sedí (základ + daň = spolu).
  */
  const zakladPoloziek = out.reduce((a, x) => a + x.zaklad, 0);
  const rozdielZakladu = r2(bezDph - zakladPoloziek);
  if (
    rozdielZakladu &&
    Math.abs(rozdielZakladu) <= tol &&
    Math.abs(bezDph + dphFaktury - sDph) <= 0.01
  ) {
    const naj = [...out].sort((a, b) => Math.abs(b.zaklad) - Math.abs(a.zaklad))[0];
    naj.zaklad = r2(naj.zaklad + rozdielZakladu);
    naj.cena = r2(naj.zaklad / naj.mnozstvo);
  }
  return out;
}

/** Riadok rozpisu prijatej faktúry po sadzbách. */
export type RiadokRozpisuPrijatej = {
  sadzba: number;
  zaklad: number;
  dph: number;
  pdp?: boolean;
  /**
   * Kategória DPH riadku (`vat_category`), keď ju doklad nesie: `out_of_scope`
   * („Nie je predmetom DPH“) do priznania ani KV nevstupuje — filtruje volajúci
   * (`ideDoPriznania` v rozpis-dph-kontrola.ts); súčty dokladu ju obsahujú.
   */
  vat_category?: string;
};

export function rozpisPrijatej(p: any): RiadokRozpisuPrijatej[] {
  // Samofaktúra má vlastné položky so sadzbami — rozpis je presný.
  if (p?.samofakturacia && Array.isArray(p.items) && p.items.length) {
    return sumySamofaktury(
      p.items.map((x: any) => prepocitajPolozku(x, Number(x.vat_rate) > 0)),
      Number(p.discount_total ?? 0),
    ).sadzby.map((x) => ({ sadzba: x.sadzba, zaklad: x.zaklad, dph: x.dan }));
  }
  const zaklad = Number(p?.amount_without_vat ?? 0);
  const dph = Number(p?.vat_amount ?? 0);
  /*
    Uložený rozpis DPH z dokladu (`vat_breakdown`, od 5. 11. 2026) — rekapitulácia
    z faktúry s kategóriou riadku, prešla kontrolou pri vyťažení alebo ju
    zadal človek. Má prednosť pred položkami (tie nevedia „Nie je predmetom
    DPH“), ale len keď sedí so sumami faktúry. Bez neho by viac sadzieb
    splynulo do jednej „priemernej“ (0 % + 23 % → 18,7 % → 19 %).
  */
  const ulozeny = Array.isArray(p?.vat_breakdown) ? (p.vat_breakdown as any[]) : null;
  if (ulozeny?.length) {
    const riadky: RiadokRozpisuPrijatej[] = ulozeny
      .map((x) => {
        const kat = typeof x?.vat_category === "string" && x.vat_category ? String(x.vat_category) : null;
        const pdp = x?.pdp === true || kat === "reverse_charge" || (!kat && celaPdp(p) && !Number(x?.dph));
        return {
          sadzba: Number(x?.sadzba) || 0,
          zaklad: r2(Number(x?.zaklad) || 0),
          dph: r2(Number(x?.dph) || 0),
          ...(pdp ? { pdp: true } : {}),
          ...(kat ? { vat_category: kat } : {}),
        };
      })
      .filter((x) => x.zaklad || x.dph);
    const sz = riadky.reduce((a, x) => a + x.zaklad, 0);
    const sd = riadky.reduce((a, x) => a + x.dph, 0);
    if (riadky.length && Math.abs(sz - zaklad) <= 0.02 + 1e-9 && Math.abs(sd - dph) <= 0.02 + 1e-9)
      return zoradPodlaSadzby(riadky, "sadzba");
  }
  // Z položiek po sadzbách (aj so zmiešaným prenesením daňovej povinnosti).
  const polozky = polozkyPrijatej(p);
  if (polozky) {
    const po = new Map<string, RiadokRozpisuPrijatej>();
    for (const x of polozky) {
      const kat = x.vat_category && x.vat_category !== "reverse_charge" ? x.vat_category : null;
      const k = `${x.sadzba}|${x.pdp}|${kat ?? ""}`;
      const r =
        po.get(k) ?? { sadzba: x.sadzba, zaklad: 0, dph: 0, ...(x.pdp ? { pdp: true } : {}), ...(kat ? { vat_category: kat } : {}) };
      r.zaklad = r2(r.zaklad + x.zaklad);
      r.dph = r2(r.dph + x.dph);
      po.set(k, r);
    }
    return zoradPodlaSadzby([...po.values()], "sadzba");
  }
  if (!zaklad && !dph) return [];
  const sadzba = zaklad ? najblizsiaSadzba((dph / zaklad) * 100, "SK") : 0;
  return [{ sadzba, zaklad: r2(zaklad), dph: r2(dph), ...(celaPdp(p) ? { pdp: true } : {}) }];
}

/** Text prijatej faktúry pre Pohodu — čo sa fakturuje. */
export function textPrijatej(p: any): string {
  return textPrijatejFaktury(p);
}

/** Riadok `purchase_invoices` → doklad pre `polozkyDokladov`. */
export function prijataAkoDoklad(p: any): Record<string, unknown> {
  const spolu = Number(p?.amount_total ?? 0);
  const doklad = prijataAkoDokladZaklad(p, spolu);
  return p?.type === "proforma" ? zalohovaAkoDoklad(doklad, spolu) : doklad;
}

/**
 * Prijatá zálohová faktúra (`type = 'proforma'`) do Pohody ako „Prijatá
 * zálohová faktúra“ (`receivedAdvanceInvoice`). Nie je daňový doklad: celá
 * suma ide bez DPH (`priceNone`), bez členenia DPH a KV (invoice.xsd:
 * „Nepoužívá se u typů Proforma a Zálohová faktura“), bez položiek a
 * rozúčtovania. Eviduje sa kvôli úhrade a odpočtu zálohy na ostrej faktúre.
 */
function zalohovaAkoDoklad(d: Record<string, unknown>, spolu: number): Record<string, unknown> {
  return {
    ...d,
    vat_breakdown: spolu ? [{ sadzba: 0, zaklad: r2(spolu), dph: 0 }] : [],
    _polozkyPrijatej: null,
    rozuctovanie: null,
    vehicle_id: null,
    pohoda_clenenie_dph: null,
    kv_clenenie: null,
    _pdp: false,
    _rezim: null,
    odpocet: null,
    _datumDph: d.issue_date,
    _typPohody: "receivedAdvanceInvoice",
    _zalohova: true,
  };
}

function prijataAkoDokladZaklad(p: any, spolu: number): Record<string, unknown> {
  return {
    id: p.id,
    company_id: p.company_id,
    supplier_name: p.supplier_name,
    supplier_ico: p.supplier_ico,
    supplier_ic_dph: p.supplier_ic_dph,
    supplier_dic: p.supplier_dic,
    supplier_street: p.supplier_street,
    supplier_city: p.supplier_city,
    supplier_zip: p.supplier_zip,
    supplier_country: p.supplier_country,
    supplier_email: p.supplier_email ?? null,
    // Zdroj dokladu — eFaktúra nesie úplné údaje dodávateľa v XML (`dodavateliaPrijatych`).
    source: p.source ?? null,
    document_number: p.invoice_number,
    issue_date: p.issue_date,
    currency: p.currency,
    payment_method: p.payment_method,
    note: p.note,
    category: p.category,
    pohoda_predkontacia: p.pohoda_predkontacia,
    pohoda_clenenie_dph: p.pohoda_clenenie_dph,
    rozuctovanie: p.rozuctovanie,
    job_id: p.job_id,
    // Vozidlo s odpočtom 50 % rozúčtuje faktúru na časť s odpočtom a bez neho.
    vehicle_id: p.vehicle_id ?? null,
    stredisko: p.stredisko,
    cinnost: p.cinnost,
    pohoda_rad: p.pohoda_rad,
    int_poznamka: p.int_poznamka,
    kv_clenenie: p.kv_clenenie,
    file_path: p.file_path,
    pdf_token: p.pdf_token,
    // Verzia opravy — po vrátení z Pohody ide doklad pod novým id (kontrola duplicity).
    pohoda_verzia: p.pohoda_verzia,
    total_amount: spolu,
    vat_breakdown: rozpisPrijatej(p),
    _povodneCislo: p.invoice_number,
    // Položky pre Pohodu — len keď sedia so súčtami faktúry.
    _polozkyPrijatej: polozkyPrijatej(p),
    /*
      Text faktúry v Pohode je popis plnenia, nie názov dodávateľa (ten je
      v adrese): text nad položkami, inak názvy položiek, inak číslo faktúry.
    */
    _text: textPrijatej(p),
    // Bez predmetu aj položiek ide len „Faktúra č.“ — export ho nahradí názvami z eFaktúry.
    _textBezPopisu: !maPopisPrijatej(p),
    // Účet dodávateľa — Pohoda ho dá na príkaz na úhradu.
    _ucetDodavatela: p.supplier_iban,
    _symVar: p.variable_symbol,
    _symConst: p.constant_symbol,
    _symSpec: p.specific_symbol,
    _objednavka: p.order_number,
    _dodaciList: p.delivery_note_number,
    // Kurz ECB (jednotky meny za 1 €) — bez neho sa faktúra v cudzej mene do Pohody nevyvezie.
    _kurz: p.exchange_rate,
    _datumDph: p.delivery_date || p.issue_date,
    // Kedy faktúra do firmy prišla — pre voľbu dátumu zápisu a odpočtu.
    _datumDorucenia: p.received_date || String(p.created_at ?? "").slice(0, 10) || null,
    // Skutočný dátum prijatia — odpočet DPH nebude skôr (neskorší z DUZP a prijatia).
    _datumPrijatia: p.received_date || null,
    // Samozdanenie: odpočet aj daň v období dodania, prijatie ho neposúva.
    _samozdanenie: jeSamozdanenie(p) || Boolean(celaPdp(p)),
    // Partner v adresári — pre párovanie s kartou v Pohode (voľba firmy).
    customer_id: p.customer_id ?? null,
    _splatnost: p.due_date,
    _typPohody: spolu < 0 || p.opravuje_cislo ? "receivedCreditNotice" : "receivedInvoice",
    // Číslo faktúry, ktorú dobropis opravuje — SK Pohoda ho chce v „Pôvodné číslo dokladu".
    _opravujeCislo: p.opravuje_cislo,
    // Dobropis: oprava odpočtu v období, keď ho firma dostala (ako výkazy Faktera).
    _datumUplatnenia: p.received_date || p.issue_date || p.delivery_date || null,
    // Režim DPH (dovoz, nadobudnutie z EÚ…) — podľa neho sa odvodí členenie KV.
    _rezim: p.dph_rezim ?? null,
    // Nárok na odpočet DPH; `false` = Faktero DPH do výkazu nezapočíta.
    odpocet: p.odpocet,
    // Celá faktúra v prenesení — hlavička dostane členenie pre prenesenie a KV B.1.
    _pdp: celaPdp(p),
    // Zaúčtovaná vo Fakteri — pred odovzdaním musí mať predkontáciu aj členenie.
    _zauctovane: Boolean(p.zauctovane_at),
    // Odberateľ na doklade je iná firma — do Pohody nejde, kým to človek nepotvrdí.
    _odberatelNesedi: Boolean(p.odberatel_nesedi),
    // Duplicitná faktúra (doplní `oznacDuplicity`) — do Pohody nejde.
    _duplicita: p._duplicita ?? null,
  };
}
