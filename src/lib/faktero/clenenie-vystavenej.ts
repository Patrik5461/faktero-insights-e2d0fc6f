/*
  Návrh členenia DPH vystaveného dokladu (faktúra, dobropis, ťarchopis) vo
  formulári — kým doklad nie je uložený a motor automatického účtovania ešte
  nič nenavrhol. Poradie je to isté ako pri uložení a exporte:

    pravidlo automatického účtovania (to isté uplatní spúšťač v databáze)
    → neplatiteľ: nič (členenie DPH ani KV sa mu nenastavuje — zadanie z 5. 11.)
    → tuzemské prenesenie: členenie firmy pre prenesenie
    → predvolené členenie firmy (Predkontácie → Predvolené)
    → odvodené z režimu dane (`odvodClenenia`, napr. UD, UDpdp, UNoslob).

  Dobropis a ťarchopis majú to isté členenie ako faktúra — opravujú to isté
  plnenie; do KV ich zaradí `kv-urcenie.ts` (C.1 / D.2).
*/

import { kodClenenia, odvodClenenia, type KodCiselnika } from "./auto-uctovanie";
import { kvOpravnehoZPovodnej, kvSekcia, kvVystavenehoDokladu } from "./kv-urcenie";
import { ZAKLADNE_CLENENIA_DPH } from "./predkontacie";
import { rezimFirmy } from "./dph-rezim";
import { kvKodFirmy, kvOpravnehoPodkodu, pismenoPreneseniaKv } from "./ciselnik-obrazok";

export type ZdrojClenenia = "pravidlo" | "firma" | "rezim";

export function navrhClenenieVystavenej(o: {
  pravidlo?: string | null;
  /** Členenie firmy pre tuzemské prenesenie (`pohoda_clenenie_dph_pdp`). */
  pdpFirmy?: string | null;
  /** Predvolené členenie firmy pre vydané faktúry (`pohoda_clenenie_dph`). */
  predvoleneFirmy?: string | null;
  platitel: boolean;
  krajinaFirmy: string;
  /** Kódy, ktoré firma ponúka (číselník z Pohody alebo základné SK). */
  ciselnik: { kod: string; popis?: string | null; agenda?: string | null }[];
  doklad: {
    opravny?: boolean;
    /** Suma DPH; bez sumy sa predpokladá doklad s DPH. */
    dph?: number | null;
    reverseCharge?: boolean;
    reverseChargeType?: string | null;
    /**
     * Tuzemské prenesenie (§ 69 ods. 12) určené zvonka (`jeTuzemskePrenesenie`).
     * Bez neho platí prenesenie bez bližšieho typu za tuzemské (formulár).
     */
    tuzemskePdp?: boolean;
    euPlnenie?: string | null;
    osobitnaUprava?: string | null;
    ossKrajina?: string | null;
    partnerIcDph?: string | null;
    partnerKrajina?: string | null;
  };
}): { kod: string; zdroj: ZdrojClenenia } | null {
  const t = (v: unknown) => String(v ?? "").trim();
  if (t(o.pravidlo)) return { kod: t(o.pravidlo), zdroj: "pravidlo" };
  const d = o.doklad;
  // Neplatiteľ daň nevyčísľuje — členenie DPH mu nedávame (ani UN, ani predvolené firmy).
  if (!o.platitel) return null;
  const tuzemskePdp =
    d.tuzemskePdp ??
    (Boolean(d.reverseCharge) && (!t(d.reverseChargeType) || d.reverseChargeType === "domestic_69"));
  const odvodene = () =>
    odvodClenenia(
      {
        smer: "vydane",
        krajinaFirmy: o.krajinaFirmy || "SK",
        firmaPlatitel: o.platitel,
        opravny: Boolean(d.opravny),
        dph: d.dph == null ? 1 : Number(d.dph) || 0,
        reverseCharge: Boolean(d.reverseCharge),
        // Prenesenie bez bližšieho typu je vo formulári tuzemské (§ 69 ods. 12).
        reverseChargeType: tuzemskePdp
          ? "domestic_69"
          : d.reverseCharge
            ? t(d.reverseChargeType) || null
            : null,
        euPlnenie: d.euPlnenie ?? null,
        osobitnaUprava: d.osobitnaUprava ?? null,
        ossKrajina: d.ossKrajina ?? null,
        partnerIcDph: d.partnerIcDph ?? null,
        partnerKrajina: d.partnerKrajina ?? null,
      },
      o.ciselnik.map(
        (c): KodCiselnika => ({
          druh: "clenenie_dph",
          kod: c.kod,
          popis: c.popis ?? null,
          agenda: c.agenda ?? null,
        }),
      ),
    ).clenenieDph;
  if (tuzemskePdp && t(o.pdpFirmy)) return { kod: t(o.pdpFirmy), zdroj: "firma" };
  // Predvolené firmy je pre bežné tuzemské plnenie — nie pre prenesenie ani doklad bez DPH.
  const sDph = d.dph == null || Math.abs(Number(d.dph) || 0) >= 0.005;
  if (!d.reverseCharge && sDph && t(o.predvoleneFirmy))
    return { kod: t(o.predvoleneFirmy), zdroj: "firma" };
  const kod = odvodene();
  return kod ? { kod, zdroj: "rezim" } : null;
}

// ───────────────── jedno rozhodnutie pre uložený doklad ─────────────────

/*
  resolveVatClassification — členenie DPH, KV DPH a predkontácia vystaveného
  dokladu tak, ako sa uložia do `invoices` (a ako ich ukáže detail ako
  „automaticky“). Volá ju server pri vzniku a každej úprave dokladu
  (`clenenie-vystavenej.server.ts`), motor návrhu zaúčtovania aj backfill —
  žiadne druhé pravidlo nikde inde.

  Poradie pre každé pole:
    a) ručne zadaná hodnota na doklade (neprepisuje sa),
    b) pravidlo automatického účtovania firmy (predlohy sú bez podmienky —
       uplatní ich človek, takže sú ručnou hodnotou),
    c) predvolené hodnoty firmy (Predkontácie → Predvolené),
    d) systém podľa typu dokladu a plnenia:
       - neplatiteľ DPH → členenie ani KV nič,
       - tuzemsko → UD; KV A.1 podnikateľovi (IČ DPH, IČO alebo DIČ), D.2 občanovi
         (metodický pokyn FS ku KV — pozri kv-urcenie.ts),
       - tuzemské prenesenie § 69 ods. 12 → UDpdp, KV A.2,
       - EÚ / vývoz / oslobodené → kód z číselníka firmy (inak základné kódy), bez KV,
       - dobropis / ťarchopis → členenie ako pôvodná faktúra, KV C.1 (občan D.2),
         predkontácia z `pohoda_predkontacia_dobropis` (inak faktúry, inak pôvodnej),
       - daňový doklad k prijatej platbe (`advance_payment`) → členenie a KV ako
         faktúra, predkontácia len `pohoda_predkontacia_zaloha` (bez náhrady),
       - zálohová faktúra (`proforma`) → nič.

  „Ručne“ = stĺpec `*_zdroj` je 'rucne'. Starší doklad bez zdroja (NULL): hodnota,
  ktorá sa zhoduje s automatickou alebo je prázdna, je automatická — inak ručná.
*/

export type ZdrojHodnoty = "rucne" | "pravidlo" | "povodna" | "firma" | "system";

export type FirmaClenenia = {
  country?: string | null;
  vat_payer?: boolean | null;
  vat_scheme?: string | null;
  ic_dph?: string | null;
  pohoda_clenenie_dph?: string | null;
  pohoda_clenenie_dph_pdp?: string | null;
  kv_clenenie_faktura?: string | null;
  pohoda_predkontacia?: string | null;
  pohoda_predkontacia_dobropis?: string | null;
  pohoda_predkontacia_zaloha?: string | null;
};

export type FakturaClenenia = {
  type?: string | null;
  reverse_charge?: boolean | null;
  reverse_charge_type?: string | null;
  eu_plnenie?: string | null;
  osobitna_uprava?: string | null;
  oss_country?: string | null;
  customer_country?: string | null;
  customer_ic_dph?: string | null;
  customer_ico?: string | null;
  customer_dic?: string | null;
  vat_total?: unknown;
  opravuje_fakturu_id?: string | null;
  /** Druh tuzemského prenesenia — písmeno § 69 ods. 12 (SK); určuje podkód KV A.2 / C.1. */
  pdp_druh?: string | null;
  pohoda_clenenie_dph?: string | null;
  kv_clenenie?: string | null;
  pohoda_predkontacia?: string | null;
  clenenie_zdroj?: string | null;
  kv_zdroj?: string | null;
  predkontacia_zdroj?: string | null;
};

export type KontextClenenia = {
  /** Pravidlo automatického účtovania, ktoré na doklad sedí (alebo ho uplatnil spúšťač). */
  pravidlo?: {
    predkontacia?: string | null;
    clenenie_dph?: string | null;
    kv_clenenie?: string | null;
  } | null;
  /** Opravovaná faktúra (dobropis, ťarchopis, oprava § 25a). */
  povodna?: {
    pohoda_clenenie_dph?: string | null;
    kv_clenenie?: string | null;
    pohoda_predkontacia?: string | null;
  } | null;
  /** Členenia DPH z číselníka firmy (aktívne); prázdne = základné kódy SK. */
  ciselnik?: { kod: string; popis?: string | null; agenda?: string | null }[];
  /** Predkontácia, ktorú firma na vystavených dokladoch ustálene používa (`odhadPredkontacie`). */
  odhad?: { faktura?: string | null; dobropis?: string | null } | null;
  /**
   * Kódy členenia KV DPH z číselníka firmy (druh kv_clenenie, vydané + KN).
   * Automaticky určená sekcia sa zapíše kódom firmy (A1 → A1, jediný podkód
   * sekcie → ten podkód); prázdne = systémové kódy.
   */
  kvCiselnik?: string[];
  /**
   * Colné kódy položiek dokladu — bez zvoleného druhu prenesenia (`pdp_druh`)
   * sa z nich odhadne písmeno § 69 ods. 12 pre podkód KV (A2CN, A2MT, A2IO).
   */
  polozky?: { colny_kod?: string | null }[] | null;
};

type Pole = "clenenie" | "kv" | "predkontacia";

export type VysledokClenenia = {
  pohoda_clenenie_dph: string | null;
  kv_clenenie: string | null;
  pohoda_predkontacia: string | null;
  /** Odkiaľ je hodnota (null = nič). */
  zdroj: Record<Pole, ZdrojHodnoty | null>;
  /** Hodnota na doklade je ručná — automatika ju nechá. */
  rucne: Record<Pole, boolean>;
  /** Čo by doklad dostal automaticky (bez ručných hodnôt). */
  auto: { pohoda_clenenie_dph: string | null; kv_clenenie: string | null; pohoda_predkontacia: string | null };
};

const txt = (v: unknown) => String(v ?? "").trim() || null;

/** Tuzemské prenesenie na vystavenom doklade — to isté ako `kvAutoVystavenej` a `jeTuzemskePdp`. */
export function jeTuzemskePrenesenie(inv: FakturaClenenia, krajinaFirmy?: string | null): boolean {
  if (!inv.reverse_charge) return false;
  const typ = txt(inv.reverse_charge_type);
  if (typ) return typ === "domestic_69";
  const krajina = String(inv.customer_country ?? "").trim().toUpperCase();
  return !krajina || krajina === (txt(krajinaFirmy) ?? "SK").toUpperCase();
}

/** Opravný doklad — dobropis, ťarchopis alebo faktúra opravujúca inú (§ 25a). */
export function jeOpravnyDoklad(inv: Pick<FakturaClenenia, "type" | "opravuje_fakturu_id">) {
  return inv.type === "credit_note" || inv.type === "debit_note" || Boolean(txt(inv.opravuje_fakturu_id));
}

/**
 * Ručná hodnota? `zdroj` zo stĺpca `*_zdroj`; bez neho rozhodne zhoda s
 * automatikou — aj s kódom pravidla, ktorý pri vložení zapísal spúšťač v DB
 * (`faktero_uplatni_pravidlo_vystavenej`), hoci ho automatika pre režim dokladu zahodila.
 */
export function jeRucna(
  hodnota: unknown,
  zdroj: unknown,
  auto: string | null,
  ajAuto: (string | null | undefined)[] = [],
): boolean {
  const h = txt(hodnota);
  if (!h) return false;
  if (zdroj === "rucne") return true;
  if (zdroj === "auto") return false;
  return h !== auto && !ajAuto.some((x) => txt(x) === h);
}

/** Kód členenia DPH pre prenesenie (UDpdp, UKpdp …) — ako `jePdpKod` v pohoda-kontrola.ts. */
const jePdpClenenie = (v: unknown) => /pdp/i.test(String(v ?? ""));

/** Ponuka členení pre vystavený doklad: číselník firmy, bez neho základné kódy SK. */
export function ciselnikVystavenych(
  zaznamy: { druh?: string | null; kod: string; popis?: string | null; agenda?: string | null; aktivne?: boolean | null }[],
): { kod: string; popis: string | null; agenda: string | null }[] {
  const vlastne = zaznamy
    .filter((z) => (z.druh ?? "clenenie_dph") === "clenenie_dph" && z.aktivne !== false && txt(z.kod))
    .map((z) => ({ kod: String(z.kod).trim(), popis: z.popis ?? null, agenda: z.agenda ?? null }));
  if (vlastne.length) return vlastne;
  return ZAKLADNE_CLENENIA_DPH.filter((c) => c.smer === "vydane").map((c) => ({
    kod: c.kod,
    popis: c.popis,
    agenda: null,
  }));
}

/**
 * Predkontácia, ktorú firma na vystavených dokladoch ustálene používa — aspoň
 * 3 doklady a väčšina rovnaká (ako zvyk partnera). Dobropis zvlášť; automaticky
 * doplnené hodnoty sa nerátajú.
 */
export function odhadPredkontacie(
  riadky: { type?: string | null; pohoda_predkontacia?: string | null; predkontacia_zdroj?: string | null }[],
): { faktura: string | null; dobropis: string | null } {
  const modus = (r: typeof riadky) => {
    const m = new Map<string, number>();
    let n = 0;
    for (const x of r) {
      const k = txt(x.pohoda_predkontacia);
      if (!k || x.predkontacia_zdroj === "auto") continue;
      n++;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    let best: [string, number] | null = null;
    for (const e of m) if (!best || e[1] > best[1]) best = e;
    return best && n >= 3 && best[1] / n > 0.5 ? best[0] : null;
  };
  const opravne = (t: unknown) => t === "credit_note" || t === "debit_note";
  return {
    faktura: modus(riadky.filter((r) => r.type !== "proforma" && !opravne(r.type))),
    dobropis: modus(riadky.filter((r) => opravne(r.type))),
  };
}

export function resolveVatClassification(
  company: FirmaClenenia,
  invoice: FakturaClenenia,
  ctx: KontextClenenia = {},
): VysledokClenenia {
  const krajina = (txt(company.country) ?? "SK").toUpperCase();
  // Platiteľ podľa schémy (§ 7/§ 7a má IČ DPH, ale platiteľ nie je) — faktero-platitel-dph.
  const platitel = rezimFirmy(company).platitel;
  const typ = txt(invoice.type) ?? "regular";
  const proforma = typ === "proforma";
  const opravny = jeOpravnyDoklad(invoice);
  const opravnyTyp = typ === "credit_note" || typ === "debit_note";
  const tuzemskePdp = jeTuzemskePrenesenie(invoice, krajina);
  const maDph = Math.abs(Number(invoice.vat_total ?? 0) || 0) >= 0.005;
  const pr = ctx.pravidlo ?? null;
  const pov = opravny ? (ctx.povodna ?? null) : null;

  // ── členenie DPH (Pohoda) — nemecká firma účtuje cez DATEV, tá ho nemá.
  let clenenie: string | null = null;
  let zdrojCl: ZdrojHodnoty | null = null;
  if (!proforma && krajina !== "DE") {
    /*
      Kód z pravidla len keď sedí s režimom dokladu: pravidlo „všetky vystavené
      → UD“ nesmie dať UD faktúre s tuzemským prenesením (a UDpdp bežnej).
    */
    const clPr = txt(pr?.clenenie_dph);
    if (clPr && jePdpClenenie(clPr) === tuzemskePdp) [clenenie, zdrojCl] = [clPr, "pravidlo"];
    else if (!platitel) clenenie = null;
    else if (txt(pov?.pohoda_clenenie_dph)) [clenenie, zdrojCl] = [txt(pov?.pohoda_clenenie_dph), "povodna"];
    else {
      const n = navrhClenenieVystavenej({
        pdpFirmy: company.pohoda_clenenie_dph_pdp,
        predvoleneFirmy: company.pohoda_clenenie_dph,
        platitel: true,
        krajinaFirmy: krajina,
        ciselnik: ctx.ciselnik?.length ? ctx.ciselnik : ciselnikVystavenych([]),
        doklad: {
          opravny,
          dph: Number(invoice.vat_total ?? 0) || 0,
          reverseCharge: Boolean(invoice.reverse_charge),
          reverseChargeType: txt(invoice.reverse_charge_type),
          tuzemskePdp,
          euPlnenie: txt(invoice.eu_plnenie),
          osobitnaUprava: txt(invoice.osobitna_uprava),
          ossKrajina: txt(invoice.oss_country),
          partnerIcDph: txt(invoice.customer_ic_dph),
          partnerKrajina: txt(invoice.customer_country),
        },
      });
      if (n) [clenenie, zdrojCl] = [n.kod, n.zdroj === "firma" ? "firma" : "system"];
    }
  }
  const rucneCl = jeRucna(invoice.pohoda_clenenie_dph, invoice.clenenie_zdroj, clenenie, [pr?.clenenie_dph]);
  const clenenieFinal = rucneCl ? txt(invoice.pohoda_clenenie_dph) : clenenie;

  // ── KV DPH — len slovenský výkaz a len platiteľ.
  let kv: string | null = null;
  let zdrojKv: ZdrojHodnoty | null = null;
  // Kód pred doplnením podkódu: staršie doklady majú uložené všeobecné „A2“ —
  // to nie je ručná voľba, automatika ho prepíše podkódom.
  let kvSurovy: string | null = null;
  // Podkód KV prenesenia: druh z faktúry, inak odhad z colných kódov položiek.
  const pdpKv = { pismeno: pismenoPreneseniaKv(invoice.pdp_druh, ctx.polozky), tuzemskePdp };
  if (!proforma && krajina === "SK") {
    const kvPr = txt(pr?.kv_clenenie)?.toUpperCase() ?? null;
    // Opravný doklad A.1/A.2 z pravidla pre faktúry nedostane (ako spúšťač v DB);
    // A.2 patrí len tuzemskému preneseniu a prenesenie nedostane A.1 / D.2.
    const kvSediRezimu =
      kvPr && !(opravny && (kvPr === "A1" || kvSekcia(kvPr) === "A2")) && (kvSekcia(kvPr) === "A2") === tuzemskePdp
        ? true
        : kvPr === "X";
    // Všeobecné A2 z pravidla dostane podkód (Pohoda A2 bez podkódu nepozná).
    if (kvPr && kvSediRezimu)
      [kv, zdrojKv, kvSurovy] = [kvPr === "A2" ? kvKodFirmy(kvPr, ctx.kvCiselnik, pdpKv) : kvPr, "pravidlo", kvPr];
    else if (!platitel) kv = null;
    else {
      /*
        Podkód A.2 pôvodnej faktúry (A2CN …) sa mení na podkód C.1 (C1CN …);
        ostatné podľa sekcie (A2xx → C1, KN → X).
      */
      const podkodPov = pov ? kvOpravnehoPodkodu(pov.kv_clenenie) : null;
      const zPovodnej = pov ? kvOpravnehoZPovodnej(kvSekcia(pov.kv_clenenie) ?? pov.kv_clenenie) : "";
      if (podkodPov) [kv, zdrojKv, kvSurovy] = [kvKodFirmy(podkodPov, ctx.kvCiselnik), "povodna", zPovodnej];
      else if (zPovodnej)
        [kv, zdrojKv, kvSurovy] = [kvKodFirmy(zPovodnej, ctx.kvCiselnik, pdpKv), "povodna", zPovodnej];
      else {
        const predvolene = typ === "regular" || typ === "advance_payment" ? txt(company.kv_clenenie_faktura) : null;
        const k = kvVystavenehoDokladu({
          typ,
          opravny,
          kvDokladu: null,
          predvolene,
          reverseCharge: Boolean(invoice.reverse_charge),
          tuzemskePdp,
          maDph,
          icDphOdberatela: invoice.customer_ic_dph,
          icoOdberatela: invoice.customer_ico,
          dicOdberatela: invoice.customer_dic,
          clenenieDph: clenenieFinal,
        });
        if (k)
          [kv, zdrojKv, kvSurovy] = [
            kvKodFirmy(k, ctx.kvCiselnik, pdpKv),
            predvolene && k === predvolene.toUpperCase() ? "firma" : "system",
            k,
          ];
      }
    }
  }
  const rucneKv = jeRucna(invoice.kv_clenenie, invoice.kv_zdroj, kv, [pr?.kv_clenenie, kvSurovy]);

  // ── predkontácia — kódy patria Pohode firmy, systém ich nevymýšľa (len ustálený zvyk firmy).
  let pk: string | null = null;
  let zdrojPk: ZdrojHodnoty | null = null;
  if (!proforma) {
    /*
      Daňový doklad k prijatej platbe (záloha) ide do Pohody ako interný
      doklad a účtuje sa len daň zo zálohy — tržba nie. Predkontácia preto
      len z `pohoda_predkontacia_zaloha` (alebo z pravidla); predkontácia
      faktúr ani zvyk firmy („Tržby za služby 311/602“) ako náhrada nesmú
      (PALIERA 260800002, 5. 11. 2026). Bez nej export upozorní.
    */
    const zaloha = typ === "advance_payment";
    const firma = opravnyTyp
      ? (txt(company.pohoda_predkontacia_dobropis) ?? txt(company.pohoda_predkontacia))
      : zaloha
        ? txt(company.pohoda_predkontacia_zaloha)
        : txt(company.pohoda_predkontacia);
    if (txt(pr?.predkontacia)) [pk, zdrojPk] = [txt(pr?.predkontacia), "pravidlo"];
    else if (firma) [pk, zdrojPk] = [firma, "firma"];
    else if (zaloha) pk = null;
    else if (txt(pov?.pohoda_predkontacia)) [pk, zdrojPk] = [txt(pov?.pohoda_predkontacia), "povodna"];
    else {
      const o = opravnyTyp ? (txt(ctx.odhad?.dobropis) ?? txt(ctx.odhad?.faktura)) : txt(ctx.odhad?.faktura);
      if (o) [pk, zdrojPk] = [o, "system"];
    }
  }
  const rucnePk = jeRucna(invoice.pohoda_predkontacia, invoice.predkontacia_zdroj, pk, [pr?.predkontacia]);

  return {
    pohoda_clenenie_dph: clenenieFinal,
    kv_clenenie: rucneKv ? txt(invoice.kv_clenenie) : kv,
    pohoda_predkontacia: rucnePk ? txt(invoice.pohoda_predkontacia) : pk,
    zdroj: {
      clenenie: rucneCl ? "rucne" : zdrojCl,
      kv: rucneKv ? "rucne" : zdrojKv,
      predkontacia: rucnePk ? "rucne" : zdrojPk,
    },
    rucne: { clenenie: rucneCl, kv: rucneKv, predkontacia: rucnePk },
    auto: { pohoda_clenenie_dph: clenenie, kv_clenenie: kv, pohoda_predkontacia: pk },
  };
}

/**
 * Návrh predvolených kódov vydaných faktúr (Predkontácie → Predvolené) pre
 * platiteľa DPH — len pre polia, ktoré firma ešte nemá. Členenie z číselníka
 * (UD, UDpdp), predkontácia z ustáleného zvyku firmy; predkontácia dobropisu
 * = predkontácia faktúry. KV sa nenavrhuje: prázdne = automaticky A.1
 * podnikateľovi a D.2 občanovi — pevné „A1“ by občanovi dalo A.1.
 */
export function navrhPredvolenychVystavenych(
  firma: FirmaClenenia,
  ciselnik: { kod: string; popis?: string | null; agenda?: string | null }[],
  odhad: { faktura?: string | null; dobropis?: string | null } | null,
): Record<string, string> {
  const krajina = (txt(firma.country) ?? "SK").toUpperCase();
  if (!rezimFirmy(firma).platitel || krajina === "DE") return {};
  const kody: KodCiselnika[] = (ciselnik.length ? ciselnik : ciselnikVystavenych([])).map((c) => ({
    druh: "clenenie_dph",
    kod: c.kod,
    popis: c.popis ?? null,
    agenda: c.agenda ?? null,
  }));
  const pk = txt(firma.pohoda_predkontacia) ?? txt(odhad?.faktura);
  const navrh: Record<string, string | null> = {
    pohoda_clenenie_dph: kodClenenia("vystup_tuzemsko", "vydane", kody),
    pohoda_clenenie_dph_pdp: kodClenenia("vystup_pdp", "vydane", kody),
    pohoda_predkontacia: txt(odhad?.faktura),
    pohoda_predkontacia_dobropis: txt(odhad?.dobropis) ?? pk,
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(navrh))
    if (v && !txt((firma as Record<string, unknown>)[k])) out[k] = v;
  return out;
}
