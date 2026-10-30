/**
 * Kurzy ECB — sťahovanie a pamäť.
 *
 * Kurzy sú verejné a nemenia sa spätne, takže sa raz stiahnu a uložia do
 * `exchange_rates`. Bez pamäte by každé generovanie PDF chodilo na ECB a pri
 * hromadnom vývoze faktúr by to bolo niekoľko desiatok volaní na jeden klik.
 */

import { XMLParser } from "fast-xml-parser";
import {
  denKurzu,
  kurzKDatumu,
  kurzyZBmfCsv,
  mesiacBmf,
  naDomacu,
  nastavenieKurzuDe,
  type KrajinaKurzu,
  type Kurz,
  type KurzBmf,
  type NastavenieKurzuDe,
  type ZdrojKurzu,
} from "./kurzy";

import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
const DENNE = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const POSLEDNYCH_90 = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
const CELA_HISTORIA = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

/** Rozparsuje ktorýkoľvek z troch súborov ECB — líšia sa len počtom dní. */
export function kurzyZXml(xml: string): Kurz[] {
  const data: any = parser.parse(xml);
  const kocky = data?.["gesmes:Envelope"]?.Cube?.Cube;
  const dni = Array.isArray(kocky) ? kocky : kocky ? [kocky] : [];
  const von: Kurz[] = [];
  for (const den of dni) {
    const datum = String(den?.time ?? "");
    const riadky = Array.isArray(den?.Cube) ? den.Cube : den?.Cube ? [den.Cube] : [];
    for (const r of riadky) {
      const mena = String(r?.currency ?? "").toUpperCase();
      const kurz = Number(r?.rate);
      if (datum && mena && Number.isFinite(kurz) && kurz > 0) von.push({ den: datum, mena, kurz });
    }
  }
  return von;
}

async function stiahni(url: string): Promise<Kurz[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`ECB ${res.status}`);
  return kurzyZXml(await res.text());
}

async function uloz(kurzy: Kurz[]): Promise<void> {
  if (!kurzy.length) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Po dávkach — celá história má vyše 1,5 milióna riadkov a naraz by neprešla.
  for (let i = 0; i < kurzy.length; i += 1000) {
    const { error } = await supabaseAdmin
      .from("exchange_rates")
      .upsert(kurzy.slice(i, i + 1000), { onConflict: "den,mena" });
    if (error) {
      console.warn("[kurzy] zápis zlyhal:", error.message);
      return;
    }
  }
}

/**
 * Kurz pre menu ku dňu dodania (teda kurz zo dňa predtým).
 *
 * Najprv sa hľadá v databáze, potom sa dopĺňa z ECB — najskôr posledných
 * 90 dní, a až keď ide o starší doklad, celá história.
 */
export async function kurzPreDoklad(
  mena: string,
  datumDodania: string,
  krajina: KrajinaKurzu = "SK",
  /** Nemecká firma — jej voľba kurzu (`companies.kurz_de_zdroj`); null = nie je DE. */
  nastavenieDe: NastavenieKurzuDe | null = null,
): Promise<{ kurz: number; den: string; zdroj: ZdrojKurzu } | null> {
  if (krajina === "CZ") {
    const k = await kurzCnb(mena, datumDodania);
    return k ? { ...k, zdroj: "cnb" } : null;
  }
  if (nastavenieDe) return kurzPreDokladDe(mena, datumDodania, nastavenieDe);
  const k = await kurzEcb(mena, denKurzu(datumDodania));
  return k ? { ...k, zdroj: "ecb" } : null;
}

/** Posledný kurz ECB najneskôr v deň `hranica` — z pamäte, inak z ECB. */
async function kurzEcb(
  mena: string,
  hranica: string,
): Promise<{ kurz: number; den: string } | null> {
  const m = String(mena).toUpperCase();
  if (!m || m === "EUR") return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const zDb = async () => {
    const { data } = await supabaseAdmin
      .from("exchange_rates")
      .select("den, mena, kurz")
      .eq("mena", m)
      .lte("den", hranica)
      .order("den", { ascending: false })
      .limit(1);
    const r = (data ?? [])[0];
    return r ? { kurz: Number(r.kurz), den: String(r.den) } : null;
  };

  const najdene = await zDb();
  /*
    ECB nevydáva kurz cez víkend a sviatky — najdlhšia medzera je Veľká noc
    (štvrtok → utorok). Starší kurz v pamäti znamená, že chýbajú čerstvé dni,
    nie že kurz neexistuje. Pri tolerancii 14 dní sa na faktúru z 5. 10.
    dostal kurz z 23. 9., lebo pamäť sa dopĺňa len pri doklade.
  */
  if (najdene && rozdielDni(najdene.den, hranica) <= 5) return najdene;

  for (const url of [POSLEDNYCH_90, CELA_HISTORIA]) {
    try {
      const stiahnute = await stiahni(url);
      await uloz(stiahnute);
      const zo = kurzKDatumu(stiahnute, m, hranica);
      if (zo) return { kurz: zo.kurz, den: zo.den };
    } catch (e) {
      console.warn("[kurzy] ECB nedostupná:", String((e as Error)?.message ?? e));
    }
  }
  return najdene;
}

function rozdielDni(a: string, b: string): number {
  return Math.abs(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

/**
 * Prepočet dokladu na domácu menu firmy — vráti kurz aj prepočítané sumy.
 * Slovenská firma → eurá (ECB), česká → koruny (ČNB).
 */
export async function prepocitajDoklad(
  mena: string,
  datumDodania: string,
  sumy: { zaklad: number; dan: number; celkom: number },
  krajina: KrajinaKurzu = "SK",
  nastavenieDe: NastavenieKurzuDe | null = null,
): Promise<{
  kurz: number;
  den: string;
  zdroj: ZdrojKurzu;
  zaklad: number;
  dan: number;
  celkom: number;
} | null> {
  const k = await kurzPreDoklad(mena, datumDodania, krajina, nastavenieDe);
  if (!k) return null;
  return {
    kurz: k.kurz,
    den: k.den,
    zdroj: k.zdroj,
    zaklad: naDomacu(sumy.zaklad, k.kurz, krajina),
    dan: naDomacu(sumy.dan, k.kurz, krajina),
    celkom: naDomacu(sumy.celkom, k.kurz, krajina),
  };
}

/** Krajina firmy kvôli prepočtu — podľa nej domáca mena a banka kurzu. */
export async function krajinaFirmy(companyId: string): Promise<KrajinaKurzu> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("companies")
    .select("country")
    .eq("id", companyId)
    .maybeSingle();
  const { krajinaKurzu } = await import("./kurzy");
  return krajinaKurzu(data?.country);
}

/**
 * Pravidlo kurzu firmy: krajina (SK/CZ — podľa nej domáca mena a zápis kurzu)
 * a pri nemeckej firme jej voľba BMF / denný kurz ECB. Doklady nemeckej
 * firmy sú v eurách ako slovenské, preto `krajina` ostáva „SK“.
 */
export async function pravidloKurzuFirmy(
  companyId: string,
): Promise<{ krajina: KrajinaKurzu; nastavenieDe: NastavenieKurzuDe | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("companies")
    .select("country, kurz_de_zdroj")
    .eq("id", companyId)
    .maybeSingle();
  const { krajinaKurzu } = await import("./kurzy");
  const { krajinaDane } = await import("./vat-rates");
  return {
    krajina: krajinaKurzu(data?.country),
    nastavenieDe:
      krajinaDane(data?.country) === "DE" ? nastavenieKurzuDe(data?.kurz_de_zdroj) : null,
  };
}

/* ─── BMF (nemecké firmy) ─────────────────────────────────────────────── */

/*
  Dátový portál BMF má ročný CSV so všetkými mesiacmi roka („Monatlich
  fortgeschriebene Übersicht“), dopĺňa sa začiatkom každého mesiaca. Adresa
  je stála; parameter `v` v odkazoch na webe je len verzia a dá sa vynechať.
  Kódovanie je ISO-8859-1 (hlavička servera tvrdí UTF-8) — kódy mien a čísla
  sú ASCII, takže na tom nezáleží.
*/
const BMF_CSV = (rok: number) =>
  `https://www.bundesfinanzministerium.de/Datenportal/Daten/offene-daten/steuern-zoelle/umsatzsteuer-umrechnungskurse/datensaetze/uu-kurse-${rok}-csv.csv?__blob=publicationFile`;

export async function stiahniKurzyBmf(rok: number): Promise<KurzBmf[]> {
  const res = await fetch(BMF_CSV(rok), { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`BMF ${res.status}`);
  const text = new TextDecoder("latin1").decode(await res.arrayBuffer());
  return kurzyZBmfCsv(text, rok);
}

async function ulozBmf(kurzy: KurzBmf[]): Promise<void> {
  if (!kurzy.length) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any)
    .from("kurzy_bmf")
    .upsert(kurzy, { onConflict: "mesiac,mena" });
  if (error) console.warn("[kurzy-bmf] zápis zlyhal:", error.message);
}

async function kurzBmfZDb(mena: string, mesiac: string): Promise<number | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("kurzy_bmf")
    .select("kurz")
    .eq("mena", mena)
    .eq("mesiac", mesiac)
    .maybeSingle();
  const k = Number(data?.kurz);
  return k > 0 ? k : null;
}

/** Nemecká firma: BMF za mesiac dodania, inak ECB z dňa dodania. */
async function kurzPreDokladDe(
  mena: string,
  datumDodania: string,
  nastavenie: NastavenieKurzuDe,
): Promise<{ kurz: number; den: string; zdroj: ZdrojKurzu } | null> {
  const m = String(mena).toUpperCase();
  if (!m || m === "EUR") return null;
  if (nastavenie === "bmf") {
    const mesiac = mesiacBmf(datumDodania);
    let k = await kurzBmfZDb(m, mesiac);
    // Mesiac už skončil, ale v pamäti nie je — skúsi sa portál BMF.
    if (!k && mesiac < mesiacBmf(dnesBratislava())) {
      try {
        const stiahnute = await stiahniKurzyBmf(Number(mesiac.slice(0, 4)));
        await ulozBmf(stiahnute);
        k = stiahnute.find((x) => x.mesiac === mesiac && x.mena === m)?.kurz ?? null;
      } catch (e) {
        console.warn("[kurzy-bmf] BMF nedostupné:", String((e as Error)?.message ?? e));
      }
    }
    if (k) return { kurz: k, den: mesiac, zdroj: "bmf" };
  }
  const e = await kurzEcb(m, datumDodania);
  if (!e) return null;
  return { ...e, zdroj: nastavenie === "bmf" ? "ecb_predbezne" : "ecb_tageskurs" };
}

/**
 * Kurzy BMF do pamäte — z denného cronu kurzov (hook `kurzy-ecb`). Súbor je
 * malý (jeden riadok na menu), sťahuje sa celý bežný rok, v januári aj
 * predošlý (decembrový kurz vychádza až v januári). Po uložení prepočíta
 * doklady, ktoré čakali na kurz BMF.
 */
export async function stiahniKurzyBmfDoPamate(): Promise<{ kurzov: number; prepocitane: number }> {
  const teraz = new Date();
  const roky = [teraz.getUTCFullYear()];
  if (teraz.getUTCMonth() === 0) roky.unshift(teraz.getUTCFullYear() - 1);
  let kurzov = 0;
  for (const rok of roky) {
    const k = await stiahniKurzyBmf(rok);
    await ulozBmf(k);
    kurzov += k.length;
  }
  const prepocitane = await prepocitajPredbezneNaBmf().catch((e) => {
    console.warn("[kurzy-bmf] prepočet dokladov:", String(e?.message ?? e));
    return 0;
  });
  return { kurzov, prepocitane };
}

/**
 * Doklady nemeckých firiem prepočítané predbežne kurzom ECB (`ecb_predbezne`)
 * dostanú kurz BMF, len čo je zverejnený. Mení sa iba prepočet do eur
 * (kurz, dátum kurzu, `*_eur`) — sumy v mene dokladu ostávajú. Doklad v
 * uzamknutom období zámok odmietne; ten ostane na ECB a vypíše sa do logu.
 */
export async function prepocitajPredbezneNaBmf(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const cache = new Map<string, number | null>();
  const kurzBmf = async (mena: string, mesiac: string) => {
    const kluc = `${mena}|${mesiac}`;
    if (!cache.has(kluc)) cache.set(kluc, await kurzBmfZDb(mena, mesiac));
    return cache.get(kluc) ?? null;
  };
  const r2 = (n: number) => Math.round(n * 100) / 100;
  let pocet = 0;
  // Len doklady z mesiacov, ktoré už skončili — za bežný mesiac kurz BMF ešte nie je.
  const zaciatokMesiaca = mesiacBmf(dnesBratislava());
  const skonceny = `delivery_date.lt.${zaciatokMesiaca},and(delivery_date.is.null,issue_date.lt.${zaciatokMesiaca})`;

  const { data: faktury } = await db
    // aj-zmazane: doplnenie konečného kurzu — oprava údaja neškodí ani dokladu v koši
    .from("invoices")
    .select("id, currency, issue_date, delivery_date, subtotal, vat_total, total")
    .eq("exchange_rate_source", "ecb_predbezne")
    .or(skonceny)
    .limit(1000);
  for (const f of (faktury ?? []) as any[]) {
    const mesiac = mesiacBmf(String(f.delivery_date || f.issue_date));
    const k = await kurzBmf(String(f.currency).toUpperCase(), mesiac);
    if (!k) continue;
    const { error } = await db
      .from("invoices")
      .update({
        exchange_rate: k,
        exchange_rate_date: mesiac,
        exchange_rate_source: "bmf",
        subtotal_eur: r2(Number(f.subtotal ?? 0) / k),
        vat_total_eur: r2(Number(f.vat_total ?? 0) / k),
        total_eur: r2(Number(f.total ?? 0) / k),
      })
      .eq("id", f.id)
      .eq("exchange_rate_source", "ecb_predbezne");
    if (error) console.warn("[kurzy-bmf] faktúra", f.id, error.message);
    else pocet++;
  }

  const { data: prijate } = await db
    // aj-zmazane: doplnenie konečného kurzu — oprava údaja neškodí ani dokladu v koši
    .from("purchase_invoices")
    .select("id, currency, issue_date, delivery_date, amount_without_vat, vat_amount")
    .eq("exchange_rate_source", "ecb_predbezne")
    .or(skonceny)
    .limit(1000);
  for (const f of (prijate ?? []) as any[]) {
    const mesiac = mesiacBmf(String(f.delivery_date || f.issue_date));
    const k = await kurzBmf(String(f.currency).toUpperCase(), mesiac);
    if (!k) continue;
    const { error } = await db
      .from("purchase_invoices")
      .update({
        exchange_rate: k,
        exchange_rate_source: "bmf",
        amount_without_vat_eur: r2(Number(f.amount_without_vat ?? 0) / k),
        vat_amount_eur: r2(Number(f.vat_amount ?? 0) / k),
      })
      .eq("id", f.id)
      .eq("exchange_rate_source", "ecb_predbezne");
    if (error) console.warn("[kurzy-bmf] prijatá faktúra", f.id, error.message);
    else pocet++;
  }
  return pocet;
}

/* ─── ČNB ─────────────────────────────────────────────────────────────── */

const CNB_ROK =
  "https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/rok.txt";

/**
 * Ročný súbor ČNB: hlavička `Datum|1 AUD|…|100 HUF|…`, riadky `02.01.2026|13,797|…`.
 * Kurz sa ukladá prepočítaný na 1 jednotku meny.
 */
export function kurzyZCnbRoka(text: string): Kurz[] {
  const riadky = text.split(/\r?\n/).filter((r) => r.trim());
  const von: Kurz[] = [];
  let hlavicka: { mena: string; mnozstvo: number }[] = [];
  for (const r of riadky) {
    const bunky = r.split("|");
    if (/^Datum/i.test(bunky[0])) {
      // Rok môže mať viac hlavičiek (zmena zoznamu mien uprostred roka).
      hlavicka = bunky.slice(1).map((b) => {
        const [mnoz, mena] = b.trim().split(/\s+/);
        return { mena: String(mena ?? "").toUpperCase(), mnozstvo: Number(mnoz) || 1 };
      });
      continue;
    }
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(bunky[0].trim());
    if (!m) continue;
    const den = `${m[3]}-${m[2]}-${m[1]}`;
    bunky.slice(1).forEach((b, i) => {
      const h = hlavicka[i];
      const hodnota = Number(String(b).trim().replace(",", "."));
      if (h?.mena && Number.isFinite(hodnota) && hodnota > 0) {
        von.push({ den, mena: h.mena, kurz: Math.round((hodnota / h.mnozstvo) * 1e6) / 1e6 });
      }
    });
  }
  return von;
}

async function stiahniCnbRok(rok: number): Promise<Kurz[]> {
  const res = await fetch(`${CNB_ROK}?rok=${rok}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`ČNB ${res.status}`);
  return kurzyZCnbRoka(await res.text());
}

async function ulozCnb(kurzy: Kurz[]): Promise<void> {
  if (!kurzy.length) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  for (let i = 0; i < kurzy.length; i += 1000) {
    const { error } = await supabaseAdmin
      .from("kurzy_cnb" as any)
      .upsert(kurzy.slice(i, i + 1000) as any, { onConflict: "den,mena" });
    if (error) {
      console.warn("[kurzy-cnb] zápis zlyhal:", error.message);
      return;
    }
  }
}

/**
 * Kurz ČNB („CZK za 1 jednotku“) platný v deň plnenia — posledný vyhlásený
 * najneskôr v ten deň (cez víkend a sviatky piatkový).
 */
export async function kurzCnb(
  mena: string,
  datumPlnenia: string,
): Promise<{ kurz: number; den: string } | null> {
  const m = String(mena).toUpperCase();
  if (!m || m === "CZK") return null;
  const hranica = denKurzu(datumPlnenia, "CZ");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const zDb = async () => {
    const { data } = await supabaseAdmin
      .from("kurzy_cnb" as any)
      .select("den, mena, kurz")
      .eq("mena", m)
      .lte("den", hranica)
      .order("den", { ascending: false })
      .limit(1);
    const r = ((data ?? []) as any[])[0];
    return r ? { kurz: Number(r.kurz), den: String(r.den) } : null;
  };
  const najdene = await zDb();
  if (najdene && rozdielDni(najdene.den, hranica) <= 5) return najdene;

  const rok = Number(hranica.slice(0, 4));
  // Začiatkom januára môže platiť ešte decembrový kurz — preto aj predošlý rok.
  for (const r of [rok, rok - 1]) {
    try {
      const stiahnute = await stiahniCnbRok(r);
      await ulozCnb(stiahnute);
      const zo = kurzKDatumu(stiahnute, m, hranica);
      if (zo) return { kurz: zo.kurz, den: zo.den };
    } catch (e) {
      console.warn("[kurzy-cnb] ČNB nedostupná:", String((e as Error)?.message ?? e));
    }
  }
  return najdene;
}

/** Denné kurzy ČNB do pamäte — z cronu spolu s ECB. */
export async function stiahniDenneKurzyCnb(): Promise<number> {
  const kurzy = await stiahniCnbRok(new Date().getUTCFullYear());
  // Stačí posledný týždeň, zvyšok roka už v pamäti je.
  const hranica = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10);
  const nove = kurzy.filter((k) => k.den >= hranica);
  await ulozCnb(nove);
  return nove.length;
}

/** Denné kurzy do pamäte — volá ich cron `faktero-kurzy-ecb` (hook `kurzy-ecb`). */
export async function stiahniDenneKurzy(): Promise<number> {
  const kurzy = await stiahni(DENNE);
  await uloz(kurzy);
  return kurzy.length;
}
