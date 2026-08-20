/**
 * Vlastné mesačné výpisy pre účty, pre ktoré Tatra banka výpis nevydá.
 *
 * Premium API agreguje aj účty vedené v iných bankách, ale výpis k nim
 * neposkytne (odpovie `PRODUCT_UNKNOWN`). Transakcie k nim však máme, takže
 * výpis zostavíme sami — v rovnakých formátoch ako banka, aby sa obe cesty
 * v aplikácii správali rovnako: PDF na čítanie a camt.053 XML na import
 * do účtovníctva.
 *
 * Zostatky banka pre tieto účty po dňoch nedáva, preto ich dopočítavame
 * spätne z aktuálneho zostatku a známych transakcií:
 *   konečný  = aktuálny zostatok − obraty po konci obdobia
 *   počiatočný = konečný − obrat za obdobie
 * To platí, len kým máme transakcie za celé obdobie od jeho začiatku; keď ich
 * nemáme, výpis nezostavíme, lebo by tiché diery vyzerali ako fakt.
 */

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { RobotoRegularBase64 } from "./fonts/Roboto-Regular";
import { RobotoBoldBase64 } from "./fonts/Roboto-Bold";
import { previousMonth } from "./bank-statements.server";

const BUCKET = "bank-statements";

/** Poznámka, ktorá musí byť na výpise vidieť — nejde o doklad vydaný bankou. */
export const DISCLAIMER =
  "Tento výpis zostavilo Faktero z transakcií načítaných z banky. " +
  "Nejde o oficiálny výpis vydaný bankou a nemusí obsahovať položky, " +
  "ktoré banka do prehľadu transakcií neposiela (napr. niektoré poplatky).";

export type OwnStatementTx = {
  booking_date: string;
  amount: number;
  currency: string | null;
  variable_symbol: string | null;
  counterparty: string | null;
  description: string | null;
  transaction_reference: string | null;
  /**
   * Účel platby (`Purp`) — čím platba je. ISO 20022 má na to vlastné pole;
   * `cd` je kód z číselníka, `prtry` vlastné označenie tam, kde kód neexistuje.
   */
  purpose?: { cd?: string; prtry?: string } | null;
};

export type OwnStatementInput = {
  company: {
    name: string;
    ico?: string | null;
    street?: string | null;
    zip?: string | null;
    city?: string | null;
    country?: string | null;
  };
  account: { iban: string | null; account_name: string | null; currency: string };
  periodStart: string;
  periodEnd: string;
  transactions: OwnStatementTx[];
  opening: number;
  closing: number;
  /** Pevný čas vzniku dokumentu; vlastný parameter kvôli testovateľnosti. */
  createdAt?: string;
  /**
   * Poznámka na výpise. Vlastné mesačné výpisy musia povedať, že ich nevydala
   * banka; výpis prepísaný z PDF je opačný prípad — vydala ho banka a človek
   * ho len prepísal, takže si žiada vlastnú vetu.
   */
  note?: string | null;
  /** Poradové číslo výpisu z papiera. Bez neho ide do `ElctrncSeqNb` nula. */
  sequenceNumber?: number | null;
};

/* ------------------------------------------------------------------ výpočty */

export type Summary = {
  opening: number;
  closing: number;
  credits: number;
  debits: number;
  creditCount: number;
  debitCount: number;
};

/** Zaokrúhlenie na centy — bráni tomu, aby sa v súčtoch nazbierala chyba float. */
function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Dopočíta počiatočný a konečný zostatok z aktuálneho zostatku účtu.
 * `after` sú obraty zaúčtované po konci obdobia, `inPeriod` obraty v ňom.
 */
export function computeBalances(
  currentBalance: number,
  inPeriod: Array<{ amount: number }>,
  after: Array<{ amount: number }>,
): Summary {
  const sumAfter = cents(after.reduce((s, t) => s + t.amount, 0));
  const closing = cents(currentBalance - sumAfter);
  const credits = cents(inPeriod.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0));
  const debits = cents(inPeriod.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0));
  const opening = cents(closing - cents(credits - debits));
  return {
    opening,
    closing,
    credits,
    debits,
    creditCount: inPeriod.filter((t) => t.amount > 0).length,
    debitCount: inPeriod.filter((t) => t.amount < 0).length,
  };
}

/* ---------------------------------------------------------------------- XML */

export function escapeXml(s: string): string {
  return (
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
      // Riadiace znaky XML 1.0 nepovoľuje ani ako entity.
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
  );
}

/*
  Schéma camt.053 má na väčšine textových polí hornú hranicu dĺžky a prekročiť
  ju znamená neplatný súbor — POHODA na taký odpovie, že „nezodpovedá stanovenej
  štruktúre formátu SEPA XML", a viac nepovie. Dĺžka sa preto oreže tu, na
  jednom mieste, nie pri každom volaní.
*/
function tag(name: string, value: string | null | undefined, max = 140): string {
  if (value === null || value === undefined || value === "") return "";
  return `<${name}>${escapeXml(String(value).slice(0, max))}</${name}>`;
}

/** Identifikátor smie mať 35 znakov. Orezáva sa zľava — koniec nesie obdobie. */
function id35(s: string): string {
  return s.length <= 35 ? s : s.slice(-35);
}

/** `Ctry` je dvojpísmenový kód krajiny; „Slovensko" schéma neprijme. */
function kodKrajiny(v: string | null | undefined): string {
  const s = String(v ?? "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : "SK";
}

function amt(n: number, ccy: string): string {
  return `<Amt Ccy="${escapeXml(ccy)}">${Math.abs(n).toFixed(2)}</Amt>`;
}

function balance(code: string, value: number, ccy: string, date: string): string {
  return (
    `<Bal><Tp><CdOrPrtry><Cd>${code}</Cd></CdOrPrtry></Tp>` +
    amt(value, ccy) +
    `<CdtDbtInd>${value < 0 ? "DBIT" : "CRDT"}</CdtDbtInd>` +
    `<Dt><Dt>${date}</Dt></Dt></Bal>`
  );
}

function entry(t: OwnStatementTx, ccy: string): string {
  const credit = t.amount > 0;
  const party = t.counterparty
    ? `<RltdPties>${credit ? "<Dbtr>" : "<Cdtr>"}${tag("Nm", t.counterparty)}${credit ? "</Dbtr>" : "</Cdtr>"}</RltdPties>`
    : "";
  const refs = t.variable_symbol
    ? `<Refs>${tag("EndToEndId", t.variable_symbol, 35)}</Refs>`
    : `<Refs><EndToEndId>NOTPROVIDED</EndToEndId></Refs>`;
  const rmt = t.description ? `<RmtInf>${tag("Ustrd", t.description, 140)}</RmtInf>` : "";
  // V schéme stojí `Purp` medzi stranami platby a textom — na poradí záleží.
  const purp = t.purpose?.cd
    ? `<Purp>${tag("Cd", t.purpose.cd, 4)}</Purp>`
    : t.purpose?.prtry
      ? `<Purp>${tag("Prtry", t.purpose.prtry, 35)}</Purp>`
      : "";
  const details = `<NtryDtls><TxDtls>${refs}${party}${purp}${rmt}</TxDtls></NtryDtls>`;
  return (
    "<Ntry>" +
    tag("NtryRef", t.transaction_reference, 35) +
    amt(t.amount, t.currency || ccy) +
    `<CdtDbtInd>${credit ? "CRDT" : "DBIT"}</CdtDbtInd>` +
    "<Sts>BOOK</Sts>" +
    `<BookgDt><Dt>${t.booking_date}</Dt></BookgDt>` +
    `<ValDt><Dt>${t.booking_date}</Dt></ValDt>` +
    // BkTxCd je v camt.053 povinný; vlastný kód, lebo banka nám ho neposiela.
    "<BkTxCd><Prtry><Cd>NTRF</Cd><Issr>Faktero</Issr></Prtry></BkTxCd>" +
    details +
    "</Ntry>"
  );
}

/** Zostaví výpis v schéme camt.053.001.02 — tej istej, akú posiela Tatra banka. */
export function buildCamt053(input: OwnStatementInput): string {
  const { company, account, periodStart, periodEnd, transactions } = input;
  const ccy = account.currency || "EUR";
  const created = input.createdAt ?? new Date().toISOString();
  /*
    IBAN ide do camt.053 bez medzier — schéma ich nepripúšťa a program, ktorý
    výpis načíta, by účet nespároval. Z výpisu aj z papiera pritom chodí
    zapísaný po štvoriciach.
  */
  const iban = (account.iban ?? "").replace(/\s+/g, "").toUpperCase();
  const obdobie = periodStart.slice(0, 7).replace("-", "");
  const msgId = id35(`FAK-${iban || "UCET"}-${obdobie}`);

  const net = cents(input.closing - input.opening);
  const credits = cents(transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0));
  const debits = cents(transactions.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0));

  const addr =
    company.street || company.city || company.zip
      ? `<PstlAdr>${tag("StrtNm", company.street, 70)}${tag("PstCd", company.zip, 16)}${tag("TwnNm", company.city, 35)}<Ctry>${kodKrajiny(company.country)}</Ctry></PstlAdr>`
      : "";
  const orgId = company.ico
    ? `<Id><OrgId><Othr>${tag("Id", company.ico, 35)}<SchmeNm><Prtry>ICO</Prtry></SchmeNm></Othr></OrgId></Id>`
    : "";

  return (
    '<?xml version="1.0" encoding="utf-8" standalone="yes"?>' +
    '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">' +
    "<BkToCstmrStmt>" +
    `<GrpHdr>${tag("MsgId", msgId)}<CreDtTm>${created}</CreDtTm>` +
    `<MsgRcpt>${tag("Nm", company.name)}</MsgRcpt></GrpHdr>` +
    "<Stmt>" +
    tag("Id", id35(`${iban || "UCET"}-${obdobie}`)) +
    `<ElctrncSeqNb>${Number(input.sequenceNumber) > 0 ? Math.trunc(Number(input.sequenceNumber)) : 0}</ElctrncSeqNb>` +
    `<CreDtTm>${created}</CreDtTm>` +
    `<FrToDt><FrDtTm>${periodStart}T00:00:00</FrDtTm><ToDtTm>${periodEnd}T23:59:59</ToDtTm></FrToDt>` +
    "<Acct><Id>" +
    (iban ? `<IBAN>${escapeXml(iban)}</IBAN>` : "<Othr><Id>NOTPROVIDED</Id></Othr>") +
    `</Id>${tag("Ccy", ccy)}${tag("Nm", account.account_name)}` +
    `<Ownr>${tag("Nm", company.name)}${addr}${orgId}</Ownr></Acct>` +
    balance("OPBD", input.opening, ccy, periodStart) +
    balance("CLBD", input.closing, ccy, periodEnd) +
    "<TxsSummry>" +
    `<TtlNtries><NbOfNtries>${transactions.length}</NbOfNtries>` +
    `<TtlNetNtryAmt>${Math.abs(net).toFixed(2)}</TtlNetNtryAmt>` +
    `<CdtDbtInd>${net < 0 ? "DBIT" : "CRDT"}</CdtDbtInd></TtlNtries>` +
    `<TtlCdtNtries><NbOfNtries>${transactions.filter((t) => t.amount > 0).length}</NbOfNtries><Sum>${credits.toFixed(2)}</Sum></TtlCdtNtries>` +
    `<TtlDbtNtries><NbOfNtries>${transactions.filter((t) => t.amount < 0).length}</NbOfNtries><Sum>${debits.toFixed(2)}</Sum></TtlDbtNtries>` +
    "</TxsSummry>" +
    transactions.map((t) => entry(t, ccy)).join("") +
    tag("AddtlStmtInf", input.note === undefined ? DISCLAIMER : input.note) +
    "</Stmt></BkToCstmrStmt></Document>"
  );
}

/* ---------------------------------------------------------------------- PDF */

function b64ToBytes(b64: string): Uint8Array {
  const bin =
    typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 1234.5 → "1 234,50 EUR" (slovenský zápis s pevnou medzerou) */
function fmtMoney(n: number, currency = "EUR"): string {
  const v = Number.isFinite(n) ? n : 0;
  const [int, dec] = Math.abs(v).toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${v < 0 ? "-" : ""}${grouped},${dec} ${currency}`;
}

/** "2026-07-31" → "31.07.2026" */
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Odstráni riadiace znaky, ktoré by pdf-lib nevykreslil. */
function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/[\x00-\x1F\x7F]/g, " ").trim();
}

/** Skráti text tak, aby sa zmestil do danej šírky. */
function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && font.widthOfTextAtSize(`${s}…`, size) > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 40;
const GREEN = rgb(0.06, 0.47, 0.31);
const GREY = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.85, 0.85, 0.85);

export async function buildStatementPdf(input: OwnStatementInput): Promise<Uint8Array> {
  const { company, account, periodStart, periodEnd, transactions } = input;
  const ccy = account.currency || "EUR";

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(b64ToBytes(RobotoRegularBase64), { subset: true });
  const bold = await pdf.embedFont(b64ToBytes(RobotoBoldBase64), { subset: true });

  const pages: PDFPage[] = [];
  let page = pdf.addPage([A4.w, A4.h]);
  pages.push(page);
  let y = A4.h - MARGIN;

  const text = (
    s: string,
    x: number,
    yy: number,
    opts: { size?: number; font?: PDFFont; color?: any } = {},
  ) => {
    page.drawText(s, {
      x,
      y: yy,
      size: opts.size ?? 9,
      font: opts.font ?? regular,
      color: opts.color ?? rgb(0, 0, 0),
    });
  };
  const right = (
    s: string,
    xRight: number,
    yy: number,
    opts: { size?: number; font?: PDFFont; color?: any } = {},
  ) => {
    const f = opts.font ?? regular;
    const size = opts.size ?? 9;
    text(s, xRight - f.widthOfTextAtSize(s, size), yy, opts);
  };

  // ---- hlavička
  text("VÝPIS Z ÚČTU", MARGIN, y - 10, { size: 18, font: bold, color: GREEN });
  right(company.name, A4.w - MARGIN, y - 8, { size: 11, font: bold });
  if (company.ico) right(`IČO ${company.ico}`, A4.w - MARGIN, y - 22, { size: 8, color: GREY });
  y -= 34;
  text(`za obdobie ${fmtDate(periodStart)} – ${fmtDate(periodEnd)}`, MARGIN, y, {
    size: 10,
    color: GREY,
  });
  y -= 24;

  // ---- účet a zostatky
  page.drawRectangle({
    x: MARGIN,
    y: y - 62,
    width: A4.w - 2 * MARGIN,
    height: 62,
    color: rgb(0.97, 0.98, 0.97),
  });
  text(clean(account.account_name) || "Účet", MARGIN + 12, y - 18, { size: 10, font: bold });
  text(account.iban ?? "—", MARGIN + 12, y - 32, { size: 9, color: GREY });
  text(`Mena: ${ccy}`, MARGIN + 12, y - 48, { size: 9, color: GREY });

  const colR = A4.w - MARGIN - 12;
  right("Počiatočný zostatok", colR - 110, y - 18, { size: 8, color: GREY });
  right(fmtMoney(input.opening, ccy), colR, y - 18, { size: 10 });
  right("Konečný zostatok", colR - 110, y - 34, { size: 8, color: GREY });
  right(fmtMoney(input.closing, ccy), colR, y - 34, { size: 11, font: bold, color: GREEN });
  const credits = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const debits = transactions.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  right(`Kredit ${fmtMoney(cents(credits), ccy)}`, colR, y - 50, { size: 8, color: GREY });
  right(`Debet ${fmtMoney(cents(debits), ccy)}`, colR - 150, y - 50, { size: 8, color: GREY });
  y -= 78;

  // ---- tabuľka
  const cols = { date: MARGIN, desc: MARGIN + 62, vs: A4.w - MARGIN - 190, amount: A4.w - MARGIN };
  const drawHead = () => {
    text("Dátum", cols.date, y, { size: 8, font: bold, color: GREY });
    text("Popis / Protistrana", cols.desc, y, { size: 8, font: bold, color: GREY });
    text("VS", cols.vs, y, { size: 8, font: bold, color: GREY });
    right("Suma", cols.amount, y, { size: 8, font: bold, color: GREY });
    y -= 6;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: A4.w - MARGIN, y },
      thickness: 0.7,
      color: LINE,
    });
    y -= 14;
  };
  drawHead();

  if (transactions.length === 0) {
    text("Za toto obdobie neevidujeme žiadne transakcie.", MARGIN, y, { size: 9, color: GREY });
    y -= 16;
  }

  for (const t of transactions) {
    if (y < MARGIN + 70) {
      page = pdf.addPage([A4.w, A4.h]);
      pages.push(page);
      y = A4.h - MARGIN;
      drawHead();
    }
    // Agregované účty z iných bánk často neposielajú ani protistranu, ani popis.
    // Vtedy je najužitočnejšie referencie banky — podľa nej sa dá platba dohľadať.
    const popis =
      clean(t.counterparty) ||
      clean(t.description) ||
      clean(t.transaction_reference) ||
      "Transakcia";
    const druhy = clean(t.counterparty) ? clean(t.description) : "";
    text(fmtDate(t.booking_date), cols.date, y, { size: 8.5 });
    text(fit(popis, regular, 8.5, cols.vs - cols.desc - 10), cols.desc, y, { size: 8.5 });
    if (t.variable_symbol) text(t.variable_symbol, cols.vs, y, { size: 8.5, color: GREY });
    right(fmtMoney(t.amount, t.currency || ccy), cols.amount, y, {
      size: 8.5,
      font: bold,
      color: t.amount < 0 ? rgb(0.6, 0.1, 0.1) : GREEN,
    });
    y -= 12;
    if (druhy) {
      text(fit(druhy, regular, 7.5, cols.vs - cols.desc - 10), cols.desc, y, {
        size: 7.5,
        color: GREY,
      });
      y -= 10;
    }
    y -= 2;
  }

  // ---- pätka na každej strane
  const total = pages.length;
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: MARGIN, y: MARGIN + 34 },
      end: { x: A4.w - MARGIN, y: MARGIN + 34 },
      thickness: 0.7,
      color: LINE,
    });
    const words = DISCLAIMER.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (regular.widthOfTextAtSize(next, 7) > A4.w - 2 * MARGIN - 60) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    if (line) lines.push(line);
    lines.slice(0, 3).forEach((l, k) => {
      p.drawText(l, { x: MARGIN, y: MARGIN + 22 - k * 9, size: 7, font: regular, color: GREY });
    });
    const label = `${i + 1} / ${total}`;
    p.drawText(label, {
      x: A4.w - MARGIN - regular.widthOfTextAtSize(label, 8),
      y: MARGIN + 22,
      size: 8,
      font: regular,
      color: GREY,
    });
  });

  return await pdf.save();
}

/* -------------------------------------------------------------- orchestrácia */

type GenResult = {
  period: { start: string; end: string };
  generated: number;
  skipped: number;
  errors: Array<{ account_id: string; export_type: string; error: string }>;
};

/**
 * Dogeneruje výpisy pre riadky, ktoré banka odmietla (`unsupported`), a už
 * vygenerované za to isté obdobie prepíše nanovo. Riadkov z TB sa nedotýka.
 *
 * Prepisovanie je zámerné: transakcie z cudzích bánk chodia cez agregáciu
 * s oneskorením, takže výpis za minulý mesiac sa ešte pár dní dopĺňa. Cron
 * beží denne a generovanie je lokálne, takže to nič nestojí; keď sa obdobie
 * posunie na ďalší mesiac, hotový výpis už nikto nemení.
 */
export async function generateOwnStatements(period?: {
  start: string;
  end: string;
}): Promise<GenResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { start, end } = period ?? previousMonth();

  const { data: rows } = await supabaseAdmin
    .from("bank_statements")
    .select("id, company_id, bank_account_id, export_type, status, source")
    .eq("period_start", start)
    .eq("period_end", end)
    .or("status.eq.unsupported,source.eq.faktero");

  let generated = 0;
  let skipped = 0;
  const errors: GenResult["errors"] = [];
  if (!rows?.length) return { period: { start, end }, generated, skipped, errors };

  // Podklady načítame raz na účet, nie zvlášť pre PDF a XML.
  const byAccount = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byAccount.get(r.bank_account_id) ?? [];
    list.push(r);
    byAccount.set(r.bank_account_id, list);
  }

  for (const [accountId, accountRows] of byAccount) {
    try {
      const { data: account } = await supabaseAdmin
        .from("bank_accounts")
        .select("id, company_id, iban, account_name, currency, balance, booked_balance")
        .eq("id", accountId)
        .maybeSingle();
      if (!account) throw new Error("účet neexistuje");

      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("name, ico, street, zip, city, country")
        .eq("id", account.company_id)
        .maybeSingle();

      const { data: txs } = await supabaseAdmin
        .from("bank_transactions")
        .select(
          "booking_date, amount, currency, variable_symbol, counterparty, description, transaction_reference",
        )
        .eq("bank_account_id", accountId)
        .gte("booking_date", start)
        .lte("booking_date", end)
        .order("booking_date", { ascending: true });

      const { data: after } = await supabaseAdmin
        .from("bank_transactions")
        .select("amount")
        .eq("bank_account_id", accountId)
        .gt("booking_date", end);

      // Bez transakcií siahajúcich pred začiatok obdobia nevieme povedať, či
      // ich za obdobie máme všetky — radšej výpis nevydáme, ako by mal klamať.
      const { data: earliest } = await supabaseAdmin
        .from("bank_transactions")
        .select("booking_date")
        .eq("bank_account_id", accountId)
        .order("booking_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!earliest || earliest.booking_date > start) {
        skipped += accountRows.length;
        for (const r of accountRows) {
          await supabaseAdmin
            .from("bank_statements")
            .update({
              error: `nemáme transakcie za celé obdobie (najstaršia je ${earliest?.booking_date ?? "—"})`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", r.id);
        }
        continue;
      }

      const transactions: OwnStatementTx[] = (txs ?? []).map((t: any) => ({
        booking_date: t.booking_date,
        amount: Number(t.amount),
        currency: t.currency,
        variable_symbol: t.variable_symbol,
        counterparty: t.counterparty,
        description: t.description,
        transaction_reference: t.transaction_reference,
      }));
      // Výpis je účtovný doklad, takže sa počíta zo zaúčtovaného zostatku;
      // disponibilný v sebe nesie blokácie, ktoré na výpise nie sú.
      const sums = computeBalances(
        Number(account.booked_balance ?? account.balance ?? 0),
        transactions,
        (after ?? []).map((t: any) => ({ amount: Number(t.amount) })),
      );

      const input: OwnStatementInput = {
        company: {
          name: company?.name ?? "—",
          ico: company?.ico,
          street: company?.street,
          zip: company?.zip,
          city: company?.city,
          country: company?.country,
        },
        account: {
          iban: account.iban,
          account_name: account.account_name,
          currency: account.currency,
        },
        periodStart: start,
        periodEnd: end,
        transactions,
        opening: sums.opening,
        closing: sums.closing,
      };

      for (const row of accountRows) {
        try {
          const isPdf = row.export_type === "PDF";
          const bytes = isPdf
            ? await buildStatementPdf(input)
            : new TextEncoder().encode(buildCamt053(input));
          const path = `${row.company_id}/${accountId}/${start.slice(0, 7)}-faktero.${isPdf ? "pdf" : "xml"}`;
          const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
            contentType: isPdf ? "application/pdf" : "application/xml",
            upsert: true,
          });
          if (upErr) throw new Error(`upload zlyhal: ${upErr.message}`);

          await supabaseAdmin
            .from("bank_statements")
            .update({
              status: "ready",
              source: "faktero",
              storage_path: path,
              file_size: bytes.length,
              error: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          generated++;
        } catch (e: any) {
          const msg = e?.message ?? "generate_failed";
          await supabaseAdmin
            .from("bank_statements")
            .update({
              status: "failed",
              source: "faktero",
              error: msg,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          errors.push({ account_id: accountId, export_type: row.export_type, error: msg });
        }
      }
    } catch (e: any) {
      const msg = e?.message ?? "account_failed";
      for (const r of accountRows) {
        errors.push({ account_id: accountId, export_type: r.export_type, error: msg });
      }
    }
  }

  console.log(
    `[bank-statements-own] obdobie ${start}..${end}: ${generated} vygenerovaných, ${skipped} preskočených, ${errors.length} chýb`,
  );
  return { period: { start, end }, generated, skipped, errors };
}
