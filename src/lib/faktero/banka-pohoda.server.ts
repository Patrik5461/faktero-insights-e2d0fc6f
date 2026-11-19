/*
  Bankové pohyby do POHODY — načítanie z databázy (ručné „XML pre POHODU“,
  konektor a mesačný balík). Mapovanie a výber sú v `banka-pohoda.ts`.
*/
import type { VypisPohyb } from "./export.server";
import {
  skratkaUctuVPohode,
  cisloVypisuZDatumu,
  datumVypisuSkupiny,
  hlaskaBezSkratky,
  nazovUctu,
  koniecMesiaca,
  nastaveniaBankyPohody,
  pohybZTransakcie,
  poradieVMesiaci,
  poradiePokracovanim,
  vyberPohybovBanky,
  zarovnaneCislaVypisu,
  likvidaciePreSkupiny,
  NOVY_FORMAT_VYPISU_OD,
  PRAVIDLO_PAROVANIA_ID,
  type DokladPohybu,
  type SkupinaBanky,
  type TransakciaBanky,
  type UcetBanky,
} from "./banka-pohoda";

type Klient = any;

/** Stĺpce pohybu, ktoré idú do POHODY. */
export const STLPCE_POHYBU =
  "id, bank_account_id, booking_date, amount, currency, variable_symbol, counterparty, counterparty_iban, description, created_at, exported_at, matched_invoice_id, matched_purchase_invoice_id";

/**
 * Faktúry spárované s pohybmi (vydané FV, prijaté FP) — pohyb bez partnera,
 * VS či textu si ich vezme z faktúry (`pohybZTransakcie`). Kľúč je id pohybu.
 */
export async function dokladyPohybov(supabase: Klient, txs: TransakciaBanky[]): Promise<Map<string, DokladPohybu>> {
  const out = new Map<string, DokladPohybu>();
  const idsFv = [...new Set(txs.map((t) => t.matched_invoice_id).filter(Boolean).map(String))];
  const idsFp = [...new Set(txs.map((t) => t.matched_purchase_invoice_id).filter(Boolean).map(String))];
  if (!idsFv.length && !idsFp.length) return out;
  const [fv, fp] = await Promise.all([
    idsFv.length
      ? supabase.from("invoices").select("id, invoice_number, variable_symbol, customer_name").in("id", idsFv)
      : { data: [] },
    idsFp.length
      ? supabase.from("purchase_invoices").select("id, invoice_number, variable_symbol, supplier_name").in("id", idsFp)
      : { data: [] },
  ]);
  const vydane = new Map(((fv?.data ?? []) as any[]).map((f) => [String(f.id), f]));
  const prijate = new Map(((fp?.data ?? []) as any[]).map((f) => [String(f.id), f]));
  for (const t of txs) {
    const v = t.matched_invoice_id ? vydane.get(String(t.matched_invoice_id)) : null;
    const pr = !v && t.matched_purchase_invoice_id ? prijate.get(String(t.matched_purchase_invoice_id)) : null;
    if (v) out.set(String(t.id), { typ: "FV", cislo: v.invoice_number ?? null, vs: v.variable_symbol ?? null, partner: v.customer_name ?? null });
    else if (pr)
      out.set(String(t.id), { typ: "FP", cislo: pr.invoice_number ?? null, vs: pr.variable_symbol ?? null, partner: pr.supplier_name ?? null });
  }
  return out;
}

/** Aktívne pravidlá automatického účtovania pre banku. */
export async function pravidlaBanky(supabase: Klient, companyId: string): Promise<any[]> {
  const { data } = await supabase
    .from("pravidla_uctovania")
    .select("*")
    .eq("company_id", companyId)
    .eq("druh", "banka")
    .eq("aktivne", true);
  return (data ?? []) as any[];
}

/**
 * Účet v cudzej mene (V10): každý pohyb dostane kurz ku dňu zaúčtovania
 * podľa pravidla krajiny firmy (SK: ECB zo dňa predtým, § 24 ZoÚ; CZ: ČNB
 * v ten deň) — ten istý zdroj ako faktúry. Keď kurz nie je, POHODA si ho
 * doplní z kurzového lístka.
 */
export async function menaAKurzy(
  company: any,
  menaUctuSurova: unknown,
  dni: string[],
): Promise<{ menaUctu: string; kurzy: Map<string, number | null> }> {
  const { domacaMena, krajinaKurzu } = await import("./kurzy");
  const domaca = domacaMena(company?.country);
  const menaUctu = String(menaUctuSurova ?? "").trim().toUpperCase() || domaca;
  const kurzy = new Map<string, number | null>();
  if (menaUctu !== domaca) {
    const { kurzPreDoklad } = await import("./kurzy.server");
    for (const den of [...new Set(dni)]) {
      const k = await kurzPreDoklad(menaUctu, den, krajinaKurzu(company?.country)).catch(() => null);
      kurzy.set(den, k?.kurz ?? null);
    }
  }
  return { menaUctu, kurzy };
}

/** Pohyby z databázy ako pohyby výpisu (pravidlá, označenie, kurz). */
export async function pohybyPrePohodu(
  company: any,
  ucet: UcetBanky,
  txs: TransakciaBanky[],
  pravidla: any[],
  poradie?: Map<string, number>,
  doklady?: Map<string, DokladPohybu>,
): Promise<{ pohyby: VypisPohyb[]; menaUctu: string }> {
  const { menaUctu, kurzy } = await menaAKurzy(
    company,
    ucet.currency,
    txs.map((t) => String(t.booking_date)),
  );
  const pohyby = txs.map((t) =>
    pohybZTransakcie(t, {
      pravidla,
      iban: ucet.iban,
      kurz: kurzy.get(String(t.booking_date)) ?? null,
      poradie: poradie?.get(String(t.id)) ?? null,
      doklad: doklady?.get(String(t.id)) ?? null,
    }),
  );
  return { pohyby, menaUctu };
}

/**
 * Ručné „XML pre POHODU“ jedného výpisu — presne to, čo robila funkcia vo
 * `vypis-pohoda-xml.functions.ts` (overené v POHODE).
 *
 * Od obdobia `NOVY_FORMAT_VYPISU_OD`: čísla zarovnané (`010/0001`, okrem
 * mesiaca, ktorý konektor už odovzdal po starom) a za pohybmi automatická
 * likvidácia ako v dávke konektora. Staršie obdobia ostávajú, ako boli.
 */
export async function xmlVypisuPrePohodu(vstup: {
  company: any;
  ucet: UcetBanky;
  txs: TransakciaBanky[];
  pravidla: any[];
  banka: string;
  periodEnd: string;
  /** Spárované faktúry (`dokladyPohybov`). */
  doklady?: Map<string, DokladPohybu>;
  /** Dnešok `YYYY-MM-DD` (test); inak dnes v Bratislave. */
  dnes?: string;
}): Promise<string> {
  const { pohyby, menaUctu } = await pohybyPrePohodu(
    vstup.company,
    vstup.ucet,
    vstup.txs,
    vstup.pravidla,
    undefined,
    vstup.doklady,
  );
  const { buildPohodaBankXml, polozkyAutomatickejLikvidacie } = await import("./export.server");
  const mesiac = String(vstup.periodEnd).slice(0, 7);
  const zarovnane = zarovnaneCislaVypisu(
    mesiac,
    vstup.txs.map((t) => t.exported_at),
  );
  let likvidacia = "";
  if (mesiac >= NOVY_FORMAT_VYPISU_OD && vstup.txs.length) {
    const dnes = vstup.dnes ?? (await import("./datum-vystavenia")).dnesBratislava();
    // Filter likvidácie ide na dátum výpisu (koniec obdobia) — musí byť v rozsahu.
    const doDna = dnes >= vstup.periodEnd ? dnes : String(vstup.periodEnd);
    likvidacia = polozkyAutomatickejLikvidacie(
      likvidaciePreSkupiny([{ skratka: vstup.banka, mesiac, transakcie: vstup.txs }], doDna),
      PRAVIDLO_PAROVANIA_ID,
    );
  }
  return buildPohodaBankXml({
    company: vstup.company as never,
    pohyby,
    datumVypisu: vstup.periodEnd,
    /*
      Číslo výpisu = mesiac (výpisy zostavené Fakterom sú mesačné), poradie
      pohybu ide do `numberMovement`. Predtým sa neposielalo vôbec.
    */
    cisloVypisu: cisloVypisuZDatumu(vstup.periodEnd, zarovnane),
    zarovnatPoradie: zarovnane,
    ucet: vstup.ucet.iban,
    mena: menaUctu,
    nastavenia: nastaveniaBankyPohody(vstup.company, vstup.banka),
    likvidacia,
  });
}

/**
 * Položky skupín (účet × mesiac) pre dávku konektora či balík. Číslo výpisu
 * je mesiac, dátum výpisu koniec mesiaca (najneskôr dnes) a poradie pohybu
 * poradie v mesačnom výpise účtu — pri celom mesiaci teda to isté, čo dá
 * ručné „XML pre POHODU“ za ten mesiac.
 */
export async function polozkySkupinBanky(
  supabase: Klient,
  company: any,
  skupiny: SkupinaBanky[],
  pravidla: any[],
  dnes: string,
): Promise<string> {
  const { polozkyBankovehoVypisu } = await import("./export.server");
  const { vsetkyRiadky } = await import("./strankovanie");
  let out = "";
  for (const s of skupiny) {
    const odMes = `${s.mesiac}-01`;
    const doMes = koniecMesiaca(odMes);
    const mesiac = await vsetkyRiadky<{ id: string; booking_date: string; exported_at: string | null; created_at: string | null }>((zac, kon) =>
      supabase
        .from("bank_transactions")
        .select("id, booking_date, exported_at, created_at")
        .eq("bank_account_id", s.ucet.id)
        .gte("booking_date", odMes)
        .lte("booking_date", doMes)
        .order("booking_date", { ascending: true })
        .order("id", { ascending: true })
        .range(zac, kon),
    );
    const poradie = poradiePokracovanim(mesiac);
    /*
      Zarovnané čísla (010/0001) len pre mesiac, z ktorého po starom ešte nič
      neodišlo — odovzdaný pohyb sa nikdy neprečísluje (banka-pohoda.ts).
    */
    const zarovnane = zarovnaneCislaVypisu(
      s.mesiac,
      mesiac.map((t) => t.exported_at),
    );
    const doklady = await dokladyPohybov(supabase, s.transakcie);
    const { pohyby, menaUctu } = await pohybyPrePohodu(company, s.ucet, s.transakcie, pravidla, poradie, doklady);
    out += polozkyBankovehoVypisu({
      company: company as never,
      pohyby,
      datumVypisu: datumVypisuSkupiny(s.mesiac, dnes),
      cisloVypisu: cisloVypisuZDatumu(odMes, zarovnane),
      zarovnatPoradie: zarovnane,
      ucet: s.ucet.iban,
      mena: menaUctu,
      nastavenia: nastaveniaBankyPohody(company, s.skratka),
    });
  }
  return out;
}

/** Účty firmy a skratky z Firma → Bankové účty. */
export async function uctyASkratky(
  supabase: Klient,
  companyId: string,
): Promise<{ ucty: UcetBanky[]; skratkyFirmy: { iban: string | null; pohoda_skratka: string | null }[] }> {
  const [{ data: ucty }, { data: skratky }] = await Promise.all([
    supabase.from("bank_accounts").select("id, iban, currency, account_name").eq("company_id", companyId),
    supabase.from("company_bank_accounts").select("iban, pohoda_skratka").eq("company_id", companyId),
  ]);
  return { ucty: (ucty ?? []) as UcetBanky[], skratkyFirmy: (skratky ?? []) as any[] };
}

export type BankaPreDavku = {
  /** Hotové `dataPackItem` (prázdny reťazec = nič). */
  entries: string;
  /** Odoslané pohyby (id = `bank_transactions.id`, verzia = vznik pohybu). */
  zaznamy: { id: string; verzia: string | null }[];
  /** Hlášky k účtom bez skratky. */
  hlasky: string[];
  /** Odoslané výpisy (účet × mesiac) — z nich konektor skladá automatickú likvidáciu. */
  skupiny: SkupinaBanky[];
};

/**
 * Bankové pohyby do dávky konektora alebo balíka (`companies.pohoda_posielat_banku`).
 * Vypnuté = nič; účty bez skratky v POHODE sa preskočia s hláškou.
 */
export async function bankaPreDavku(
  supabase: Klient,
  vstup: {
    company: any;
    od: string;
    /** Horná hranica dňa (bez nej) — balík za mesiac. */
    doDna?: string | null;
    naCeste?: Set<string>;
    strop?: number;
    ajOdovzdane?: boolean;
    /** Prelom rokov — ktoré pohyby patria do tejto databázy POHODY. */
    filter?: (t: TransakciaBanky) => boolean;
    dnes: Date;
  },
): Promise<BankaPreDavku> {
  const prazdne: BankaPreDavku = { entries: "", zaznamy: [], hlasky: [], skupiny: [] };
  const company = vstup.company;
  if (!company?.pohoda_posielat_banku) return prazdne;
  const { ucty, skratkyFirmy } = await uctyASkratky(supabase, company.id);
  if (!ucty.length) return prazdne;
  const { vsetkyRiadky } = await import("./strankovanie");
  const strop = vstup.strop ?? Infinity;
  const txs = await vsetkyRiadky<TransakciaBanky>((zac, kon) => {
    let q = supabase
      .from("bank_transactions")
      .select(STLPCE_POHYBU)
      .eq("company_id", company.id)
      .in(
        "bank_account_id",
        ucty.map((u) => u.id),
      )
      .gte("booking_date", vstup.od);
    if (vstup.doDna) q = q.lt("booking_date", vstup.doDna);
    if (!vstup.ajOdovzdane) q = q.is("exported_at", null);
    return q.order("booking_date", { ascending: true }).order("id", { ascending: true }).range(zac, kon);
  });
  const { skupiny, bezSkratky } = vyberPohybovBanky({
    zapnute: true,
    ucty,
    skratkyFirmy,
    pohodaBanka: company.pohoda_banka,
    transakcie: vstup.filter ? txs.filter(vstup.filter) : txs,
    naCeste: vstup.naCeste,
    od: vstup.od,
    doDna: vstup.doDna,
    ajOdovzdane: vstup.ajOdovzdane,
    strop,
  });
  const hlasky = bezSkratky.map(hlaskaBezSkratky);
  if (!skupiny.length) return { ...prazdne, hlasky };
  const dnes = vstup.dnes.toISOString().slice(0, 10);
  const entries = await polozkySkupinBanky(supabase, company, skupiny, await pravidlaBanky(supabase, company.id), dnes);
  return {
    entries,
    zaznamy: skupiny.flatMap((s) => s.transakcie.map((t) => ({ id: String(t.id), verzia: t.created_at ?? null }))),
    hlasky,
    skupiny,
  };
}

/** Pre Kontrolu Pohody: koľko pohybov čaká a názvy účtov bez skratky (s neodoslanými pohybmi). */
export async function stavBankyPreKontrolu(
  supabase: Klient,
  company: any,
  od: string,
): Promise<{ cakaju: number; bezSkratky: string[] }> {
  const { ucty, skratkyFirmy } = await uctyASkratky(supabase, company.id);
  const soSkratkou: string[] = [];
  const bez: UcetBanky[] = [];
  for (const u of ucty) {
    if (skratkaUctuVPohode(u, skratkyFirmy, company.pohoda_banka, ucty.length)) soSkratkou.push(u.id);
    else bez.push(u);
  }
  let cakaju = 0;
  if (soSkratkou.length) {
    const { count } = await supabase
      .from("bank_transactions")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .in("bank_account_id", soSkratkou)
      .is("exported_at", null)
      .gte("booking_date", od);
    cakaju = count ?? 0;
  }
  const bezSkratky: string[] = [];
  for (const u of bez) {
    const { count } = await supabase
      .from("bank_transactions")
      .select("id", { count: "exact", head: true })
      .eq("bank_account_id", u.id)
      .is("exported_at", null)
      .gte("booking_date", od);
    if (count) bezSkratky.push(nazovUctu(u));
  }
  return { cakaju, bezSkratky };
}
