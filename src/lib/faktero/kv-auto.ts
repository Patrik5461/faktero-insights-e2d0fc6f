/*
  Čo by doklad dostal v kontrolnom výkaze DPH automaticky, keď pole
  „Členenie KV DPH“ ostane prázdne — na zobrazenie vo formulároch a detailoch
  („automaticky (B2)“). Počíta sa tým istým pravidlom ako výkaz Faktera aj
  export do Pohody (`kv-urcenie.ts`), len z riadku dokladu v databáze.

  Výsledok "" = doklad do kontrolného výkazu nepatrí (zálohová faktúra, doklad
  bez DPH, bez nároku na odpočet, členenie „nezahrnovať“ …).
*/

import { kvPrijatehoDokladu, kvVystavenehoDokladu } from "./kv-urcenie";

const cislo = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const sDph = (v: unknown) => Math.abs(cislo(v)) >= 0.005;
const text = (v: unknown) => String(v ?? "").trim();

/** Prijatá faktúra (`purchase_invoices`). */
export function kvAutoPrijatej(
  r: {
    type?: string | null;
    amount_total?: unknown;
    vat_amount?: unknown;
    dph_rezim?: string | null;
    odpocet?: boolean | null;
    opravuje_cislo?: string | null;
    pohoda_clenenie_dph?: string | null;
  },
  o: { predvolene?: string | null; clenenie?: string | null } = {},
): string {
  // Zálohová faktúra nie je daňový doklad — do KV ide až daňový doklad k platbe.
  if (r.type === "proforma") return "";
  const rezim = text(r.dph_rezim) || null;
  return kvPrijatehoDokladu({
    kvDokladu: null,
    predvolene: o.predvolene ?? null,
    blocek: false,
    dobropis: cislo(r.amount_total) < 0 || Boolean(text(r.opravuje_cislo)),
    pdp: rezim === "samozdanenie",
    rezim,
    maDph: sDph(r.vat_amount),
    odpocet: r.odpocet,
    clenenieDph: text(o.clenenie) || text(r.pohoda_clenenie_dph) || null,
    nadobudnutieDoB1: true,
  });
}

/** Bloček / doklad (`expense_documents`) — hotovosť, karta aj prevod. */
export function kvAutoBlocku(
  r: {
    vat_amount?: unknown;
    vat_breakdown?: unknown;
    odpocet?: boolean | null;
    pohoda_clenenie_dph?: string | null;
  },
  o: { predvolene?: string | null; clenenie?: string | null } = {},
): string {
  const rozpis = Array.isArray(r.vat_breakdown)
    ? (r.vat_breakdown as Record<string, unknown>[])
    : [];
  const maDph =
    sDph(r.vat_amount) || rozpis.some((x) => sDph(x?.dph) || sDph(x?.vat) || sDph(x?.dan));
  return kvPrijatehoDokladu({
    kvDokladu: null,
    predvolene: o.predvolene ?? null,
    blocek: true,
    dobropis: false,
    pdp: false,
    maDph,
    odpocet: r.odpocet,
    clenenieDph: text(o.clenenie) || text(r.pohoda_clenenie_dph) || null,
  });
}

/** Vystavená faktúra, dobropis, vrubopis, daňový doklad k platbe (`invoices`). */
export function kvAutoVystavenej(
  inv: {
    type?: string | null;
    reverse_charge?: boolean | null;
    reverse_charge_type?: string | null;
    customer_country?: string | null;
    customer_ic_dph?: string | null;
    customer_ico?: string | null;
    customer_dic?: string | null;
    vat_total?: unknown;
    opravuje_fakturu_id?: string | null;
    pohoda_clenenie_dph?: string | null;
  },
  o: { predvolene?: string | null; clenenie?: string | null; krajinaFirmy?: string | null } = {},
): string {
  const typ = text(inv.type) || "regular";
  const typPrenosu = text(inv.reverse_charge_type);
  const krajina = text(inv.customer_country).toUpperCase();
  const domov = (text(o.krajinaFirmy) || "SK").toUpperCase();
  // To isté ako `jeTuzemskePdp` v pohoda-kontrola.ts.
  const tuzemskePdp = Boolean(inv.reverse_charge)
    ? typPrenosu
      ? typPrenosu === "domestic_69"
      : !krajina || krajina === domov
    : false;
  return kvVystavenehoDokladu({
    typ,
    opravny: Boolean(text(inv.opravuje_fakturu_id)),
    kvDokladu: null,
    // Predvolené firmy platí len pre bežnú faktúru a daňový doklad k platbe (ako vo výkaze).
    predvolene: typ === "regular" || typ === "advance_payment" ? (o.predvolene ?? null) : null,
    reverseCharge: Boolean(inv.reverse_charge),
    tuzemskePdp,
    maDph: sDph(inv.vat_total),
    icDphOdberatela: inv.customer_ic_dph,
    icoOdberatela: inv.customer_ico,
    dicOdberatela: inv.customer_dic,
    clenenieDph: text(o.clenenie) || text(inv.pohoda_clenenie_dph) || null,
  });
}

/**
 * Text prvej voľby výberu („automaticky (B2)“ / „automaticky — do KV
 * nepatrí“). `kod` undefined = nevie sa (napr. ešte sa nenačítali návrhy).
 * Vracia kľúč pre t() a parametre.
 */
export function popisKvAuto(kod: string | null | undefined): {
  kluc: string;
  param?: Record<string, string>;
} {
  if (kod === undefined || kod === null) return { kluc: "automaticky" };
  if (kod === "") return { kluc: "automaticky — do KV nepatrí" };
  return { kluc: "automaticky ({kod})", param: { kod } };
}

type Prekladac = (k: string, p?: Record<string, string | number>) => string;

/** Prvá voľba výberu členenia KV — čo doklad dostane, keď pole ostane prázdne. */
export function textKvAuto(t: Prekladac, kod: string | null | undefined): string {
  const { kluc, param } = popisKvAuto(kod);
  return t(kluc, param);
}

/** Členenie KV na čítanie (odovzdaný doklad): uložené, inak čo sa použije automaticky. */
export function textKv(
  t: Prekladac,
  ulozene: string | null | undefined,
  auto: string | null | undefined,
): string {
  const k = String(ulozene ?? "").trim();
  if (k) return k === "X" ? t("nezahŕňať do KV") : k;
  return textKvAuto(t, auto);
}

/**
 * Nespracovaný doklad podľa zvoleného druhu — to isté, čo dostane doklad,
 * ktorý z neho „Vytvoriť“ založí (`nespracovane.ts`: zálohová bez odpočtu,
 * prenesenie = samozdanenie). `undefined` = druh ešte nie je zvolený.
 */
export function kvAutoNespracovaneho(
  druh: string | null | undefined,
  u: {
    rozpis?: { dph?: unknown }[] | null;
    celkom?: unknown;
    opravuje?: string | null;
    prenesenie?: boolean;
  },
  o: { predvolene?: string | null; clenenie?: string | null } = {},
): string | undefined {
  const dph = (u.rozpis ?? []).reduce((a, r) => a + cislo(r?.dph), 0);
  if (druh === "blocek")
    return kvAutoBlocku({ vat_amount: dph, odpocet: true, pohoda_clenenie_dph: o.clenenie }, o);
  if (druh === "zalohova") return "";
  if (druh === "faktura" || druh === "dobropis")
    return kvAutoPrijatej(
      {
        type: "regular",
        amount_total: druh === "dobropis" ? -Math.abs(cislo(u.celkom)) || -1 : cislo(u.celkom),
        vat_amount: dph,
        dph_rezim: u.prenesenie ? "samozdanenie" : null,
        odpocet: true,
        opravuje_cislo: u.opravuje ?? null,
        pohoda_clenenie_dph: o.clenenie,
      },
      o,
    );
  return undefined;
}
