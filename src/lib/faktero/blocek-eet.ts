import type { BlocekVysledok } from "./blocek.functions";
import { jeEetQr } from "./eet-cz";
import { zaokruhlenieZPoloziek } from "./zaokruhlenie-blocku";

/**
 * Český bloček: hlavička z QR kódu (EET), položky a rozpis DPH z fotky.
 *
 * QR je odpísaný z pokladnice, fotka je odhad — suma, dátum, mena a predajca
 * preto idú z QR. Výsledok je bloček s QR kódom pokladnice (`zdroj: "qr"`),
 * aj keď položky prečítala fotka: inak by ho web nahratý zo súboru poslal
 * do Nespracovaných namiesto Bločkov (`jeQrPokladnice`).
 *
 * Keď z fotky nevyšlo nič (na obrázku je len QR, rozmazaná fotka), ostáva
 * to, čo je v QR — predtým sa zahodilo aj to a formulár ostal prázdny.
 *
 * Rozpis DPH (13. 11. 2026, pravidlo zákonných sadzieb): český QR nesie len
 * celkovú sumu, sadzby nie. Rozpis preto dáva fotka; musí sedieť so sumou
 * z QR, inak ide doklad na kontrolu. Bez fotky (alebo keď z nej rozpis
 * nevyšiel) sa predvyplní **návrh** v základnej sadzbe 21 % a bloček sa
 * označí na kontrolu — v Česku platí aj 12 % (potraviny, ubytovanie…).
 */
export function zlucEetSFotkou(
  eet: BlocekVysledok,
  foto: BlocekVysledok | null,
  poznamka?: string,
): BlocekVysledok {
  if (!foto) {
    return doplnRozpisEet({
      ...eet,
      poznamka: "Údaje sú z QR kódu, z fotky sa nepodarilo prečítať položky.",
    });
  }
  const v: BlocekVysledok = { ...foto, zdroj: "qr", overeny: false, poznamka, currency: "CZK" };
  if (eet.qr_raw) v.qr_raw = eet.qr_raw;
  if (eet.total != null) v.total = eet.total;
  if (eet.date) v.date = eet.date;
  if (eet.supplier) v.supplier = eet.supplier;
  if (eet.supplier_address) v.supplier_address = eet.supplier_address;
  if (eet.supplier_ico) v.supplier_ico = eet.supplier_ico;
  if (eet.supplier_dic) v.supplier_dic = eet.supplier_dic;
  if (eet.supplier_ic_dph) v.supplier_ic_dph = eet.supplier_ic_dph;
  // Český QR = český predajca (sadzby 21/12 %), aj keď fotka tvrdí inak.
  v.supplier_country = "CZ";
  return doplnRozpisEet(v);
}

/** Základná sadzba DPH v Česku — návrh, keď sadzbu nepovie ani fotka. */
export const SADZBA_NAVRHU_CZ = 21;

/**
 * Dôvod kontroly pri návrhu 21 %. Začína „Rozpis DPH“, aby ho poznali
 * všetky stráže rozpisu na kontrole (`rozpis-na-kontrole.ts`): doklad
 * neodíde do Pohody ani ho nezaúčtuje autopilot, kým ho človek nepotvrdí.
 */
export const DOVOD_NAVRHU_SADZBY_QR =
  "Rozpis DPH je len návrh (21 %) — sadzba DPH z QR kódu nie je známa. Skontrolujte, či nejde o 12 %.";

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Jeden riadok rozpisu zo sumy s DPH: základ = suma / (1 + sadzba)
 * zaokrúhlený na centy, DPH = suma − základ (súčet tak sedí na cent).
 */
export function rozpisZoSumy(
  sumaSDph: number,
  sadzba: number,
): { sadzba: number; zaklad: number; dph: number } {
  const zaklad = r2(sumaSDph / (1 + sadzba / 100));
  return { sadzba, zaklad, dph: r2(sumaSDph - zaklad) };
}

/** Rozpis z fotky nesedí so sumou z QR o viac ako 2 centy. */
function popisNesuladu(sucet: number, suma: number, mena: string): string {
  const f = (n: number) => `${n.toFixed(2).replace(".", ",")} ${mena}`;
  return `Rozpis DPH z fotky (spolu ${f(sucet)}) nesedí so sumou z QR kódu ${f(suma)} — skontrolujte sadzby, základ a DPH podľa bločku.`;
}

/**
 * Rozpis DPH českého bločku z QR (EET).
 *
 * - Rozpis z fotky: ostáva; keď základ + DPH + zaokrúhlenie nesedí so sumou
 *   z QR, dostane dôvod na kontrolu (`kontrola_dph`).
 * - Bez rozpisu: návrh 21 % zo sumy z QR (`rozpis_odhad`) a dôvod na kontrolu.
 *
 * Iný než český QR bloček sa nemení (slovenská eKasa nesie rozpis z FS).
 */
export function doplnRozpisEet(v: BlocekVysledok): BlocekVysledok {
  if (!v.qr_raw || !jeEetQr(v.qr_raw)) return v;
  const total = v.total;
  if (total == null || !Number.isFinite(total)) return v;
  const zaokr = zaokruhlenieZPoloziek(v.items);
  const rozpis = (v.vat_breakdown ?? []).filter((r) => r && Number.isFinite(Number(r.sadzba)));

  if (rozpis.length) {
    const sucet = r2(rozpis.reduce((a, r) => a + (Number(r.zaklad) || 0) + (Number(r.dph) || 0), 0));
    if (Math.abs(r2(sucet + zaokr) - total) <= 0.02) return v;
    return { ...v, kontrola_dph: popisNesuladu(r2(sucet + zaokr), total, v.currency || "CZK") };
  }

  const navrh = rozpisZoSumy(r2(total - zaokr), SADZBA_NAVRHU_CZ);
  return {
    ...v,
    vat_breakdown: [navrh],
    net_amount: navrh.zaklad,
    vat_amount: navrh.dph,
    vat_rate: navrh.sadzba,
    rozpis_odhad: true,
    kontrola_dph: DOVOD_NAVRHU_SADZBY_QR,
  };
}

/**
 * Dôvod na kontrolu, ktorý sa zapíše k uloženému bločku (`na_kontrolu_dovod`).
 *
 * Len český bloček z QR: dôvod poslaný klientom (návrh 21 % alebo rozpis
 * z fotky nesediaci s QR), a pre staršie klienty, ktoré dôvod neposielajú
 * (`kontrolaOdKlienta === undefined`), aj rozpis zhodný s návrhom 21 %.
 * Dôvod vždy začína „Rozpis DPH“ (`jeDovodRozpisu`).
 */
export function dovodKontrolyEet(
  row: { qr_raw?: string | null; total_amount?: number | null; vat_breakdown?: unknown; items?: unknown },
  kontrolaOdKlienta: string | null | undefined,
): string | null {
  if (!row.qr_raw || !jeEetQr(row.qr_raw)) return null;
  if (kontrolaOdKlienta !== undefined) {
    const d = (kontrolaOdKlienta ?? "").trim();
    if (!d) return null;
    return (/^\s*Rozpis DPH/i.test(d) ? d : `Rozpis DPH treba skontrolovať: ${d}`).slice(0, 1000);
  }
  return jeNavrhRozpisuEet(row) ? DOVOD_NAVRHU_SADZBY_QR : null;
}

/** Rozpis uloženého bločku je presne návrh 21 % zo sumy (nikto ho nemenil). */
export function jeNavrhRozpisuEet(row: {
  total_amount?: number | null;
  vat_breakdown?: unknown;
  items?: unknown;
}): boolean {
  const r = Array.isArray(row.vat_breakdown) ? (row.vat_breakdown as any[]) : [];
  if (r.length !== 1 || row.total_amount == null) return false;
  const navrh = rozpisZoSumy(r2(Number(row.total_amount) - zaokruhlenieZPoloziek(row.items)), SADZBA_NAVRHU_CZ);
  return (
    Number(r[0]?.sadzba) === navrh.sadzba &&
    Math.abs(Number(r[0]?.zaklad) - navrh.zaklad) < 0.005 &&
    Math.abs(Number(r[0]?.dph) - navrh.dph) < 0.005
  );
}

/**
 * Poistka pri uložení: český bloček z QR bez rozpisu aj bez DPH (starší
 * klient, záznam z fronty appky prečítaný pred 13. 11.) dostane návrh 21 %
 * zo sumy. Vráti `null`, keď netreba nič dopĺňať.
 */
export function navrhRozpisuPriUlozeni(d: {
  qr_raw?: string | null;
  total_amount?: number | null;
  vat_amount?: number | null;
  vat_breakdown?: unknown;
  items?: unknown;
}): { vat_breakdown: { sadzba: number; zaklad: number; dph: number }[]; net_amount: number; vat_amount: number; vat_rate: number } | null {
  if (!d.qr_raw || !jeEetQr(d.qr_raw)) return null;
  if (Array.isArray(d.vat_breakdown) && d.vat_breakdown.length) return null;
  if (Math.abs(Number(d.vat_amount) || 0) >= 0.005) return null;
  const total = Number(d.total_amount);
  if (d.total_amount == null || !Number.isFinite(total) || total <= 0) return null;
  const navrh = rozpisZoSumy(r2(total - zaokruhlenieZPoloziek(d.items)), SADZBA_NAVRHU_CZ);
  return { vat_breakdown: [navrh], net_amount: navrh.zaklad, vat_amount: navrh.dph, vat_rate: navrh.sadzba };
}
