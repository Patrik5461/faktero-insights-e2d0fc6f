/*
  Prijaté doklady neplatiteľa DPH v účtovných exportoch (Patrik 17. 11. 2026).

  Neplatiteľ si DPH neodpočíta a do priznania ani kontrolného výkazu nič
  z prijatých dokladov nedáva — celá suma dokladu (aj s DPH dodávateľa) je
  náklad. Do účtovného programu preto ide BEZ rozpisu DPH: jeden základ
  v nulovej sadzbe („nepodlieha“) vo výške celej sumy, členenie DPH
  „nezahŕňať do priznania“ (PN — Pohoda SK aj CZ), žiadne členenie KV.
  Predtým išiel bloček neplatiteľa ako „bez nároku“ platiteľa: priceHigh 100
  + priceHighVAT 23 s PD/PN — v Pohode s DPH, ktorú firma nemá.

  Výnimka: prenesenie daňovej povinnosti / samozdanenie (§ 69 ods. 12,
  služba zo zahraničia, nadobudnutie z EÚ) — daň odvádza aj registrovaná
  osoba podľa § 7 / § 7a, doklad ide tak ako doteraz.

  Platiteľov sa nič netýka. Dve podoby toho istého pravidla:
   - `dokladBezDphNeplatitela` — riadok pre export do Pohody (`polozkyDokladov`:
     bloček, prijatá faktúra, pokladničný aj interný doklad, dávka, most),
   - `uctovanieBezDphNeplatitela` — `DokladUctovania` pre ostatné programy
     (Omega, Money S3, Flexi, MRP, DATEV, súpiska CSV).
*/

import type { FirmaDph } from "./dph-rezim";
import { jeNeplatitel, jeNezahrnovat } from "./uctovanie-agenda";
import type { DokladUctovania, PolozkaUctovania, RiadokUctovania } from "./zauctovanie-export";

/** Členenie DPH „nezahŕňať do priznania“ pre prijaté doklady (SK aj CZ Pohoda). */
export const CLENENIE_NEPLATITELA = "PN";

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const txt = (v: unknown) => String(v ?? "").trim();

/**
 * Členenie DPH prijatého dokladu neplatiteľa: prvé „nezahŕňať“ (PN, PNxx)
 * z kandidátov (doklad, kategória, predvolené firmy), inak PN. Odpočtové
 * členenie (PD, PB…) by doklad dostalo do priznania.
 */
export function clenenieNeplatitela(...kandidati: unknown[]): string {
  for (const k of kandidati) if (jeNezahrnovat(k)) return txt(k);
  return CLENENIE_NEPLATITELA;
}

/** Členenie riadku či položky: vlastné „nezahŕňať“ ostáva, iné sa zahodí (zdedí doklad). */
const clenenieRiadku = (v: unknown): string | null => (jeNezahrnovat(v) ? txt(v) : null);

/**
 * Rozdiel do sumy dokladu (zaokrúhlenie bločku, najviac euro) pripočíta
 * k riadku s najväčšou sumou. Väčší rozdiel nie je zaokrúhlenie — riadky
 * ostanú, ako sú.
 */
function dorovnaj<T>(riadky: T[], ciel: number, suma: (x: T) => number, pripocitaj: (x: T, o: number) => T): T[] {
  if (!riadky.length) return riadky;
  const rozdiel = r2(ciel - riadky.reduce((a, x) => a + suma(x), 0));
  if (!rozdiel || Math.abs(rozdiel) > 1) return riadky;
  let naj = 0;
  riadky.forEach((x, i) => {
    if (Math.abs(suma(x)) > Math.abs(suma(riadky[naj]))) naj = i;
  });
  return riadky.map((x, i) => (i === naj ? pripocitaj(x, rozdiel) : x));
}

/**
 * Riadok pre Pohodu (`polozkyDokladov`) v prenesení / samozdanení? Prijatá
 * faktúra to nesie v príznakoch z `prijataAkoDoklad`, uložený rozpis aj
 * v riadkoch (`pdp`).
 */
export function dokladVPreneseni(d: Record<string, any> | null | undefined): boolean {
  if (!d) return false;
  if (d.reverse_charge === true || d._pdp || d._samozdanenie || d._samozdanenieCele) return true;
  const rezim = txt(d._rezim ?? d.dph_rezim);
  if (rezim === "samozdanenie" || rezim === "nadobudnutie") return true;
  const rozpis = Array.isArray(d.vat_breakdown) ? d.vat_breakdown : [];
  return rozpis.some((x: any) => x?.pdp === true || x?.vat_category === "reverse_charge");
}

/**
 * Prijatý doklad pre Pohodu bez rozpisu DPH, keď firma nie je platiteľ
 * (pozri hlavičku súboru). Platiteľ, prenesenie, zálohová faktúra a náš
 * daňový doklad k platbe ostávajú nezmenené (ten istý objekt).
 *
 * Celá suma dokladu (`total_amount`, so zaokrúhlením) ide ako jeden riadok
 * rozpisu v nulovej sadzbe — súhrn `priceNone` = suma dokladu, bez
 * zaokrúhlenia. Položky bločku (`items`), prijatej faktúry
 * (`_polozkyPrijatej`) a ručné rozúčtovanie idú v nulovej sadzbe s cenou
 * s DPH; zaokrúhlenie dorovná najväčší riadok, aby súčty sedeli s dokladom.
 * Členenie KV sa zahodí, členenie DPH je „nezahŕňať“ (`clenenieNeplatitela`).
 *
 * `kody` sú predvolené členenia firmy v poradí, v akom ich berie export —
 * použije sa prvé „nezahŕňať“ z nich.
 */
export function dokladBezDphNeplatitela<T extends Record<string, any>>(
  d: T,
  firma: FirmaDph | null | undefined,
  kody: unknown[] = [],
): T {
  if (!d || !jeNeplatitel(firma)) return d;
  if (d._zalohova || d._typPohody === "receivedAdvanceInvoice" || d._typPohody === "danovyDokladKPlatbe") return d;
  if (dokladVPreneseni(d)) return d;

  const rozpis = (Array.isArray(d.vat_breakdown) ? d.vat_breakdown : []).filter(
    (x: any) => num(x?.zaklad) || num(x?.dph),
  );
  const zRozpisu = rozpis.length
    ? rozpis.reduce((a: number, x: any) => a + num(x?.zaklad) + num(x?.dph), 0)
    : num(d.net_amount) + num(d.vat_amount);
  const celkom = r2(num(d.total_amount) || zRozpisu);
  const clenenie = clenenieNeplatitela(d.pohoda_clenenie_dph, ...kody);

  // Položky bločku: sadzba 0, suma s DPH ostáva (`total`, `unit_price`).
  const items = Array.isArray(d.items)
    ? d.items.map((x: any) => ({
        ...x,
        vat_rate: 0,
        clenenie: clenenieRiadku(x?.clenenie),
        kv: null,
        kv_clenenie: null,
      }))
    : d.items;

  // Položky prijatej faktúry (už prepočítané na základ a daň).
  const polozky = Array.isArray(d._polozkyPrijatej)
    ? dorovnaj(
        (d._polozkyPrijatej as any[]).map((x) => {
          const zaklad = r2(num(x.zaklad) + num(x.dph));
          const mn = num(x.mnozstvo) || 1;
          return {
            ...x,
            sadzba: 0,
            zaklad,
            dph: 0,
            cena: r2(zaklad / mn),
            pdp: false,
            clenenie: clenenieRiadku(x.clenenie),
            kv: null,
          };
        }),
        celkom,
        (x) => x.zaklad,
        (x, o) => {
          const zaklad = r2(x.zaklad + o);
          return { ...x, zaklad, cena: r2(zaklad / (num(x.mnozstvo) || 1)) };
        },
      )
    : d._polozkyPrijatej;

  // Ručné rozúčtovanie so sumami (pomer z pravidla `{…}` ostáva — sumy idú z rozpisu).
  const rozuctovanie = Array.isArray(d.rozuctovanie)
    ? dorovnaj(
        (d.rozuctovanie as any[]).map((r) => ({
          ...r,
          sadzba: 0,
          zaklad: r2(num(r?.zaklad) + num(r?.dph)),
          dph: 0,
          clenenie: clenenieRiadku(r?.clenenie),
          kv: null,
        })),
        celkom,
        (x) => num(x.zaklad),
        (x, o) => ({ ...x, zaklad: r2(num(x.zaklad) + o) }),
      )
    : d.rozuctovanie;

  return {
    ...d,
    vat_breakdown: celkom ? [{ sadzba: 0, zaklad: celkom, dph: 0 }] : [],
    net_amount: celkom,
    vat_amount: 0,
    vat_rate: 0,
    items,
    _polozkyPrijatej: polozky,
    rozuctovanie,
    pohoda_clenenie_dph: clenenie,
    kv_clenenie: null,
    // Krátený odpočet DPH vozidla neplatiteľa nemá — doklad sa podľa neho nedelí.
    vehicle_id: null,
    _neplatitelBezDph: true,
  };
}

/**
 * `DokladUctovania` (Omega, Money S3, Flexi, MRP, DATEV, CSV) bez rozpisu
 * DPH pre neplatiteľa — to isté pravidlo ako `dokladBezDphNeplatitela`.
 * Vystavené faktúry, prenesenie a zálohy ostávajú (ten istý objekt).
 *
 * Riadky: sadzba 0, základ = základ + DPH, bez odpočtu, bez KV, členenie
 * „nezahŕňať“; zaokrúhlenie dokladu sa pripočíta k najväčšiemu riadku, takže
 * základ dokladu = suma dokladu a zaokrúhlenie je 0. Položky rovnako.
 */
export function uctovanieBezDphNeplatitela(
  d: DokladUctovania,
  firma: FirmaDph | null | undefined,
): DokladUctovania {
  if (!d || d.agenda === "vystavena" || d.druh === "zaloha" || !jeNeplatitel(firma)) return d;
  const rezim = txt(d.dphRezim);
  if (d.prenesenieDph || rezim === "samozdanenie" || rezim === "nadobudnutie") return d;

  const clenenie = clenenieNeplatitela(d.clenenie);
  const celkom = r2(d.celkom);
  const zlucene: RiadokUctovania[] = [];
  for (const r of d.riadky) {
    const novy: RiadokUctovania = {
      ...r,
      sadzba: 0,
      zaklad: r2(r.zaklad + r.dph),
      dph: 0,
      clenenie: clenenieRiadku(r.clenenie) ?? clenenie,
      kv: null,
      odpocet: false,
    };
    const k = zlucene.find((x) => x.predkontacia === novy.predkontacia && x.clenenie === novy.clenenie);
    if (k) {
      k.zaklad = r2(k.zaklad + novy.zaklad);
      if (novy.text && k.text !== novy.text) k.text = [k.text, novy.text].filter(Boolean).join(" · ");
    } else zlucene.push(novy);
  }
  const riadky = dorovnaj(
    zlucene.filter((r) => r.zaklad),
    celkom,
    (x) => x.zaklad,
    (x, o) => ({ ...x, zaklad: r2(x.zaklad + o) }),
  );
  const polozky: PolozkaUctovania[] = dorovnaj(
    d.polozky.map((p) => {
      const zaklad = r2(p.zaklad + p.dph);
      return {
        ...p,
        sadzba: 0,
        zaklad,
        dph: 0,
        cena: r2(zaklad / (p.mnozstvo || 1)),
        clenenie: clenenieRiadku(p.clenenie),
      };
    }),
    celkom,
    (x) => x.zaklad,
    (x, o) => {
      const zaklad = r2(x.zaklad + o);
      return { ...x, zaklad, cena: r2(zaklad / (x.mnozstvo || 1)) };
    },
  );
  const zaklad = r2(riadky.reduce((a, r) => a + r.zaklad, 0));
  return {
    ...d,
    riadky,
    polozky,
    zaklad,
    dph: 0,
    zaokruhlenie: r2(celkom - zaklad),
    rozuctovany: new Set(riadky.map((r) => `${r.predkontacia}|${r.clenenie}|${r.odpocet}`)).size > 1,
    clenenie,
    kv: null,
  };
}
