/*
  Palivové karty — čisté pravidlá spoločné pre všetkých poskytovateľov.

  Ako sa transakcia z karty dostane do Fakteri:
    1. Vždy do `palivove_karty_transakcie` (evidencia, väzba na vozidlo).
    2. Palivo s priradeným vozidlom → tankovanie (`fuel_records`) s tachometrom.
    3. Náklad vozidla = transakcie s vozidlom (karta vozidla vo Vozovom parku).
    4. Účtovný doklad je **faktúra od vydavateľa karty**, nie jednotlivé nákupy:
       pri nákupe kartou je daňovým dokladom faktúra Shell (pumpa vydá len
       potvrdenie o nákupe). Jedna faktúra = jedna prijatá faktúra s rozpisom
       nákupov po riadkoch. Keby bol dokladom každý nákup, prišla by k tomu
       ešte mesačná faktúra a náklad aj DPH by boli dvakrát.
    5. Bloček z pumpy, ktorý už vo Fakteri je (odfotený vodičom), sa nájde
       podľa dňa a sumy a označí ako možná duplicita — nemaže sa nič.
*/

import { poskytovatel as metaPoskytovatela } from "./register";
import type { KartaFaktura, KartaTransakcia } from "./typy";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ------------------------------------------------------------- sumy */

/**
 * Suma bez DPH a s DPH z dvoch súm, ktorých poradie nie je isté. Shell volá
 * sumu bez DPH „Gross“ a s DPH „Net“, iní naopak — rozhoduje veľkosť.
 */
export function rozdelSumy(
  a: number | null,
  b: number | null,
  dan: number | null,
): { zaklad: number; dph: number; spolu: number } {
  const A = a == null ? null : Math.abs(a);
  const B = b == null ? null : Math.abs(b);
  const T = dan == null ? null : Math.abs(dan);
  if (A == null && B == null) return { zaklad: 0, dph: r2(T ?? 0), spolu: r2(T ?? 0) };
  if (A == null || B == null || Math.abs(A - B) < 0.005) {
    const spolu = (A ?? B) as number;
    const dph = T ?? 0;
    return { zaklad: r2(spolu - dph), dph: r2(dph), spolu: r2(spolu) };
  }
  const spolu = Math.max(A, B);
  const zaklad = Math.min(A, B);
  return { zaklad: r2(zaklad), dph: r2(T ?? spolu - zaklad), spolu: r2(spolu) };
}

/* --------------------------------------------------------- čas, karta */

/** Posun Bratislavy voči UTC v daný deň ("+01:00" / "+02:00"). */
function posunBratislavy(datum: string, cas: string): string {
  const d = new Date(`${datum}T${cas}Z`);
  const casti = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Bratislava",
    timeZoneName: "shortOffset",
  }).formatToParts(d);
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(
    casti.find((c) => c.type === "timeZoneName")?.value ?? "",
  );
  if (!m) return "+01:00";
  return `${m[1]}${m[2].padStart(2, "0")}:${m[3] ?? "00"}`;
}

/** Miestny čas nákupu (Bratislava) ako ISO s posunom. */
export function casVBratislave(datum: string, cas: string): string {
  return `${datum}T${cas}${posunBratislavy(datum, cas)}`;
}

/** Číslo karty len s posledných 6 číslicami — celé sa neukladá nikde. */
export function maskaKarty(pan: unknown): string | null {
  const c = String(pan ?? "").replace(/\D/g, "");
  if (c.length < 4) return null;
  return `…${c.slice(-6)}`;
}

/** ŠPZ na porovnanie: veľké písmená bez medzier a pomlčiek ("BA-123 AB" → "BA123AB"). */
export function normalizujSpz(s: unknown): string {
  return String(s ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

/* ------------------------------------------------------------ vozidlá */

export type Vozidlo = {
  id: string;
  name?: string | null;
  license_plate?: string | null;
  odpocet_dph?: string | null;
  active?: boolean | null;
};
export type VazbaKarty = { karta: string; vehicle_id: string | null; rucne?: boolean | null };

/**
 * Vozidlo transakcie: väzba karty (ručne priradená alebo už nájdená) má
 * prednosť, inak ŠPZ, ktorú Shell nesie pri karte. Pri zhode ŠPZ na viac
 * vozidiel sa nepriradí nič — radšej nič ako zlé auto.
 */
export function vozidloTransakcie(
  t: Pick<KartaTransakcia, "karta" | "spz">,
  vazby: Map<string, VazbaKarty>,
  vozidla: Vozidlo[],
): string | null {
  const v = t.karta ? vazby.get(t.karta) : undefined;
  if (v?.vehicle_id) return v.vehicle_id;
  if (v?.rucne) return null; // človek kartu zámerne nechal bez vozidla
  return vozidloPodlaSpz(t.spz, vozidla);
}

export function vozidloPodlaSpz(spz: unknown, vozidla: Vozidlo[]): string | null {
  const n = normalizujSpz(spz);
  if (n.length < 4) return null;
  const zhody = vozidla.filter((v) => normalizujSpz(v.license_plate) === n);
  return zhody.length === 1 ? zhody[0].id : null;
}

/* ---------------------------------------------------------- tankovanie */

/** Je množstvo v litroch? (kWh z nabíjania ani kusy do tankovaní nepatria.) */
export function jeVLitroch(jednotka: string | null): boolean {
  const j = String(jednotka ?? "")
    .trim()
    .toUpperCase();
  return !j || /^(L|LT|LTR|LTRS|LITRE|LITRES|LITER|LITERS|LITRE\(S\))$/.test(j);
}

/** Riadok `fuel_records` z transakcie, alebo null (nie palivo, bez vozidla, dobropis). */
export function tankovanieZTransakcie(
  t: KartaTransakcia,
  o: { companyId: string; vehicleId: string | null; zdroj: string },
): Record<string, unknown> | null {
  if (!o.vehicleId || !t.jePalivo || t.dobropis) return null;
  if (!jeVLitroch(t.jednotka)) return null;
  const litre = Number(t.mnozstvo);
  if (!Number.isFinite(litre) || litre <= 0 || litre > 10000) return null;
  const spolu = Math.abs(t.spolu);
  return {
    company_id: o.companyId,
    vehicle_id: o.vehicleId,
    fuel_date: t.datum,
    liters: r2(litre),
    price_per_liter: Math.round((spolu / litre) * 1000) / 1000,
    total_amount: r2(spolu),
    station_name: t.miesto ? t.miesto.slice(0, 120) : null,
    receipt_number: null,
    external_source: o.zdroj,
    external_id: t.externeId,
    imported_at: new Date().toISOString(),
    odometer_km: t.tachometerKm,
    raw_provider_data: {
      produkt: t.produkt,
      karta: t.karta,
      spz: t.spz,
      vodic: t.vodic,
      mena: t.mena,
      faktura: t.fakturaCislo,
    },
  };
}

export type ExistujuceTankovanie = {
  id: string;
  vehicle_id: string;
  fuel_date: string;
  liters: number;
  external_source?: string | null;
};

/**
 * To isté tankovanie už zapísané inou cestou (GPS jednotka, Commander, ručne)?
 * Rovnaké vozidlo, deň a litre (±1 %, najmenej ±0,5 l) — vtedy sa nový
 * záznam nezakladá, transakcia sa len prepojí.
 */
export function existujuceTankovanie(
  r: Record<string, unknown>,
  zoznam: ExistujuceTankovanie[],
): string | null {
  const l = Number(r.liters);
  const tol = Math.max(0.5, l * 0.01);
  const z = zoznam.find(
    (x) =>
      x.vehicle_id === r.vehicle_id &&
      x.fuel_date === r.fuel_date &&
      x.external_source !== r.external_source &&
      Math.abs(Number(x.liters) - l) <= tol,
  );
  return z?.id ?? null;
}

/* ------------------------------------------------------------- bločky */

export type BlocekNaPorovnanie = {
  id: string;
  issue_date: string | null;
  total_amount: number | null;
};

/**
 * Bločky z pumpy, ktoré zodpovedajú nákupu kartou (ten istý deň, tá istá
 * suma s DPH na cent). Nákup s viacerými riadkami (nafta + AdBlue) sa
 * porovnáva ako celok, lebo pumpa dá jeden bloček. Každý bloček sa použije
 * najviac raz. Vráti mapu externeId transakcie → id bločku.
 */
export function duplicitneBlocky(
  transakcie: Pick<KartaTransakcia, "externeId" | "nakupId" | "datum" | "spolu" | "dobropis">[],
  blocky: BlocekNaPorovnanie[],
): Map<string, string> {
  const nakupy = new Map<string, { datum: string; spolu: number; idcka: string[] }>();
  for (const t of transakcie) {
    if (t.dobropis) continue;
    const k = `${t.datum}|${t.nakupId ?? t.externeId}`;
    const n = nakupy.get(k) ?? { datum: t.datum, spolu: 0, idcka: [] };
    n.spolu = r2(n.spolu + Math.abs(t.spolu));
    n.idcka.push(t.externeId);
    nakupy.set(k, n);
  }
  const pouzite = new Set<string>();
  const out = new Map<string, string>();
  for (const n of nakupy.values()) {
    if (n.spolu <= 0) continue;
    const b = blocky.find(
      (x) =>
        !pouzite.has(x.id) &&
        x.issue_date === n.datum &&
        Math.abs(Math.abs(Number(x.total_amount ?? 0)) - n.spolu) <= 0.01,
    );
    if (!b) continue;
    pouzite.add(b.id);
    for (const id of n.idcka) out.set(id, b.id);
  }
  return out;
}

/* ----------------------------------------------------- prijatá faktúra */

export type TransakciaNaFakturu = KartaTransakcia & { vehicle_id: string | null };

export type KontextFaktury = {
  companyId: string;
  /** Krajina firmy (SK/CZ…) — DPH inej krajiny sa doma neodpočíta. */
  krajinaFirmy: string;
  poskytovatel: string;
  dodavatelIco?: string | null;
  dodavatelDic?: string | null;
  vozidla: Vozidlo[];
  dnes: string;
};

export type NavrhPrijatej = {
  riadok: Record<string, unknown>;
  naKontrolu: boolean;
  poznamky: string[];
};

const STANDARDNE_SADZBY = [0, 5, 7, 9, 10, 12, 13, 15, 19, 20, 21, 23, 25, 27];

/** Sadzba zo základu a DPH, prichytená k bežnej sadzbe, alebo null. */
export function sadzbaZoSum(zaklad: number, dph: number): number | null {
  if (Math.abs(zaklad) < 0.01) return Math.abs(dph) < 0.01 ? 0 : null;
  const s = (dph / zaklad) * 100;
  const najblizsia = STANDARDNE_SADZBY.reduce((a, b) =>
    Math.abs(b - s) < Math.abs(a - s) ? b : a,
  );
  return Math.abs(najblizsia - s) <= 0.6 ? najblizsia : null;
}

function nazovVozidla(v: Vozidlo | undefined): string {
  if (!v) return "";
  return [v.name, v.license_plate ? `(${v.license_plate})` : ""].filter(Boolean).join(" ");
}

/**
 * Prijatá faktúra z faktúry vydavateľa karty s rozpisom nákupov.
 *
 * - Riadok = nákup (dátum, produkt, ŠPZ/karta, pumpa), cena bez DPH a sadzba.
 * - Nákup so zahraničnou DPH ide celou sumou so sadzbou 0 % — doma sa
 *   neodpočíta (vracia sa len žiadosťou o vrátenie DPH v inom štáte).
 * - Čo faktúra obsahuje navyše (poplatky za kartu, mýto, zaokrúhlenie),
 *   dorovná jeden riadok, aby suma sedela s faktúrou na cent.
 * - Vozidlo sa vyplní, len keď sú všetky nákupy z jedného auta — vtedy sa
 *   50 % odpočet DPH (§ 85n) rozdelí sám. Viac áut s kráteným odpočtom ide
 *   na kontrolu (interná poznámka) s rozpisom po autách.
 */
export function prijataZFaktury(
  f: KartaFaktura,
  transakcie: TransakciaNaFakturu[],
  k: KontextFaktury,
): NavrhPrijatej {
  const poznamky: string[] = [];
  let naKontrolu = false;
  const domaca = (k.krajinaFirmy || "SK").toUpperCase();
  const items: Record<string, unknown>[] = [];
  let zakladSpolu = 0;
  let dphSpolu = 0;
  let sumaSpolu = 0;
  let zahranicnaDph = 0;
  const poVozidlach = new Map<string, number>();
  const vozidla = new Map(k.vozidla.map((v) => [v.id, v]));

  const zoradene = [...transakcie].sort((a, b) => a.cas.localeCompare(b.cas));
  for (const t of zoradene) {
    const krajinaDph = (t.krajinaDph ?? t.krajina ?? domaca).toUpperCase();
    const cudzia = krajinaDph !== domaca && Math.abs(t.dph) >= 0.005;
    const mnozstvo = t.mnozstvo && t.mnozstvo > 0 ? r2(t.mnozstvo) : 1;
    const kto = t.spz || t.karta || "";
    const nazov = [
      t.datum.split("-").reverse().join(". "),
      t.produkt || "Nákup kartou",
      kto,
      t.miesto,
      cudzia ? `DPH ${krajinaDph} ${t.sadzbaDph ?? ""} % bez odpočtu`.replace("  ", " ") : null,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 500);
    const zaklad = cudzia ? t.spolu : t.zaklad;
    const dph = cudzia ? 0 : t.dph;
    const sadzba = cudzia ? 0 : (t.sadzbaDph ?? sadzbaZoSum(t.zaklad, t.dph) ?? 0);
    if (cudzia) zahranicnaDph = r2(zahranicnaDph + t.dph);
    items.push({
      name: nazov,
      quantity: mnozstvo,
      unit: jeVLitroch(t.jednotka) && t.jePalivo ? "l" : (t.jednotka?.toLowerCase() ?? null),
      unit_price: Math.round((zaklad / mnozstvo) * 10000) / 10000,
      vat_rate: sadzba,
      total: r2(zaklad + dph),
    });
    zakladSpolu = r2(zakladSpolu + zaklad);
    dphSpolu = r2(dphSpolu + dph);
    sumaSpolu = r2(sumaSpolu + zaklad + dph);
    const vid = t.vehicle_id ?? "";
    poVozidlach.set(vid, r2((poVozidlach.get(vid) ?? 0) + zaklad));
  }

  if (zahranicnaDph !== 0) {
    poznamky.push(
      `Zahraničná DPH ${zahranicnaDph.toFixed(2)} ${f.mena} je v nákladoch — doma sa neodpočíta, dá sa žiadať jej vrátenie v štáte nákupu.`,
    );
  }

  // Dorovnanie na hlavičku faktúry (poplatky, mýto, zaokrúhlenie).
  const rozdielSpolu = r2(f.spolu - sumaSpolu);
  if (!transakcie.length) {
    naKontrolu = true;
    poznamky.push("K faktúre neprišli jednotlivé nákupy — rozpis doplňte podľa PDF faktúry.");
  }
  if (Math.abs(rozdielSpolu) >= 0.01) {
    const rozdielDph = r2(f.dph - zahranicnaDph - dphSpolu);
    const rozdielZaklad = r2(rozdielSpolu - rozdielDph);
    let sadzba = sadzbaZoSum(rozdielZaklad, rozdielDph);
    let zaklad = rozdielZaklad;
    let dph = rozdielDph;
    if (sadzba === null) {
      // DPH sa nedá rozumne priradiť — celý rozdiel ako suma bez DPH a na kontrolu.
      sadzba = 0;
      zaklad = rozdielSpolu;
      dph = 0;
      naKontrolu = true;
      poznamky.push(
        `Rozdiel ${rozdielSpolu.toFixed(2)} ${f.mena} oproti nákupom (DPH ${rozdielDph.toFixed(2)}) sa nedal priradiť k sadzbe — skontrolujte podľa faktúry.`,
      );
    }
    items.push({
      name: transakcie.length
        ? "Poplatky a ostatné položky podľa faktúry"
        : `Nákupy palivovou kartou podľa faktúry ${f.cislo}`,
      quantity: 1,
      unit: null,
      unit_price: zaklad,
      vat_rate: sadzba,
      total: r2(zaklad + dph),
    });
    zakladSpolu = r2(zakladSpolu + zaklad);
    dphSpolu = r2(dphSpolu + dph);
    sumaSpolu = r2(sumaSpolu + zaklad + dph);
  }

  // Vozidlo dokladu — len keď sú všetky nákupy z jedného auta.
  const idVozidiel = [...poVozidlach.keys()];
  const jedno = idVozidiel.length === 1 && idVozidiel[0] ? idVozidiel[0] : null;
  const viacAut =
    idVozidiel.filter(Boolean).length > 1 || (idVozidiel.length > 1 && idVozidiel.includes(""));
  if (viacAut) {
    const kratene = idVozidiel.filter((id) => {
      const o = vozidla.get(id)?.odpocet_dph;
      return o === "50" || o === "0";
    });
    const rozpis = idVozidiel
      .map(
        (id) =>
          `${id ? nazovVozidla(vozidla.get(id)) || "vozidlo" : "bez vozidla"}: ${(poVozidlach.get(id) ?? 0).toFixed(2)}`,
      )
      .join("; ");
    poznamky.push(`Nákupy podľa vozidiel (bez DPH, ${f.mena}): ${rozpis}.`);
    if (kratene.length) {
      naKontrolu = true;
      poznamky.push(
        "Na faktúre sú aj vozidlá s kráteným odpočtom DPH (50 % alebo bez odpočtu) — rozúčtujte DPH podľa vozidiel.",
      );
    }
  }

  if (f.typ && !/^original$/i.test(f.typ)) {
    naKontrolu = true;
    poznamky.push(`Doklad typu ${f.typ} — opravuje skoršiu faktúru, skontrolujte ju.`);
  }
  if (f.dobropis) {
    naKontrolu = true;
    poznamky.push("Dobropis od vydavateľa karty.");
  }

  const dodanie = zoradene.length ? zoradene[zoradene.length - 1].datum : f.datum;
  const riadok: Record<string, unknown> = {
    company_id: k.companyId,
    supplier_name: f.dodavatel.nazov || "Shell",
    supplier_ico: String(k.dodavatelIco ?? "").replace(/\D/g, "") || null,
    supplier_country: f.dodavatel.krajina?.toUpperCase() || null,
    ...(k.dodavatelDic ? { supplier_dic: String(k.dodavatelDic).trim() } : {}),
    invoice_number: f.cislo,
    issue_date: f.datum,
    delivery_date: dodanie > f.datum ? f.datum : dodanie,
    received_date: k.dnes,
    due_date: f.splatnost ?? f.datum,
    currency: f.mena,
    amount_without_vat: zakladSpolu,
    vat_amount: dphSpolu,
    amount_total: sumaSpolu,
    items,
    status: "received",
    source: "import",
    external_id: `${k.poskytovatel}:faktura:${f.externeId}`,
    vehicle_id: jedno,
    payment_method: "prevod",
    odpocet: true,
    note: `Palivová karta ${metaPoskytovatela(k.poskytovatel)?.nazov ?? k.poskytovatel} — nákupov: ${transakcie.length}.`,
    // Upozornenia idú do internej poznámky; `na_kontrolu_at` patrí eFaktúram (text o Peppole).
    int_poznamka: poznamky.length
      ? `${naKontrolu ? "Skontrolovať: " : ""}${poznamky.join("\n")}`.slice(0, 4000)
      : null,
  };
  return { riadok, naKontrolu, poznamky };
}
