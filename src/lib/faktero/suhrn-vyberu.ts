/*
  Súčet označených dokladov pre lištu pod zoznamom („Vybrané: 3 doklady ·
  250 € / 203,25 € bez DPH · Na export do účtovníctva: … · Na úhradu: …“).

  Rovnaké pravidlá ako ostatné súčty (faktury-sumy.ts): zálohová faktúra sa do
  súčtu nepočíta — je to výzva na preddavok, nie plnenie —, dobropis odpočítava
  a rôzne meny sa nesčítavajú. Čo znamená „na export“ a „na úhradu“, povie
  každý zoznam sám; tu sa len sčítava.
*/
import { znamienkoDokladu } from "./faktury-sumy";

export type PolozkaSuhrnu = {
  /** Mena dokladu; prázdna = EUR. */
  mena?: string | null;
  /** Suma s DPH tak, ako je uložená v databáze (dobropis často záporne). */
  celkom: number | string | null | undefined;
  /** Suma bez DPH; `null`, keď ju doklad nemá (vtedy sa nesčíta ani „bez DPH“). */
  bezDph?: number | string | null;
  /** Typ podľa `invoices.type` — `credit_note` odpočítava, `proforma` sa nesčítava. */
  typ?: string | null;
  /** Doklad do súčtov nepatrí (zálohová, stornovaná…), ale vo výbere je. */
  mimoSuctu?: boolean;
  naExport?: boolean;
  naUhradu?: boolean;
};

export type SumaMeny = { mena: string; celkom: number; bezDph: number | null };

export type SuhrnVyberu = {
  pocet: number;
  /** Koľko vybraných sa do súčtu nepočíta (zálohové, stornované). */
  mimoSuctu: number;
  spolu: SumaMeny[];
  naExport: { pocet: number; sumy: SumaMeny[] };
  naUhradu: { pocet: number; sumy: SumaMeny[] };
};

/** Typy, ktoré do súčtu nepatria: zálohová a daňový doklad k prijatej platbe. */
const MIMO_SUCTU = new Set(["proforma", "advance_payment"]);

const r2 = (n: number) => Math.round(n * 100) / 100;

export function jeMimoSuctu(p: PolozkaSuhrnu): boolean {
  return !!p.mimoSuctu || MIMO_SUCTU.has(String(p.typ ?? ""));
}

/** Súčty po menách — poradie mien podľa prvého výskytu, EUR nemá prednosť. */
export function sumyPoMenach(polozky: PolozkaSuhrnu[]): SumaMeny[] {
  const po = new Map<string, { celkom: number; bezDph: number; bezDphChyba: boolean }>();
  for (const p of polozky) {
    if (jeMimoSuctu(p)) continue;
    const mena = String(p.mena || "EUR").toUpperCase();
    const z = znamienkoDokladu(p.typ, p.celkom);
    const s = po.get(mena) ?? { celkom: 0, bezDph: 0, bezDphChyba: false };
    s.celkom += z * (Number(p.celkom) || 0);
    if (p.bezDph == null || p.bezDph === "" || !Number.isFinite(Number(p.bezDph)))
      s.bezDphChyba = true;
    else s.bezDph += z * Number(p.bezDph);
    po.set(mena, s);
  }
  return [...po.entries()].map(([mena, s]) => ({
    mena,
    celkom: r2(s.celkom),
    // Keď niektorému dokladu suma bez DPH chýba, súčet by klamal — radšej žiadny.
    bezDph: s.bezDphChyba ? null : r2(s.bezDph),
  }));
}

export function suhrnVyberu(polozky: PolozkaSuhrnu[]): SuhrnVyberu {
  const naExport = polozky.filter((p) => p.naExport);
  const naUhradu = polozky.filter((p) => p.naUhradu);
  return {
    pocet: polozky.length,
    mimoSuctu: polozky.filter(jeMimoSuctu).length,
    spolu: sumyPoMenach(polozky),
    naExport: { pocet: naExport.length, sumy: sumyPoMenach(naExport) },
    /*
      Na úhradu sa sčítava aj zálohová faktúra — tú treba zaplatiť, hoci do
      obratu nepatrí. Preto sa tu „mimo súčtu“ kvôli typu nepočíta.
    */
    naUhradu: {
      pocet: naUhradu.length,
      sumy: sumyPoMenach(
        naUhradu.map((p) => ({ ...p, typ: MIMO_SUCTU.has(String(p.typ ?? "")) ? null : p.typ })),
      ),
    },
  };
}

/*
  Riadky jednotlivých zoznamov v tvare pre súčet. Čo je „na export“ a „na
  úhradu“, sa v každej agende líši — preto po jednej funkcii na agendu.
*/

/**
 * Prijatá faktúra. Dobropis je uložený záporne (formulár aj Nespracované),
 * takže sa sčíta tak, ako je — otáčať ho by ho zmenilo na ťarchopis.
 */
export function polozkaPrijatej(
  r: Record<string, any>,
  o: { zapocitatelna?: boolean; zaplateneNaMieste?: Set<string> } = {},
): PolozkaSuhrnu {
  const zrusena = r.status === "cancelled" || r.status === "draft";
  const celkom = Number(r.amount_total ?? 0);
  return {
    mena: r.currency,
    celkom,
    bezDph: r.amount_without_vat,
    typ: r.type === "proforma" ? "proforma" : null,
    mimoSuctu: r.status === "cancelled" || o.zapocitatelna === false,
    naExport: !r.exported_at && !zrusena,
    naUhradu:
      !zrusena &&
      r.status !== "paid" &&
      o.zapocitatelna !== false &&
      celkom > 0 &&
      !r.vyuctovanie_id &&
      !(r.payment_method && o.zaplateneNaMieste?.has(r.payment_method)),
  };
}

/** Vystavená faktúra — na úhradu je neuhradená, ktorú nám zákazník dlhuje. */
export function polozkaVystavenej(r: Record<string, any>): PolozkaSuhrnu {
  const zrusena = r.status === "cancelled" || !!r.deleted_at;
  return {
    mena: r.currency,
    celkom: r.total,
    bezDph: r.subtotal,
    typ: r.type,
    mimoSuctu: zrusena,
    naExport: !r.exported_at && !zrusena && r.status !== "draft",
    naUhradu:
      !zrusena &&
      r.status !== "draft" &&
      r.type !== "credit_note" &&
      r.type !== "advance_payment" &&
      !r.paid_at &&
      r.status !== "paid",
  };
}

/**
 * Bloček. Platený hotovosťou alebo kartou je zaplatený na mieste — na úhradu
 * ostáva len bloček s prevodom, ktorý ešte nespároval pohyb z účtu.
 */
export function polozkaBlocku(r: Record<string, any>, uhradenyZUctu: boolean): PolozkaSuhrnu {
  return {
    mena: r.currency,
    celkom: r.total_amount,
    bezDph: r.net_amount,
    naExport: r.status === "processed" && !r.exported_at,
    naUhradu: r.payment_method === "prevod" && !uhradenyZUctu,
  };
}

/**
 * Doklad v Nespracovaných — ešte nie je v účtovníctve vôbec, preto „na export“
 * znamená nezaúčtovaný (bez predkontácie). Na úhradu je faktúra a zálohová,
 * ktorá sa neplatila na mieste; bloček, dobropis a iný doklad nie.
 */
export function polozkaNespracovaneho(r: {
  druh?: string | null;
  suma?: number | null;
  zaklad?: number | null;
  mena?: string | null;
  platba?: string | null;
  predkontacia?: string | null;
}): PolozkaSuhrnu {
  const druh = r.druh ?? "";
  const doklad = druh !== "ostatny";
  return {
    mena: r.mena,
    celkom: r.suma ?? 0,
    bezDph: r.zaklad ?? null,
    typ: druh === "zalohova" ? "proforma" : druh === "dobropis" ? "credit_note" : null,
    mimoSuctu: !doklad,
    naExport: doklad && !String(r.predkontacia ?? "").trim(),
    naUhradu:
      (druh === "faktura" || druh === "zalohova" || druh === "") &&
      Number(r.suma ?? 0) > 0 &&
      !["hotovost", "karta", "dobierka", "zapocet"].includes(String(r.platba ?? "")),
  };
}
