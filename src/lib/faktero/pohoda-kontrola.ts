/*
  Kontrola dokladu pred odovzdaním do Pohody.

  Audit 22. 10. 2026 našiel doklady, ktoré Pohoda prijala, ale zaúčtovala
  zle: prenesenie daňovej povinnosti bez IČ DPH odberateľa (KV A.2 sa nedá
  vyplniť), prijaté prenesenie bez členenia pre samozdanenie, DPH rovnú
  základu, zaúčtované doklady bez predkontácie, hotovostné bločky bez
  pokladne. Taký doklad sa do súboru nepustí — ručný export, mesačný balík aj
  konektor ho vynechajú a povedia prečo („číslo — dôvod“, ako ostatné
  vynechané doklady).

  Čisté funkcie bez prístupu k databáze — volá ich generátor XML
  (`export.server.ts`) aj prehľad pred odovzdaním.
*/

import { jeZnamaSadzba, krajinaDane } from "./vat-rates";
import { kvPrijatehoDokladu } from "./kv-urcenie";
import { DOVOD_CUDZIA } from "./cudzia-faktura";
import { rozpisBlocku } from "./rozuctovanie";
import { ucinneClenenie as clenenieZauctovania } from "./clenenie-zauctovania";
import { domacaMena } from "./kurzy";
import {
  DOVOD_NEPLATITEL_PRIJATY,
  DOVOD_NEPLATITEL_VYSTAVENA,
  jeNeplatitel,
  jeNezahrnovat,
  prekazkaClenenia,
} from "./uctovanie-agenda";

/**
 * Členenie DPH vydanej faktúry v tuzemskom prenesení (§ 69 ods. 12), keď
 * firma vlastné nenastavila. Kód zo základných členení SK Pohody
 * (`ZAKLADNE_CLENENIA_DPH` v `predkontacie.ts`); Stormware ho opisuje ako
 * členenie typu „pdp“, ktoré nuluje daň a doplní text o prenesení.
 * Česká Pohoda má pre § 92a tú istú skratku: „UDpdp“ (ř. 25, KH A.1) —
 * Portál POHODA, https://portal.pohoda.cz/dane-ucetnictvi-mzdy/dph/samovymereni-dph-v-programu-pohoda
 * (overené 31. 10. 2026; predtým sa českej firme bez nastavenia doklad zastavil).
 */
export const PREDVOLENE_CLENENIE_PDP_VYDANE = "UDpdp";
/**
 * Česká Pohoda, prijaté plnenie v režime § 92a: „DDpdp“ (povinnosť priznať
 * daň, ř. 10/11, KH B.1); odpočet si Pohoda dopočíta (PDpdp). Slovenská
 * firma predvolené nemá — kód samozdanenia SK Pohody sa verejne overiť nedal.
 */
export const PREDVOLENE_CLENENIE_PDP_PRIJATE_CZ = "DDpdp";

/** Členenie prijatého dokladu v prenesení: nastavenie firmy, CZ inak DDpdp. */
export function clenenieprijatejPdp(nastavenia: Riadok | null | undefined, cz: boolean): string {
  return kod(nastavenia?.clenenieDphPdpPrijata) || (cz ? PREDVOLENE_CLENENIE_PDP_PRIJATE_CZ : "");
}
/** Kontrolný výkaz DPH — vydané faktúry v prenesení (§ 69 ods. 12 písm. f) až j)). */
export const KV_PDP_VYDANE = "A2";
/** Kontrolný výkaz DPH — prijaté plnenie, pri ktorom daň platí odberateľ (§ 69 ods. 12). */
export const KV_PDP_PRIJATE = "B1";

type Riadok = Record<string, any>;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Tuzemské prenesenie daňovej povinnosti na celej faktúre. `reverse_charge`
 * nesie aj dodanie do EÚ a vývoz — tie majú vlastný typ a do A.2 nepatria.
 * Staršie faktúry typ nemajú; tuzemské sú, keď je odberateľ z krajiny firmy.
 */
export function jeTuzemskePdp(inv: Riadok | null | undefined, company?: Riadok | null): boolean {
  if (!inv?.reverse_charge) return false;
  const typ = String(inv.reverse_charge_type ?? "").trim();
  if (typ === "domestic_69") return true;
  if (typ) return false;
  const krajina = String(inv.customer_country ?? "")
    .trim()
    .toUpperCase();
  return !krajina || krajina === krajinaDane(company?.country);
}

/** Položky v prenesení na inak bežnej faktúre (zmiešaná faktúra). */
export function maPdpPolozky(
  inv: Riadok | null | undefined,
  items: Riadok[] | null | undefined,
): boolean {
  return !inv?.reverse_charge && (items ?? []).some((it) => Boolean(it?.prenesenie));
}

/** Tolerancia na zaokrúhlenie DPH po položkách. */
export function toleranciaDph(zaklad: number, poloziek = 1): number {
  return Math.max(0.05, 0.01 * poloziek, 0.002 * Math.abs(zaklad));
}

/** Sedí daň so základom pri sadzbe? */
export function dphSedi(zaklad: number, dph: number, sadzba: number, poloziek = 1): boolean {
  return Math.abs(r2(dph) - r2((zaklad * sadzba) / 100)) <= toleranciaDph(zaklad, poloziek);
}

const kod = (v: unknown) => String(v ?? "").trim();
const jePdpKod = (v: unknown) => /pdp/i.test(kod(v));

/*
  Dĺžky polí podľa schém Stormware (type.xsd, invoice.xsd version_2). Export
  dlhšiu hodnotu skráti — pri čísle dokladu či IČ DPH by to bola tichá chyba
  (iné číslo v Pohode, nesprávne IČ DPH v kontrolnom výkaze), preto sa taký
  doklad radšej zastaví.
*/
export const DLZKY_POHODY = {
  /** `numberRequested` (string32NotEmpty), `originalDocument` (documentNumberType). */
  cislo: 32,
  ico: 15,
  dic: 18,
  icDph: 18,
} as const;

const dlzka = (v: unknown) => kod(v).length;

/** Spoločné pravidlá partnera: dĺžky IČO, DIČ a IČ DPH. */
function prekazkaPartnera(
  cislo: string,
  kto: string,
  ico: unknown,
  dic: unknown,
  icDph: unknown,
): string | null {
  if (dlzka(ico) > DLZKY_POHODY.ico)
    return `${cislo} — IČO ${kto} „${kod(ico)}“ je dlhšie ako ${DLZKY_POHODY.ico} znakov — Pohoda ho neprijme, opravte ho`;
  if (dlzka(dic) > DLZKY_POHODY.dic)
    return `${cislo} — DIČ ${kto} „${kod(dic)}“ je dlhšie ako ${DLZKY_POHODY.dic} znakov — opravte ho`;
  if (dlzka(icDph) > DLZKY_POHODY.icDph)
    return `${cislo} — IČ DPH ${kto} „${kod(icDph)}“ je dlhšie ako ${DLZKY_POHODY.icDph} znakov — opravte ho`;
  if (kod(icDph) && !/^[A-Z]{2}[0-9A-Z+*.]{1,16}$/i.test(kod(icDph).replace(/\s/g, "")))
    return `${cislo} — IČ DPH ${kto} „${kod(icDph)}“ nemá tvar IČ DPH (kód štátu a číslo) — kontrolný výkaz ho neprijme`;
  return null;
}

/**
 * Polia, ktoré by Pohoda (alebo kontrolný výkaz z nej) odmietla: číslo
 * dokladu, dátum, mena, dĺžky a tvar údajov partnera.
 */
export function prekazkaPoliVydanej(invoice: Riadok, company: Riadok): string | null {
  const cisloRaw = kod(invoice?.invoice_number);
  const cislo = cisloRaw || "?";
  if (!cisloRaw) return `? — faktúra bez čísla — Pohoda doklad bez čísla nezaloží`;
  if (cisloRaw.length > DLZKY_POHODY.cislo)
    return `${cislo} — číslo dokladu má ${cisloRaw.length} znakov, Pohoda prijme najviac ${DLZKY_POHODY.cislo} — skráťte formát číselného radu`;
  if (kod(invoice?.issue_date) && !/^\d{4}-\d{2}-\d{2}/.test(kod(invoice?.issue_date)))
    return `${cislo} — dátum vystavenia „${kod(invoice?.issue_date)}“ nie je platný dátum — Pohoda by doklad zaradila k dnešnému dňu`;
  const mena = kod(invoice?.currency);
  if (mena && !/^[A-Z]{3}$/.test(mena.toUpperCase()))
    return `${cislo} — mena „${mena}“ nie je kód ISO (EUR, CZK…) — Pohoda ju nepozná`;
  const p = prekazkaPartnera(
    cislo,
    "odberateľa",
    invoice?.customer_ico,
    invoice?.customer_dic,
    invoice?.customer_ic_dph,
  );
  if (p) return p;
  // KV A.2 (ručne zvolené) chce IČ DPH odberateľa — prenesenie overuje prekazkaVydanej.
  if (
    krajinaDane(company?.country) !== "CZ" &&
    kod(invoice?.kv_clenenie).toUpperCase() === KV_PDP_VYDANE &&
    !kod(invoice?.customer_ic_dph)
  )
    return `${cislo} — členenie KV A.2 bez IČ DPH odberateľa — doplňte IČ DPH alebo zmeňte členenie`;
  return null;
}

/**
 * To isté pre prijatú faktúru (číslo dodávateľa, dátum, IČO/DIČ/IČ DPH
 * dodávateľa). Chýbajúce číslo či IČ DPH pri KV hlási `varovanieKvPrijatej`.
 */
export function prekazkaPoliPrijateho(d: Riadok): string | null {
  /*
    Bloček nie: číslo bločku je identifikátor eKasa (dlhší ako 32 znakov
    a do Pohody ide skrátený len na dohľadanie) a do KV ide sumárne (B.3).
  */
  if (!d?._typPohody) return null;
  const cisloRaw = kod(d?._povodneCislo || d?.document_number);
  const cislo = cisloRaw || "?";
  if (cisloRaw.length > DLZKY_POHODY.cislo)
    return `${cislo} — číslo faktúry dodávateľa má ${cisloRaw.length} znakov, Pohoda prijme najviac ${DLZKY_POHODY.cislo} — opravte ho`;
  if (kod(d?.issue_date) && !/^\d{4}-\d{2}-\d{2}/.test(kod(d?.issue_date)))
    return `${cislo} — dátum dokladu „${kod(d?.issue_date)}“ nie je platný dátum — Pohoda by ho zaradila k dnešnému dňu`;
  return prekazkaPartnera(
    cislo,
    "dodávateľa",
    d?.supplier_ico,
    d?.supplier_dic,
    d?.supplier_ic_dph,
  );
}

/**
 * Prijatá faktúra v kontrolnom výkaze (B.1, B.2, C.2) bez čísla faktúry alebo
 * IČ DPH dodávateľa. Pohoda ju prijme, ale kontrolný výkaz z nej finančná
 * správa vráti — preto upozornenie (doklad sa nezastaví: AI pri čítaní
 * IČ DPH občas nenájde a účtovníčka ho doplní v Pohode).
 */
export function varovanieKvPrijatej(d: Riadok, company?: Riadok | null): string | null {
  const blocek = !d?._typPohody;
  const cisloRaw = kod(d?._povodneCislo || d?.document_number);
  const cislo = cisloRaw || "?";
  if (blocek || !company || krajinaDane(company?.country) === "CZ") return null;
  const rozpis: { dph?: number; pdp?: boolean }[] = Array.isArray(d?.vat_breakdown)
    ? d.vat_breakdown
    : rozpisBlocku(d);
  const dobropis = d?._typPohody === "receivedCreditNotice";
  const kv = kvPrijatehoDokladu({
    kvDokladu: d?.kv_clenenie,
    blocek: false,
    dobropis,
    pdp: Boolean(d?._pdp),
    rezim: d?._rezim ?? null,
    maDph: rozpis.some((r) => Math.abs(Number(r?.dph ?? 0)) > 0.005) || Boolean(d?._pdp),
    odpocet: d?.odpocet,
    clenenieDph: d?.pohoda_clenenie_dph,
    nadobudnutieDoB1: false,
  });
  if (/^(B1|B2|C2)$/.test(kv)) {
    if (!cisloRaw)
      return `${cislo} — prijatá faktúra v kontrolnom výkaze (${kv}) bez čísla faktúry dodávateľa — doplňte ho`;
    if (!kod(d?.supplier_ic_dph))
      return `${cislo} — prijatá faktúra v kontrolnom výkaze (${kv}) bez IČ DPH dodávateľa — doplňte ho, alebo ak dodávateľ nie je platiteľ, faktúra nemá mať DPH`;
  }
  return null;
}

/**
 * Dôvod, prečo vydaná faktúra do Pohody nesmie ísť — alebo `null`.
 * `nastavenia` sú tie isté ako pre `polozkyFaktur` (predvolené kódy firmy).
 */
export function prekazkaVydanej(
  invoice: Riadok,
  items: Riadok[],
  company: Riadok,
  nastavenia?: Riadok | null,
): string | null {
  const cislo = invoice?.invoice_number ?? "?";
  const cz = krajinaDane(company?.country) === "CZ";
  const typ = String(invoice?.type ?? "regular");
  const zalohova = typ === "proforma";
  const tuzemskePdp = jeTuzemskePdp(invoice, company);
  const pdpPolozky = maPdpPolozky(invoice, items);

  {
    const dovod = prekazkaPoliVydanej(invoice, company);
    if (dovod) return dovod;
  }

  // Prenesenie: odberateľ musí mať IČ DPH (SK KV A.2, CZ KH A.1 chce DIČ).
  if ((tuzemskePdp || pdpPolozky) && !zalohova) {
    const icDph = kod(invoice?.customer_ic_dph) || (cz ? kod(invoice?.customer_dic) : "");
    if (!icDph)
      return `${cislo} — prenesenie daňovej povinnosti bez IČ DPH odberateľa (kontrolný výkaz ${cz ? "A.1" : "A.2"} ho vyžaduje) — doplňte IČ DPH alebo prenesenie zrušte`;
  }

  // Česká firma: predvolené členenie pre prenesenie nie je (UDpdp je slovenské).
  if (cz && !zalohova) {
    const bezClenenia =
      (tuzemskePdp &&
        !kod(invoice?.pohoda_clenenie_dph) &&
        !clenenieVydanejPdp(nastavenia, company)) ||
      (pdpPolozky &&
        !clenenieVydanejPdp(nastavenia, company) &&
        (items ?? []).some((it) => it?.prenesenie && !kod(it?.pohoda_clenenie_dph)));
    if (bezClenenia)
      return `${cislo} — prenesenie daňovej povinnosti (§ 92a) bez členenia DPH — nastavte členenie pre prenesenie v Účtovníctvo → Predkontácie (Vydaná faktúra — prenesenie daňovej povinnosti)`;
  }

  // Neplatiteľ daň nevyčísľuje — faktúra s DPH by v Pohode išla do priznania.
  if (jeNeplatitel(company) && Math.abs(Number(invoice?.vat_total ?? 0)) > 0.005)
    return `${cislo} — ${DOVOD_NEPLATITEL_VYSTAVENA}`;

  // Členenie a KV musia patriť vydaným dokladom (PALIERA FA20260004 odišla s PD).
  {
    const dovod = prekazkaClenenia(
      "vydane",
      [
        kod(invoice?.pohoda_clenenie_dph) || kod(nastavenia?.clenenieDph),
        ...(items ?? []).map((it) => it?.pohoda_clenenie_dph),
      ],
      [invoice?.kv_clenenie, ...(items ?? []).map((it) => it?.kv_clenenie)],
    );
    if (dovod) return `${cislo} — ${dovod}`;
  }

  // DPH po sadzbách musí sedieť so základom (audit: DPH = základ).
  const poSadzbach = new Map<number, { zaklad: number; dph: number; n: number }>();
  for (const it of items ?? []) {
    if (it?.prenesenie || invoice?.reverse_charge) {
      if (Math.abs(Number(it?.vat_amount ?? 0)) > 0.005)
        return `${cislo} — položka v prenesení daňovej povinnosti má DPH — opravte faktúru`;
      continue;
    }
    const s = Number(it?.vat_rate ?? 0) || 0;
    const r = poSadzbach.get(s) ?? { zaklad: 0, dph: 0, n: 0 };
    r.zaklad += Number(it?.subtotal ?? 0);
    r.dph += Number(it?.vat_amount ?? 0);
    r.n += 1;
    poSadzbach.set(s, r);
  }
  for (const [s, r] of poSadzbach) {
    if (!dphSedi(r.zaklad, r.dph, s, r.n))
      return `${cislo} — DPH ${r2(r.dph).toFixed(2)} nesedí so základom ${r2(r.zaklad).toFixed(2)} pri sadzbe ${s} % — opravte faktúru`;
  }

  // Členenie pre prenesenie na faktúre s daňou — v Pohode by išla do A.2 bez dane.
  const maDph = Math.abs(Number(invoice?.vat_total ?? 0)) > 0.005;
  if (!invoice?.reverse_charge && maDph && !zalohova) {
    if (jePdpKod(invoice?.pohoda_clenenie_dph) || kod(invoice?.kv_clenenie) === KV_PDP_VYDANE)
      return `${cislo} — členenie pre prenesenie daňovej povinnosti (${kod(invoice?.pohoda_clenenie_dph) || kod(invoice?.kv_clenenie)}), ale faktúra má DPH — opravte zaúčtovanie`;
  }

  // Zaúčtovaná faktúra musí mať kódy (vlastné, predvolené alebo pri všetkých položkách).
  if (invoice?.zauctovane_at) {
    const vsetkyPolozky = (pole: string) =>
      (items ?? []).length > 0 && (items ?? []).every((it) => kod(it?.[pole]));
    const predvolenaPk =
      typ === "proforma"
        ? nastavenia?.predkontaciaZaloha
        : typ === "credit_note"
          ? nastavenia?.predkontaciaDobropis
          : nastavenia?.predkontacia;
    const pk =
      kod(invoice?.pohoda_predkontacia) ||
      kod(predvolenaPk) ||
      (vsetkyPolozky("pohoda_predkontacia") ? "x" : "");
    if (!pk) return `${cislo} — zaúčtovaná bez predkontácie — doplňte ju v zaúčtovaní faktúry`;
    if (!zalohova) {
      const cl =
        kod(invoice?.pohoda_clenenie_dph) ||
        (tuzemskePdp ? clenenieVydanejPdp(nastavenia, company) : kod(nastavenia?.clenenieDph)) ||
        (vsetkyPolozky("pohoda_clenenie_dph") ? "x" : "");
      if (!cl) return `${cislo} — zaúčtovaná bez členenia DPH — doplňte ho v zaúčtovaní faktúry`;
    }
  }
  return null;
}

/**
 * Členenie pre tuzemské prenesenie na vydanej faktúre: nastavenie firmy,
 * inak predvolené SK. Česká firma predvolené nedostane — vráti sa „“.
 */
export function clenenieVydanejPdp(nastavenia?: Riadok | null, company?: Riadok | null): string {
  const vlastne = kod(nastavenia?.clenenieDphPdp);
  if (vlastne) return vlastne;
  void company;
  return PREDVOLENE_CLENENIE_PDP_VYDANE;
}

/**
 * Dôvod, prečo prijatý doklad (prijatá faktúra v tvare `prijataAkoDoklad`
 * alebo bloček) do Pohody nesmie ísť — alebo `null`.
 */
export function prekazkaDokladu(
  d: Riadok,
  company: Riadok,
  nastavenia?: Riadok | null,
): string | null {
  const blocek = !d?._typPohody;
  const cislo = d?._povodneCislo || d?.document_number || (blocek ? "bloček" : "?");
  // Faktúra inej firmy (iný odberateľ) — kým človek nepotvrdí, že patrí tejto firme.
  if (d?._odberatelNesedi) return `${cislo} — ${DOVOD_CUDZIA}`;
  {
    const dovod = prekazkaPoliPrijateho(d);
    if (dovod) return dovod;
  }
  const cz = krajinaDane(company?.country) === "CZ";
  const domaca = domacaMena(company?.country);
  const mena = String(d?.currency ?? domaca).toUpperCase() || domaca;
  if (mena !== domaca) {
    /*
      Bloček v cudzej mene si od 30. 10. 2026 pamätá kurz ECB/ČNB
      (`exchange_rate`) a ide do Pohody ako prijatá faktúra alebo interný
      doklad v cudzej mene. Hotovosť nie — pokladňa v Pohode je v domácej mene.
    */
    if (blocek && String(d?.payment_method ?? "") === "hotovost")
      return `${cislo} — hotovostný bloček v mene ${mena} — pokladňa v Pohode je v domácej mene, zadajte ho ručne`;
    const kurz = blocek ? Number(d?.exchange_rate) : Number(d?._kurz);
    if (!(kurz > 0))
      return blocek
        ? `${cislo} — bloček v mene ${mena} nemá kurz — otvorte ho a uložte znova, kurz sa doplní`
        : `${cislo} — doklad v mene ${mena} nemá kurz`;
  }

  const krajina = krajinaDane(company?.country);
  const rozpis: { sadzba: number; zaklad: number; dph: number; pdp?: boolean }[] = Array.isArray(
    d?.vat_breakdown,
  )
    ? d.vat_breakdown
    : rozpisBlocku(d);
  for (const r of rozpis) {
    if (r?.pdp) continue;
    const s = Number(r?.sadzba ?? 0);
    if (!jeZnamaSadzba(s, krajina))
      return `${cislo} — DPH sa nedá priradiť k sadzbe (vychádza ${r2(s)} %) — rozpíšte DPH podľa sadzieb (alebo zadajte položky)`;
    if (!dphSedi(Number(r?.zaklad ?? 0), Number(r?.dph ?? 0), s))
      return `${cislo} — DPH ${r2(Number(r?.dph ?? 0)).toFixed(2)} nesedí so základom ${r2(Number(r?.zaklad ?? 0)).toFixed(2)} pri sadzbe ${s} % — opravte rozpis DPH`;
  }
  if (Array.isArray(d?._polozkyPrijatej)) {
    for (const x of d._polozkyPrijatej) {
      if (x?.pdp) continue;
      if (!jeZnamaSadzba(Number(x?.sadzba ?? 0), krajina))
        return `${cislo} — položka „${String(x?.nazov ?? "").slice(0, 40)}“ má neštandardnú sadzbu ${x?.sadzba} % — opravte položky`;
    }
  }

  // Prenesenie (samozdanenie) — bez členenia pre prenesenie by ho Pohoda zaúčtovala ako bežný nákup.
  const vlastneClenenie = kod(d?.pohoda_clenenie_dph);
  const pdpPrijate = kod(nastavenia?.clenenieDphPdpPrijata);
  const pdpHlavicka = Boolean(d?._pdp) || rozpis.some((r) => r?.pdp);
  const pdpPolozky = Array.isArray(d?._polozkyPrijatej)
    ? d._polozkyPrijatej.filter((x: any) => x?.pdp && !kod(x?.clenenie))
    : [];
  if (
    !cz &&
    (pdpHlavicka || pdpPolozky.length) &&
    !pdpPrijate &&
    !(vlastneClenenie && pdpHlavicka && !pdpPolozky.length)
  ) {
    return `${cislo} — prenesenie daňovej povinnosti bez členenia DPH pre samozdanenie — nastavte ho v Účtovníctvo → Predkontácie (Prijatá faktúra — prenesenie daňovej povinnosti)`;
  }

  // Členenie a KV musia patriť prijatým dokladom (UD či A.1 na prijatej nie).
  const podlaKategorie = nastavenia?.podlaKategorie?.[String(d?.category ?? "")];
  const rozuctovanie: Riadok[] = Array.isArray(d?.rozuctovanie) ? d.rozuctovanie : [];
  const ucinneClenenie =
    vlastneClenenie ||
    kod(podlaKategorie?.clenenie) ||
    (blocek ? kod(nastavenia?.clenenieDphDoklady) : "") ||
    kod(nastavenia?.clenenieDphPrijata);
  {
    const dovod = prekazkaClenenia(
      "prijate",
      [
        ucinneClenenie,
        ...rozuctovanie.map((r) => r?.clenenie),
        ...(Array.isArray(d?._polozkyPrijatej)
          ? d._polozkyPrijatej.map((x: any) => x?.clenenie)
          : []),
      ],
      [d?.kv_clenenie, ...rozuctovanie.map((r) => r?.kv)],
    );
    if (dovod) return `${cislo} — ${dovod}`;
  }

  // Neplatiteľ si DPH neodpočíta — doklad s odpočtom by išiel do priznania.
  if (
    jeNeplatitel(company) &&
    !pdpHlavicka &&
    d?.odpocet !== false &&
    kod(d?.kv_clenenie) !== "X" &&
    !jeNezahrnovat(ucinneClenenie) &&
    rozpis.some((r) => !r?.pdp && Math.abs(Number(r?.dph ?? 0)) > 0.005)
  )
    return `${cislo} — ${DOVOD_NEPLATITEL_PRIJATY}`;

  // Zaúčtovaná prijatá faktúra musí mať predkontáciu aj členenie.
  if (d?._zauctovane) {
    const podlaKat = nastavenia?.podlaKategorie?.[String(d?.category ?? "")];
    const rozuct = Array.isArray(d?.rozuctovanie) ? d.rozuctovanie : [];
    const rozuctovane = (pole: string) =>
      rozuct.length > 0 && rozuct.every((r: any) => kod(r?.[pole]));
    const pk =
      kod(d?.pohoda_predkontacia) ||
      kod(podlaKat?.predkontacia) ||
      kod(nastavenia?.predkontaciaPrijata) ||
      (rozuctovane("predkontacia") ? "x" : "");
    if (!pk) return `${cislo} — zaúčtovaná bez predkontácie — doplňte ju v zaúčtovaní`;
    // To isté pravidlo ako pri zaúčtovaní (clenenie-zauctovania.ts).
    const cl = clenenieZauctovania({
      naDoklade: vlastneClenenie,
      kategoria: podlaKat?.clenenie,
      predvolene: nastavenia?.clenenieDphPrijata,
      rozuctovanie: rozuct,
    }).kod;
    if (!cl) return `${cislo} — zaúčtovaná bez členenia DPH — doplňte ho v zaúčtovaní`;
  }

  // Hotovostný bloček ako pokladničný doklad potrebuje pokladňu Pohody.
  if (
    blocek &&
    nastavenia?.blockyPodlaPlatby &&
    String(d?.payment_method ?? "") === "hotovost" &&
    !d?.vyuctovanie_id &&
    !kod(d?.pohoda_pokladna) &&
    !kod(nastavenia?.pokladna)
  ) {
    return `${cislo} — hotovostný bloček bez pokladne pre Pohodu — nastavte skratku pokladne v Účtovníctvo → Prepojenie s Pohodou`;
  }
  return null;
}

/**
 * Upozornenie (doklad sa nezastaví) pri prijatej faktúre: záväzkový kód
 * v rozúčtovaní (`varovanieZavazku`) alebo predkontácia, ktorú číselník
 * Pohody nepozná (`varovanieNeznamehoKodu`).
 */
export function varovanieDokladu(
  d: Riadok,
  nastavenia?: Riadok | null,
  company?: Riadok | null,
): string | null {
  return (
    varovanieZavazku(d, nastavenia) ??
    varovanieNeznamehoKodu(d, nastavenia) ??
    varovanieKvPrijatej(d, company)
  );
}

/**
 * Predkontácia prijatej faktúry, ktorú číselník Pohody v agende Prijaté
 * faktúry nemá (test 30. 10.: pravidlo uložilo názov „Nákup materiálu“
 * namiesto kódu „7“ a automat podľa neho faktúru zaúčtoval). Pohoda kód pri
 * importe nenájde. Kontroluje sa len pri firme s načítaným číselníkom
 * (`nastavenia.predkontaciePrijatych` — kódy agendy Prijaté faktúry a ručne
 * pridané bez agendy); záväzkové kódy hlási `varovanieZavazku`.
 */
function varovanieNeznamehoKodu(d: Riadok, nastavenia?: Riadok | null): string | null {
  if (!d?._typPohody) return null;
  const zname: string[] = Array.isArray(nastavenia?.predkontaciePrijatych)
    ? nastavenia.predkontaciePrijatych.map((x: unknown) => kod(x))
    : [];
  if (!zname.length) return null;
  const zavazkove = new Set<string>(
    Array.isArray(nastavenia?.zavazkovePredkontacie)
      ? nastavenia.zavazkovePredkontacie.map((x: unknown) => kod(x))
      : [],
  );
  const podlaKat = nastavenia?.podlaKategorie?.[String(d?.category ?? "")];
  const rozuctovanie: Riadok[] = Array.isArray(d?.rozuctovanie) ? d.rozuctovanie : [];
  const kody = [
    kod(d?.pohoda_predkontacia) ||
      kod(podlaKat?.predkontacia) ||
      kod(nastavenia?.predkontaciaPrijata),
    ...rozuctovanie.map((r) => kod(r?.predkontacia)),
  ].filter(Boolean);
  const nezname = [...new Set(kody.filter((k) => !zname.includes(k) && !zavazkove.has(k)))];
  if (!nezname.length) return null;
  const cislo = d?._povodneCislo || d?.document_number || "?";
  return `${cislo} — predkontácia ${nezname.map((k) => `„${k}“`).join(", ")} nie je v číselníku Pohody pre prijaté faktúry — Pohoda ju pri importe nenájde; vyberte kód z číselníka alebo ho v Pohode založte`;
}

/**
 * Rozúčtovanie prijatej faktúry používa predkontáciu, ktorú firma má len
 * v agende Ostatné záväzky. Faktúra ide do Pohody ako prijatá faktúra
 * (o agende rozhoduje kód hlavičky), takže taký kód v riadku Pohoda v agende
 * Prijaté faktúry nenájde a riadok zaúčtuje zle. Zoznam kódov je
 * `nastavenia.zavazkovePredkontacie` (`zavazkoveKody`).
 */
function varovanieZavazku(d: Riadok, nastavenia?: Riadok | null): string | null {
  if (!d?._typPohody) return null; // len prijaté faktúry
  const zavazkove: string[] = Array.isArray(nastavenia?.zavazkovePredkontacie)
    ? nastavenia.zavazkovePredkontacie.map((x: unknown) => kod(x))
    : [];
  if (!zavazkove.length) return null;
  const rozuctovanie: Riadok[] = Array.isArray(d?.rozuctovanie) ? d.rozuctovanie : [];
  if (!rozuctovanie.length) return null;
  const podlaKat = nastavenia?.podlaKategorie?.[String(d?.category ?? "")];
  const hlavicka =
    kod(d?.pohoda_predkontacia) ||
    kod(podlaKat?.predkontacia) ||
    kod(nastavenia?.predkontaciaPrijata);
  // Hlavička so záväzkovým kódom → celý doklad ide ako záväzok, riadky sedia.
  if (hlavicka && zavazkove.includes(hlavicka)) return null;
  const zle = [
    ...new Set(rozuctovanie.map((r) => kod(r?.predkontacia)).filter((k) => zavazkove.includes(k))),
  ];
  if (!zle.length) return null;
  const cislo = d?._povodneCislo || d?.document_number || "?";
  return `${cislo} — rozúčtovanie používa predkontáciu ${zle.map((k) => `„${k}“`).join(", ")} len z agendy Ostatné záväzky — faktúra ide do Pohody ako prijatá faktúra a tam kód nenájde; založte ho aj pre Prijaté faktúry alebo vyberte iný`;
}

/** Číslo dokladu z textu dôvodu („číslo — dôvod“). */
export const cisloZDovodu = (d: string) => String(d).split(" — ")[0];

/**
 * Identifikátor dokladu v dávke (`dataPackItem id`).
 *
 * Pohoda kontroluje duplicitu podľa `id` balíka a položky (data.xsd) — opravený
 * doklad pod tým istým `id` by odmietla ako už naimportovaný. Každé vrátenie
 * z Pohody preto zvýši `pohoda_verzia` a doklad odíde ako `id-verzia`;
 * odpoveď Pohody sa mapuje späť cez `holeId` (konektor) / `holeIdDokladu`.
 */
export function idDokladuPohody(id: unknown, verzia: unknown): string {
  const v = Math.trunc(Number(verzia) || 0);
  return `${String(id ?? "")}${v > 0 ? `-${v}` : ""}`;
}

/** `id` dokladu bez verzie opravy. */
export function holeIdDokladu(id: string): string {
  const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-\d+)?$/i.exec(
    String(id),
  );
  return m ? m[1] : String(id);
}
