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
import { rozpisBlocku } from "./rozuctovanie";
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
 * Len pre slovenské firmy — česká Pohoda má vlastný číselník a kód „UDpdp“
 * v ňom nie je; českej firme bez nastaveného členenia sa doklad ohlási.
 */
export const PREDVOLENE_CLENENIE_PDP_VYDANE = "UDpdp";
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
  return krajinaDane(company?.country) === "CZ" ? "" : PREDVOLENE_CLENENIE_PDP_VYDANE;
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
  const cz = krajinaDane(company?.country) === "CZ";
  const domaca = domacaMena(company?.country);
  const mena = String(d?.currency ?? domaca).toUpperCase() || domaca;
  if (mena !== domaca) {
    if (blocek)
      return `${cislo} — bloček v mene ${mena} — Pohoda ho bez kurzu neprijme, zadajte ho ručne`;
    if (!(Number(d?._kurz) > 0)) return `${cislo} — doklad v mene ${mena} nemá kurz`;
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
    const cl =
      vlastneClenenie ||
      kod(podlaKat?.clenenie) ||
      kod(nastavenia?.clenenieDphPrijata) ||
      (rozuctovane("clenenie") ? "x" : "");
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
