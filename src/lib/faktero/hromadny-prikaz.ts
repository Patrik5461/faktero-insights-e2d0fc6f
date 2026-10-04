/*
  Hromadný príkaz na úhradu — súbor SEPA `pain.001.001.03`, ktorý sa nahrá do
  internetbankingu a zaplatí naraz viac prijatých faktúr.

  Verzia `.03` je zámerne staršia: prijímajú ju všetky slovenské a české banky
  (SLSP, VÚB, Tatra banka, ČSOB, Fio…), kým novšiu `.09` zatiaľ len niektoré.
  Súbor pokryje aj banky, na ktoré Faktero nemá napojenie cez API.

  Symboly sa podľa slovenskej konvencie zapisujú do `EndToEndId` ako
  `/VS…/SS…/KS…` — tak ich banka ukáže príjemcovi vo výpise a jeho párovanie
  (aj to vo Fakteri) podľa nich spozná, čo bolo zaplatené.
*/
import { upravIban } from "./platobny-ucet";

export type FakturaNaUhradu = {
  id: string;
  invoice_number: string | null;
  supplier_name: string | null;
  supplier_iban: string | null;
  amount_total: number | string | null;
  currency: string | null;
  due_date: string | null;
  status: string | null;
  payment_method?: string | null;
  variable_symbol?: string | null;
  specific_symbol?: string | null;
  constant_symbol?: string | null;
};

export type Platba = {
  id: string;
  cisloFaktury: string;
  prijemca: string;
  iban: string;
  suma: number;
  splatnost: string | null;
  vs: string;
  ss: string;
  ks: string;
};

export type Preskocena = { id: string; cisloFaktury: string; dovod: string };

/*
  Variabilný symbol. Bez neho sa vezme číslo faktúry — ale len keď je celé
  z číslic. Z „FA-2026/42" by vyskladané číslice dali symbol, ktorý dodávateľ
  nikdy nevystavil, a platbu by spároval s inou faktúrou alebo s ničím.
*/
function variabilnySymbol(f: FakturaNaUhradu): string {
  const zadany = iba(f.variable_symbol, 10);
  if (zadany) return zadany;
  const cislo = String(f.invoice_number ?? "").replace(/\s/g, "");
  return /^\d{1,10}$/.test(cislo) ? cislo : "";
}

/** Spôsoby úhrady, pri ktorých sa už nič neposiela — zaplatené na mieste. */
const ZAPLATENE_NA_MIESTE = new Set(["hotovost", "karta", "dobierka", "zapocet"]);

const iba = (v: string | null | undefined, n: number) =>
  String(v ?? "")
    .replace(/\D/g, "")
    .slice(0, n);

/**
 * Z vybraných faktúr vyberie tie, ktoré sa dajú poslať, a pri ostatných povie
 * prečo nie. Nič sa nevynecháva potichu — človek by inak zaplatil menej, než
 * si myslí.
 */
export function pripravPlatby(faktury: FakturaNaUhradu[]): {
  platby: Platba[];
  preskocene: Preskocena[];
} {
  const platby: Platba[] = [];
  const preskocene: Preskocena[] = [];
  for (const f of faktury) {
    const cisloFaktury = f.invoice_number || "bez čísla";
    const skip = (dovod: string) => preskocene.push({ id: f.id, cisloFaktury, dovod });
    if (f.status === "paid") {
      skip("už je zaplatená");
      continue;
    }
    if (f.status === "cancelled") {
      skip("je stornovaná");
      continue;
    }
    if (f.payment_method && ZAPLATENE_NA_MIESTE.has(f.payment_method)) {
      skip("bola zaplatená hotovosťou alebo kartou");
      continue;
    }
    const mena = (f.currency || "EUR").toUpperCase();
    if (mena !== "EUR") {
      skip(`je v mene ${mena} — SEPA príkaz platí len v eurách`);
      continue;
    }
    const iban = upravIban(f.supplier_iban ?? "");
    if (!iban) {
      skip(f.supplier_iban ? "IBAN dodávateľa nie je platný" : "chýba IBAN dodávateľa");
      continue;
    }
    const suma = Math.round(Number(f.amount_total ?? 0) * 100) / 100;
    if (!(suma > 0)) {
      skip("suma na úhradu nie je kladná");
      continue;
    }
    platby.push({
      id: f.id,
      cisloFaktury,
      prijemca: f.supplier_name || "Dodávateľ",
      iban,
      suma,
      splatnost: f.due_date,
      vs: variabilnySymbol(f),
      ss: iba(f.specific_symbol, 10),
      ks: iba(f.constant_symbol, 4),
    });
  }
  return { platby, preskocene };
}

/*
  SEPA pripúšťa len základnú latinku. Diakritiku niektoré banky prijmú, iné
  celý súbor odmietnu — preto sa odstraňuje vždy a zvyšok mimo povolenej sady
  sa nahradí medzerou.
*/
export function sepaText(v: string, max: number): string {
  const t = v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, max).trim();
}

const xml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** `/VS123/SS/KS0308` — prázdne symboly sa vynechajú; bez žiadneho `NOTPROVIDED`. */
export function endToEndId(p: Pick<Platba, "vs" | "ss" | "ks">): string {
  const casti = [p.vs && `/VS${p.vs}`, p.ss && `/SS${p.ss}`, p.ks && `/KS${p.ks}`].filter(Boolean);
  return casti.length ? casti.join("").slice(0, 35) : "NOTPROVIDED";
}

export type Platitel = { meno: string; iban: string; bic?: string | null };

export type NastaveniePrikazu = {
  platitel: Platitel;
  /** Najskorší dátum úhrady (RRRR-MM-DD). */
  datum: string;
  /** `true` = každá faktúra až v deň splatnosti (nie skôr než `datum`). */
  podlaSplatnosti: boolean;
  /** Na skúšky; inak teraz. */
  vytvorene?: Date;
};

/** Dátum, ktorým banka faktúru odošle. */
export function datumUhrady(p: Platba, n: Pick<NastaveniePrikazu, "datum" | "podlaSplatnosti">) {
  if (!n.podlaSplatnosti || !p.splatnost || p.splatnost <= n.datum) return n.datum;
  return p.splatnost;
}

const suma2 = (n: number) => n.toFixed(2);

export function zostavPain001(platby: Platba[], n: NastaveniePrikazu): string {
  if (!platby.length) throw new Error("Žiadna faktúra sa nedá zaplatiť príkazom.");
  const iban = upravIban(n.platitel.iban);
  if (!iban) throw new Error("IBAN účtu, z ktorého sa platí, nie je platný.");
  const vytvorene = n.vytvorene ?? new Date();
  const msgId = `FAKTERO-${vytvorene.toISOString().replace(/\D/g, "").slice(0, 14)}`;
  const celkom = platby.reduce((s, p) => s + Math.round(p.suma * 100), 0) / 100;
  const meno = sepaText(n.platitel.meno, 70) || "Platitel";
  const bic = (n.platitel.bic ?? "").replace(/\s/g, "").toUpperCase();
  const agentPlatitela = /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic)
    ? `<FinInstnId><BIC>${bic}</BIC></FinInstnId>`
    : `<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`;

  // Banka berie jeden dátum na blok, tak sa platby zoskupia podľa dňa úhrady.
  const bloky = new Map<string, Platba[]>();
  for (const p of platby) {
    const d = datumUhrady(p, n);
    bloky.set(d, [...(bloky.get(d) ?? []), p]);
  }

  const pmtInf = [...bloky.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([datum, zoznam], i) => {
      const sucet = zoznam.reduce((s, p) => s + Math.round(p.suma * 100), 0) / 100;
      const tx = zoznam
        .map(
          (p) => `      <CdtTrfTxInf>
        <PmtId><EndToEndId>${xml(endToEndId(p))}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${suma2(p.suma)}</InstdAmt></Amt>
        <Cdtr><Nm>${xml(sepaText(p.prijemca, 70) || "Prijemca")}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${p.iban}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${xml(sepaText(`Faktura ${p.cisloFaktury}`, 140))}</Ustrd></RmtInf>
      </CdtTrfTxInf>`,
        )
        .join("\n");
      return `    <PmtInf>
      <PmtInfId>${msgId}-${i + 1}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>false</BtchBookg>
      <NbOfTxs>${zoznam.length}</NbOfTxs>
      <CtrlSum>${suma2(sucet)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${datum}</ReqdExctnDt>
      <Dbtr><Nm>${xml(meno)}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${iban}</IBAN></Id><Ccy>EUR</Ccy></DbtrAcct>
      <DbtrAgt>${agentPlatitela}</DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
${tx}
    </PmtInf>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${vytvorene.toISOString().slice(0, 19)}</CreDtTm>
      <NbOfTxs>${platby.length}</NbOfTxs>
      <CtrlSum>${suma2(celkom)}</CtrlSum>
      <InitgPty><Nm>${xml(meno)}</Nm></InitgPty>
    </GrpHdr>
${pmtInf}
  </CstmrCdtTrfInitn>
</Document>
`;
}
